use soroban_sdk::{
    contract, contractimpl, contracttype, vec, Address, BytesN, Env, String, Symbol, Vec,
};

use crate::ballot::{validate_ballot, VoteChoice};
use crate::constitution::{
    total_prize_amount, validate_prize_tiers, Constitution, Deadline, PrizeTier, TeamPolicy,
    TieBreakRule, Track,
};
use crate::errors::Error;
use crate::events;
use crate::hashing::{self, hash_constitution};
use crate::merkle;
use crate::organizers::OrganizingTeam;
use crate::phase::Phase;
use crate::results::{self, Candidate, NoAwardCase, Placement};
use crate::roster::{Registration, Team};
use crate::scorecard::{CriterionScore, CriterionTally, ScoreTally, Scorecard};
use crate::sponsorship::{Split, SponsorTrack, Sponsorship, TrackStatus, MAX_SPONSORSHIPS};
use crate::state::{CancellationCase, ExtensionUsage, HackathonState};
use crate::storage;
use crate::submission::{DisqualificationCase, Submission};
use crate::vault::VaultClient;

/// The authority for a single hackathon.
#[contract]
pub struct HackathonCore;

#[contractimpl]
impl HackathonCore {
    /// Creates a hackathon in draft, with its first version of the rules.
    //
    // The rules are validated immediately rather than at the lock. A draft
    // that cannot become a valid hackathon is not worth the ledger space, and
    // an organizer discovers the problem while they are still editing rather
    // than at the moment they meant to publish.
    pub fn create(env: Env, organizer: Address, constitution: Constitution) -> Result<(), Error> {
        if storage::is_initialized(&env) {
            return Err(Error::AlreadyInitialized);
        }

        organizer.require_auth();
        constitution.validate()?;

        storage::save_organizing_team(&env, &OrganizingTeam::new(&env, organizer.clone()));
        storage::save_state(&env, &HackathonState::draft(constitution.schedule.clone()));
        storage::save_constitution(&env, &constitution);

        events::hackathon_created(&env, &organizer);

        Ok(())
    }

    /// Replaces the draft rules.
    //
    // Only the organizer, and only while the hackathon is still a draft. The
    // phase check is what makes the lock mean anything: once the rules are
    // frozen this call has no path back in, no matter who signs it.
    pub fn configure(env: Env, constitution: Constitution) -> Result<(), Error> {
        let team = storage::load_organizing_team(&env)?;
        team.organizer.require_auth();

        let state = storage::load_state(&env)?;
        if !state.phase.is_configurable() {
            return Err(Error::RulesAlreadyLocked);
        }

        constitution.validate()?;

        storage::save_constitution(&env, &constitution);
        storage::save_state(
            &env,
            &HackathonState {
                phase: state.phase,
                schedule: constitution.schedule.clone(),
                settlement_paused: state.settlement_paused,
                finalized_at: state.finalized_at,
                settlement_opened_at: state.settlement_opened_at,
            },
        );

        events::hackathon_configured(&env, &team.organizer);

        Ok(())
    }

    /// Adds a helper who can work through the application queue.
    //
    // Unlike the rules, the collaborator list stays editable for the whole
    // event, because a hundred applications arriving at once is exactly when
    // an organizer needs another pair of hands and exactly when they cannot
    // wait for a new hackathon. The reach of that helper is narrow enough that
    // widening the list under pressure is safe.
    pub fn add_collaborator(env: Env, collaborator: Address) -> Result<(), Error> {
        let mut team = storage::load_organizing_team(&env)?;
        team.organizer.require_auth();

        team.add_collaborator(collaborator.clone())?;
        storage::save_organizing_team(&env, &team);

        events::collaborator_added(&env, &collaborator);

        Ok(())
    }

    /// Removes a helper.
    //
    // Applications they already decided stay decided. Reversing those would
    // mean a participant's admission could be revoked by an argument between
    // organizers, which is not a thing the participant can defend against.
    pub fn remove_collaborator(env: Env, collaborator: Address) -> Result<(), Error> {
        let mut team = storage::load_organizing_team(&env)?;
        team.organizer.require_auth();

        team.remove_collaborator(&collaborator)?;
        storage::save_organizing_team(&env, &team);

        events::collaborator_removed(&env, &collaborator);

        Ok(())
    }

    /// Freezes the rules and returns their digest.
    //
    // This is the one irreversible step of the setup path, and everything the
    // product promises rests on it. After this call the rules can be read by
    // anyone and written by no one, so a participant who reads the page before
    // they start building is reading the rules that will decide the result.
    pub fn lock_rules(env: Env) -> Result<BytesN<32>, Error> {
        let team = storage::load_organizing_team(&env)?;
        team.organizer.require_auth();

        freeze(&env)
    }

    /// Opens the hackathon, all of it, in one call.
    //
    // Six calls did this and each needed the one before it settled on chain
    // first: freeze the rules, put a vault up, tell it what it serves, bind it
    // here, move the prize in, publish. Soroban allows one contract call per
    // transaction, so that was six wallet prompts for what an organizer thinks
    // of as a single decision, and four of them are bookkeeping nobody asked
    // to know about.
    //
    // Nothing was loosened to fold them together. Every step below is the same
    // entry point with the same checks, refusing the same things; what changed
    // is that this contract runs them inside one invocation the organizer
    // authorizes once.
    //
    // Whatever is already done is skipped, so a run that failed halfway can be
    // pressed again and carries on from where it stopped.
    //
    // The vault's code is named by the caller, because this contract cannot
    // know a hash that did not exist when it was compiled. That is not a hole:
    // the vault it deploys is bound through `bind_vault` like any other, which
    // checks the binding from both sides and refuses a pool holding a token
    // the rules do not name. A salt that was used before belongs to a contract
    // that already exists, so a retry needs a fresh one.
    pub fn set_up(env: Env, vault_wasm: BytesN<32>, salt: BytesN<32>) -> Result<Address, Error> {
        let team = storage::load_organizing_team(&env)?;
        team.organizer.require_auth();

        /* The signature is checked once, above. `lock_rules` and `bind_vault`
        check it again for their own callers, and `require_auth` twice for
        one address in one frame is refused by the host as a duplicate
        authorization, so both hand their bodies to the helpers below and
        this path calls those. */
        if storage::load_state(&env)?.phase.is_configurable() {
            freeze(&env)?;
        }

        let vault = if storage::has_vault(&env) {
            storage::load_vault(&env)?
        } else {
            let asset = storage::load_constitution(&env)?.prize_asset;
            let deployed = env
                .deployer()
                .with_current_contract(salt)
                .deploy_v2(vault_wasm, ());

            VaultClient::new(&env, &deployed).create(&env.current_contract_address(), &asset);

            bind(&env, &deployed)?;

            deployed
        };

        /* Topped up to the requirement rather than deposited blindly, because
        anyone may have funded this pool already and a second full deposit
        would be the organizer paying the prize twice. */
        let required = storage::load_constitution(&env)?.required_funding()?;
        let client = VaultClient::new(&env, &vault);
        let held = client.balance();

        if held < required {
            client.deposit(&team.organizer, &(required - held));
        }

        Self::publish(env)?;

        Ok(vault)
    }

    /// Points the hackathon at the vault holding its prize.
    //
    // The binding is checked from both sides rather than taken on the
    // organizer's word. A vault serving a different hackathon, or holding a
    // different token from the one the rules name, is refused; otherwise an
    // organizer could point at a pool they control and publish a hackathon
    // whose prize was never really committed.
    pub fn bind_vault(env: Env, vault: Address) -> Result<(), Error> {
        let team = storage::load_organizing_team(&env)?;
        team.organizer.require_auth();

        bind(&env, &vault)
    }

    /// Opens the hackathon for registration and submissions.
    //
    // The funding check is the whole point of this call. A hackathon that
    // announces a prize it does not hold is the first problem the product set
    // out to remove, so the pool has to cover the prize table in full before
    // anybody can sign up. Anyone may call this once that is true; making it
    // the organizer's privilege would let them sit on a funded hackathon.
    pub fn publish(env: Env) -> Result<(), Error> {
        let state = storage::load_state(&env)?;
        if state.phase != Phase::Funding {
            return Err(Error::WrongPhase);
        }

        let required = storage::load_constitution(&env)?.required_funding()?;
        let funded = Self::funding(env.clone())?;

        if funded < required {
            return Err(Error::VaultUnderfunded);
        }

        storage::save_state(&env, &state.advance(env.ledger().timestamp())?);
        events::published(&env, funded, required);

        Ok(())
    }

    /// Adds outside money to a prize position that is already in the table.
    //
    // The vault has always taken deposits from anyone. What it could not do
    // was give that money a destination: prizes are paid from the frozen
    // table, so a sponsor's contribution sat in a pool no entry point could
    // move out again. This is the entry point that aims it somewhere, and the
    // position it names is paid the frozen amount plus everything sponsors put
    // behind it.
    //
    // The rules had to open this door before the lock. An organizer who left
    // `top_ups_allowed` false cannot change their mind once somebody has
    // started building, which is the same line every other discretionary power
    // in this contract sits behind.
    //
    // # What a sponsor is buying, and what they are not
    //
    // A bigger prize for whoever wins that position. Not a say in who that is:
    // the ranking is computed from scorecards and ballots that this call
    // cannot reach, and a sponsor learns who they paid at the same moment
    // everybody else does. The window closes at finalization for exactly that
    // reason — money arriving after the ranking is known would be money aimed
    // at a named person.
    //
    // # The fee
    //
    // Charged on top, as it is everywhere else in this contract. The sponsor
    // pays `amount + fee` and the position grows by `amount`, so the figure a
    // participant reads on the prize table is the figure that reaches them.
    // Taking the cut out of the contribution instead would make the sponsor's
    // announced bounty and the winner's payment two different numbers.
    pub fn sponsor_tier(
        env: Env,
        sponsor: Address,
        track: Symbol,
        rank: u32,
        amount: i128,
        note: BytesN<32>,
    ) -> Result<i128, Error> {
        sponsor.require_auth();

        let constitution = Self::open_to_sponsors(&env, amount)?;

        /* The frozen table or a sponsored track's own, because a position a
        sponsor opened can be topped up by the next sponsor along. */
        let base = Self::base_of(&env, &track, rank)?;
        let fee = constitution.platform_fee.amount_on(amount)?;

        storage::add_bonus(&env, &track, rank, amount);
        storage::add_sponsored_fee(&env, fee);
        storage::record_sponsorship(
            &env,
            &Sponsorship {
                sponsor: sponsor.clone(),
                track: track.clone(),
                rank,
                amount,
                fee,
                at: env.ledger().timestamp(),
                note: note.clone(),
            },
        );

        /* Last, so a wallet that cannot cover it takes the whole invocation
        down with it and leaves no record of money that never arrived. */
        let vault = storage::load_vault(&env)?;
        VaultClient::new(&env, &vault).deposit(&sponsor, &(amount + fee));

        let worth = base + storage::load_bonus(&env, &track, rank);
        events::sponsored(&env, &sponsor, &track, rank, amount, fee, worth, &note);

        Ok(worth)
    }

    /// Adds to every position in a track at once, in one signature.
    //
    // `sponsor_tier` asks a question a great many sponsors do not have an
    // answer to. Somebody with a hundred dollars and goodwill wants the
    // prizes to be bigger; being made to name which one of four strangers
    // benefits is a decision about people they have never met, and the way
    // that decision actually gets made is by pressing the top row.
    //
    // Everything else is `sponsor_tier`'s and deliberately so: the same door
    // opened before the lock, the same announced floor, the same window, the
    // same cut charged on top. What differs is that the money is divided over
    // the track's whole table by a rule the sponsor picked, and that it files
    // as one contribution rather than as one per place. The second part is
    // not cosmetic — `MAX_SPONSORSHIPS` bounds the list a cancellation has to
    // walk inside a single invocation, and charging a four place table four
    // slots for one person's hundred dollars would empty that allowance four
    // times as fast for no gain to any reader.
    //
    // # The floor applies to the contribution, not to the slices
    //
    // `min_bounty` exists to keep the wall readable, and the wall shows one
    // line per contribution. A hundred split four ways is still one line, so
    // the hundred is what has to clear it. Measuring each slice instead would
    // make a track with more places harder to sponsor than one with fewer,
    // which is backwards: the table with more places is the one that most
    // needs spreading over.
    pub fn sponsor_places(
        env: Env,
        sponsor: Address,
        track: Symbol,
        amount: i128,
        split: Split,
        note: BytesN<32>,
    ) -> Result<i128, Error> {
        sponsor.require_auth();

        let constitution = Self::open_to_sponsors(&env, amount)?;
        let tiers = Self::tiers_of(&env, &track)?;
        let (shares, before) = Self::shares_of(&env, &track, &tiers, amount, split)?;

        for (at, tier) in tiers.iter().enumerate() {
            let share = shares.get_unchecked(at as u32);

            /* A place can be owed nothing, when the contribution is smaller
            than the number of places or a weighted slice rounds away. That is
            a position nobody added to, which is the same as every position
            nobody added to, so it gets no write rather than a write of zero. */
            if share > 0 {
                storage::add_bonus(&env, &track, tier.rank, share);
            }
        }

        let fee = constitution.platform_fee.amount_on(amount)?;

        storage::add_sponsored_fee(&env, fee);
        storage::record_sponsorship(
            &env,
            &Sponsorship {
                sponsor: sponsor.clone(),
                track: track.clone(),
                /* The sentinel. One contribution over a whole table has no
                rank, and inventing one would put a number on the wall that
                does not describe where the money went. */
                rank: 0,
                amount,
                fee,
                at: env.ledger().timestamp(),
                note: note.clone(),
            },
        );

        /* Last, as in `sponsor_tier`, so a wallet that cannot cover it takes
        the whole invocation down and leaves no bonus behind for money that
        never arrived. */
        let vault = storage::load_vault(&env)?;
        VaultClient::new(&env, &vault).deposit(&sponsor, &(amount + fee));

        /* The whole track rather than one position, which is what `rank: 0`
        means here too. Every stroop was placed, so this is exact. */
        let worth = before + amount;
        events::sponsored(&env, &sponsor, &track, 0, amount, fee, worth, &note);

        Ok(worth)
    }

    /// The gate every contribution passes, whatever it is aimed at.
    //
    // Both sponsorship paths ask the same three questions, and two copies of
    // three questions is how a rule ends up enforced on one path and quietly
    // not on the other.
    fn open_to_sponsors(env: &Env, amount: i128) -> Result<Constitution, Error> {
        let constitution = storage::load_constitution(env)?;

        if !constitution.sponsorship.top_ups_allowed || amount < constitution.sponsorship.min_bounty
        {
            return Err(Error::SponsorshipRefused);
        }

        if storage::sponsorship_count(env) >= MAX_SPONSORSHIPS {
            return Err(Error::SponsorshipRefused);
        }

        /*
          Published, and not yet ranked.

          The near end is where the vault stops being the organizer's problem
          alone: before publication the pool is checked against
          `required_funding` and a contribution counted toward that check would
          let an organizer publish a hackathon whose prize table their own money
          does not cover. After it, every deposit grows the pool and the
          obligation by the same amount in the same invocation, so the vault
          covers what it owes at every instant.

          The far end is finalization, for the reason above: a contribution
          aimed at a position whose winner is already known is aimed at a
          person.
        */
        let phase = storage::load_state(env)?.phase;
        if !matches!(
            phase,
            Phase::Open | Phase::Screening | Phase::Judging | Phase::Reveal
        ) {
            return Err(Error::WrongPhase);
        }

        Ok(constitution)
    }

    /// How one contribution divides over a track's places, and what those
    /// places were worth before it.
    //
    // The two come back from one walk because they are read from the same
    // storage, and a caller that totalled the places again afterwards would
    // be totalling them after its own writes had landed.
    fn shares_of(
        env: &Env,
        track: &Symbol,
        tiers: &Vec<PrizeTier>,
        amount: i128,
        split: Split,
    ) -> Result<(Vec<i128>, i128), Error> {
        let mut worths = Vec::new(env);
        let mut before = 0i128;

        for tier in tiers.iter() {
            let worth = tier.amount + storage::load_bonus(env, track, tier.rank);

            worths.push_back(worth);
            before += worth;
        }

        let places = tiers.len() as i128;
        let mut shares = Vec::new(env);
        let mut placed = 0i128;

        for worth in worths.iter() {
            let share = match split {
                Split::Evenly => amount / places,
                /* Scaled before dividing, so the proportion is taken at full
                precision rather than from a ratio already rounded away. The
                multiplication is checked because this is the one line in the
                sponsorship path where a large contribution and a large prize
                table are multiplied by each other. */
                Split::ByWorth => {
                    amount.checked_mul(worth).ok_or(Error::SponsorshipRefused)? / before
                }
            };

            shares.push_back(share);
            placed += share;
        }

        /* Whatever integer division could not place, onto the best position.

        It is under one stroop per place either way, but dropping it would
        leave the vault holding money no position was credited with, and the
        total returned above would run a stroop or two ahead of what
        settlement can actually pay out. */
        let top = Self::top_place(tiers);
        shares.set(top, shares.get_unchecked(top) + (amount - placed));

        Ok((shares, before))
    }

    /// Where the leftover of a division goes: the best place in the table.
    //
    // The lowest rank rather than the first row, because a prize table is a
    // list and nothing obliges an organizer to have written it in order.
    fn top_place(tiers: &Vec<PrizeTier>) -> u32 {
        let mut top = 0u32;

        for (at, tier) in tiers.iter().enumerate() {
            if tier.rank < tiers.get_unchecked(top).rank {
                top = at as u32;
            }
        }

        top
    }

    /// Asks the organizer for a track of this sponsor's own, and pays for it.
    //
    // The money arrives with the request rather than after the answer. A
    // proposal that is only a promise is a queue of promises the organizer has
    // to chase, and a track accepted against one could open with nothing
    // behind it; here the vault is already holding the bounty when the
    // organizer is asked, so accepting is the only step left.
    //
    // # Why this is not editing the rules
    //
    // The sponsor supplies a name, a prize table and the money. The rubric and
    // the bench come from the track the locked rules named, so nothing about
    // how a project is scored, or by whom, arrives with the sponsor. A
    // participant who read the constitution before they started still knows
    // every criterion that can be applied to their work and every judge who
    // can apply it. What they did not know is that a further prize might exist
    // — and the locked rules told them that too, in
    // `sponsorship.max_new_tracks`.
    //
    // # Why the window closes when submissions do
    //
    // A project names one track. A track that opened after the last entry
    // landed would be a bounty no entry could ever reach, so this is refused
    // once building has stopped. It is deliberately still allowed up to that
    // point, even though a track opened late will draw fewer entries than one
    // posted before the start; that is the sponsor's trade to make, not this
    // contract's to prevent.
    pub fn propose_track(
        env: Env,
        sponsor: Address,
        id: Symbol,
        tiers: Vec<PrizeTier>,
        note: BytesN<32>,
    ) -> Result<(), Error> {
        sponsor.require_auth();

        let constitution = storage::load_constitution(&env)?;
        let policy = constitution.sponsorship.clone();

        if policy.max_new_tracks == 0 || storage::sponsorship_count(&env) >= MAX_SPONSORSHIPS {
            return Err(Error::SponsorshipRefused);
        }

        if storage::load_state(&env)?.phase != Phase::Open {
            return Err(Error::WrongPhase);
        }

        /* Counted over everything that is not a refusal, so a sponsor cannot
        hold the allowance open with proposals nobody has answered, and a
        refused one gives its slot back. */
        let mut taken = 0u32;
        for existing in storage::sponsor_track_ids(&env).iter() {
            if storage::load_sponsor_track(&env, &existing)?.status != TrackStatus::Declined {
                taken += 1;
            }
        }

        if taken >= policy.max_new_tracks {
            return Err(Error::SponsorshipRefused);
        }

        /* A name already in use would make two different competitions answer to
        one identifier, and every ranking, scorecard and payment in this
        contract is keyed by that identifier. */
        if constitution.track(&id).is_some() || storage::has_sponsor_track(&env, &id) {
            return Err(Error::SponsorshipRefused);
        }

        validate_prize_tiers(&tiers)?;
        for tier in tiers.iter() {
            if tier.track != id {
                return Err(Error::SponsorshipRefused);
            }
        }

        let total = total_prize_amount(&tiers)?;
        if total < policy.min_bounty {
            return Err(Error::SponsorshipRefused);
        }

        let fee = constitution.platform_fee.amount_on(total)?;

        storage::save_sponsor_track(
            &env,
            &SponsorTrack {
                id: id.clone(),
                sponsor: sponsor.clone(),
                tiers,
                fee,
                status: TrackStatus::Proposed,
                at: env.ledger().timestamp(),
                note: note.clone(),
            },
        );

        let vault = storage::load_vault(&env)?;
        VaultClient::new(&env, &vault).deposit(&sponsor, &(total + fee));

        events::track_proposed(&env, &sponsor, &id, total, fee, &note);

        Ok(())
    }

    /// Opens a proposed track, and with it the prize behind it.
    //
    // The organizer's call and nobody else's. A track carries the event's name
    // as much as the sponsor's, and a product where anybody who paid could
    // bolt a category onto somebody else's hackathon would be selling the
    // organizer's reputation by the bounty.
    //
    // Only while submissions are open, for the reason `propose_track` gives:
    // accepting after the last entry has landed opens a track nothing can
    // enter.
    pub fn accept_track(env: Env, id: Symbol) -> Result<(), Error> {
        let organizers = storage::load_organizing_team(&env)?;
        organizers.organizer.require_auth();

        if storage::load_state(&env)?.phase != Phase::Open {
            return Err(Error::WrongPhase);
        }

        let mut track = Self::pending_track(&env, &id)?;

        track.status = TrackStatus::Accepted;
        storage::save_sponsor_track(&env, &track);

        /* Counted from the acceptance rather than from the proposal, because
        this is the moment the contract takes on the obligation. The platform
        is owed its cut on a track that runs, and owes it back on one that
        does not. */
        storage::add_sponsored_fee(&env, track.fee);

        events::track_decided(&env, &id, true, 0);

        Ok(())
    }

    /// Turns a proposed track down and sends the money back.
    //
    // The refusal is the same call as the refund, so there is no state where a
    // sponsor has been told no and the contract is still holding what they
    // paid.
    pub fn decline_track(env: Env, id: Symbol) -> Result<i128, Error> {
        let organizers = storage::load_organizing_team(&env)?;
        organizers.organizer.require_auth();

        let mut track = Self::pending_track(&env, &id)?;
        let returned = track.paid();

        track.status = TrackStatus::Declined;
        storage::save_sponsor_track(&env, &track);

        VaultClient::new(&env, &storage::load_vault(&env)?).pay(&track.sponsor, &returned);

        events::track_decided(&env, &id, false, returned);

        Ok(returned)
    }

    /// One sponsored track, whatever has become of it.
    pub fn sponsor_track(env: Env, id: Symbol) -> Result<SponsorTrack, Error> {
        storage::load_sponsor_track(&env, &id)
    }

    /// Every sponsored track's name, in the order they were asked for.
    pub fn sponsor_track_ids(env: Env) -> Vec<Symbol> {
        storage::sponsor_track_ids(&env)
    }

    /// A track that has been asked for and not yet answered.
    //
    // Shared by both answers, so accepting a declined track and declining an
    // accepted one are refused by the same line rather than by two that could
    // come to differ.
    fn pending_track(env: &Env, id: &Symbol) -> Result<SponsorTrack, Error> {
        let track = storage::load_sponsor_track(env, id)?;

        if track.status != TrackStatus::Proposed {
            return Err(Error::SponsorshipRefused);
        }

        Ok(track)
    }

    /// What a prize position is worth now.
    //
    // The frozen tier plus every contribution aimed at it. This is the number
    // settlement pays and the number a page should show, and the two are the
    // same call so they cannot drift apart.
    pub fn payable(env: Env, track: Symbol, rank: u32) -> Result<i128, Error> {
        Self::worth_of(&env, &track, rank)
    }

    /// One contribution, by the order it arrived.
    pub fn sponsorship(env: Env, index: u32) -> Result<Sponsorship, Error> {
        storage::load_sponsorship(&env, index)
    }

    /// How many contributions this hackathon has taken.
    pub fn sponsorship_count(env: Env) -> u32 {
        storage::sponsorship_count(&env)
    }

    /// What the platform is owed on those contributions, on top of what the
    /// frozen table owes it.
    pub fn sponsored_fee(env: Env) -> i128 {
        storage::load_sponsored_fee(&env)
    }

    /// The frozen amount of a position plus whatever sponsors added to it.
    //
    // One reader for the payout, the sweep and the public call above, because
    // three answers to "what is this position worth" is two too many when one
    // of them moves money.
    fn worth_of(env: &Env, track: &Symbol, rank: u32) -> Result<i128, Error> {
        Ok(Self::base_of(env, track, rank)? + storage::load_bonus(env, track, rank))
    }

    /// What a position started at, before anybody added to it.
    fn base_of(env: &Env, track: &Symbol, rank: u32) -> Result<i128, Error> {
        Self::tiers_of(env, track)?
            .iter()
            .find(|tier| tier.rank == rank)
            .map(|tier| tier.amount)
            .ok_or(Error::NotFound)
    }

    /// Every position in a track, wherever the track came from.
    //
    // The frozen table first, then the sponsored tracks. A sponsor track's
    // positions are not in the constitution and never will be — that document
    // is hashed — so they carry their own table and this is where the two are
    // read as one. Nothing can be in both: `propose_track` refuses a name the
    // constitution already uses.
    fn tiers_of(env: &Env, track: &Symbol) -> Result<Vec<PrizeTier>, Error> {
        let mut frozen = Vec::new(env);

        for tier in storage::load_constitution(env)?.prize_tiers.iter() {
            if tier.track == *track {
                frozen.push_back(tier);
            }
        }

        if !frozen.is_empty() {
            return Ok(frozen);
        }

        let sponsored = storage::load_sponsor_track(env, track)?;
        if sponsored.status != TrackStatus::Accepted {
            return Err(Error::NotFound);
        }

        Ok(sponsored.tiers)
    }

    /// The rubric a track is scored against.
    //
    // A sponsor track borrows one rather than bringing one, so this is where
    // the borrowing happens. Every scorecard check goes through here instead
    // of reaching into `constitution.tracks`, because a sponsored track is not
    // in that list and cannot be put there.
    fn rubric_of(env: &Env, constitution: &Constitution, id: &Symbol) -> Result<Track, Error> {
        if let Some(track) = constitution.track(id) {
            return Ok(track);
        }

        if !Self::is_running_sponsor_track(env, id) {
            return Err(Error::NotFound);
        }

        constitution
            .track(&constitution.sponsorship.borrows_from)
            .ok_or(Error::NotFound)
    }

    /// Whether this judge may score this track.
    //
    // The bench is borrowed with the rubric and from the same place. A sponsor
    // track whose judges were assigned by name would need names the frozen
    // judge list does not contain, which is another way of saying the sponsor
    // would be appointing them.
    fn may_judge(env: &Env, constitution: &Constitution, judge: &Address, id: &Symbol) -> bool {
        constitution.judges_track(judge, &Self::bench_for(env, constitution, id))
    }

    /// The name whose judge assignments govern a track: its own, unless it is a
    /// running sponsor track, in which case the one it stands on.
    //
    // An unknown name is returned unchanged, so the caller's own lookup
    // refuses it rather than this quietly substituting the borrowed bench for
    // a track that does not exist.
    fn bench_for(env: &Env, constitution: &Constitution, id: &Symbol) -> Symbol {
        if constitution.track(id).is_none() && Self::is_running_sponsor_track(env, id) {
            return constitution.sponsorship.borrows_from.clone();
        }

        id.clone()
    }

    /// Whether this name belongs to a sponsor track the organizer accepted.
    //
    // Proposed is not running. A track waiting on an answer takes no entries
    // and is scored by nobody, because the organizer may still say no and
    // every project that had entered it would be stranded.
    fn is_running_sponsor_track(env: &Env, id: &Symbol) -> bool {
        matches!(
            storage::load_sponsor_track(env, id),
            Ok(track) if track.status == TrackStatus::Accepted
        )
    }

    /// Every position this hackathon has to settle: the frozen table, plus the
    /// tables of the tracks sponsors opened.
    fn payable_positions(env: &Env, constitution: &Constitution) -> Vec<PrizeTier> {
        let mut positions = constitution.prize_tiers.clone();

        for id in storage::sponsor_track_ids(env).iter() {
            if let Ok(track) = storage::load_sponsor_track(env, &id) {
                if track.status == TrackStatus::Accepted {
                    for tier in track.tiers.iter() {
                        positions.push_back(tier);
                    }
                }
            }
        }

        positions
    }

    /// Whoever a position's money goes back to when nobody collects it.
    //
    // The organizer for a position the organizer funded, and the sponsor for
    // one a sponsor funded. A sponsor track that drew no entries handing its
    // bounty to the organizer would be the organizer being paid for a
    // competition somebody else bought and nobody entered.
    fn refund_target(env: &Env, track: &Symbol) -> Result<Address, Error> {
        if let Ok(sponsored) = storage::load_sponsor_track(env, track) {
            if sponsored.status == TrackStatus::Accepted {
                return Ok(sponsored.sponsor);
            }
        }

        Ok(storage::load_organizing_team(env)?.organizer)
    }

    /// Asks to take part.
    //
    // The request has to arrive before registration closes. An organizer may
    // still be working through the queue after that, and a late approval is
    // fine, but a late request is not: the deadline is what fixes who could
    // possibly be in the electorate.
    //
    // Under [`RegistrationPolicy::Open`] there is no queue and the applicant
    // is in before this call returns. The decision is still recorded and still
    // announced, because the rest of the contract reads registrations rather
    // than policies: the electorate, the team roster and the gallery all ask
    // whether somebody was approved and when, and an admission that skipped
    // the record would be a participant none of them could see.
    pub fn apply(env: Env, applicant: Address) -> Result<(), Error> {
        applicant.require_auth();

        let state = storage::load_state(&env)?;
        if state.phase != Phase::Open {
            return Err(Error::WrongPhase);
        }

        let now = env.ledger().timestamp();
        if now < state.schedule.registration_opens_at {
            return Err(Error::DeadlineNotReached);
        }
        if now > state.schedule.registration_closes_at {
            return Err(Error::DeadlinePassed);
        }

        if storage::has_registration(&env, &applicant) {
            return Err(Error::ApplicationNotPending);
        }

        let arrived = Registration::pending(&env, now);
        let open = storage::load_constitution(&env)?
            .registration
            .admits_immediately();

        /* Announced as an application either way, and as a decision only when
        one was made. An open event emits both in the same transaction, which
        is what it is: the applying and the admitting happen together. */
        events::applied(&env, &applicant);

        if !open {
            storage::save_registration(&env, &applicant, &arrived);

            return Ok(());
        }

        let admitted = arrived.approve(&env, now)?;

        storage::save_registration(&env, &applicant, &admitted);
        events::application_decided(&env, &applicant, true, &admitted.reason);

        Ok(())
    }

    /// Lets someone in.
    //
    // Open to the organizer and to any collaborator, because a queue of a
    // hundred applications is exactly the thing one person cannot clear alone.
    pub fn approve_application(
        env: Env,
        reviewer: Address,
        applicant: Address,
    ) -> Result<(), Error> {
        Self::require_reviewer(&env, &reviewer)?;

        let now = env.ledger().timestamp();
        let decided = storage::load_registration(&env, &applicant)?.approve(&env, now)?;

        Self::record_decision(&env, &applicant, &decided, true);

        Ok(())
    }

    /// Keeps someone out, on the record.
    //
    // The reason digest is required rather than optional. A refusal that
    // leaves no trace is the quiet back door beside the disqualification
    // process the product makes so much noise about.
    pub fn reject_application(
        env: Env,
        reviewer: Address,
        applicant: Address,
        reason: BytesN<32>,
    ) -> Result<(), Error> {
        Self::require_reviewer(&env, &reviewer)?;

        let now = env.ledger().timestamp();
        let decided = storage::load_registration(&env, &applicant)?.reject(now, reason)?;

        Self::record_decision(&env, &applicant, &decided, false);

        Ok(())
    }

    /// Lets a whole queue in, on one signature.
    //
    // A reviewer facing forty applications had forty wallet prompts to get
    // through, and a wallet prompt is the one step in this product that cannot
    // be made faster. What that produced was not a slow afternoon, it was
    // queues nobody cleared: the honest reviewer reads every profile and then
    // gives up somewhere around the tenth confirmation.
    //
    // # Why this is the same decision, not a weaker one
    //
    // Every application still gets its own row, its own timestamp and its own
    // event, exactly as though it had been decided alone, because the writing
    // of it goes through the same function the singular calls above use. What
    // is shared is the signature, and a signature is the reviewer saying
    // "these" rather than saying it about each in turn.
    //
    // There is no cap on the list. Unlike the sponsor wall, nothing here has
    // to be walked again later — the obligation this creates is a roster entry,
    // not a refund owed inside some future invocation — so the only bound that
    // matters is what the network will execute, and it enforces that itself.
    pub fn approve_applications(
        env: Env,
        reviewer: Address,
        applicants: Vec<Address>,
    ) -> Result<u32, Error> {
        Self::decide_each(&env, &reviewer, &applicants, &None)
    }

    /// Turns a whole queue away, against one written reason.
    //
    // One reason for the batch rather than one each, because that is what a
    // reviewer refusing thirty people at once actually has: a rule they all
    // fell outside of. Anybody who needs to say something different to one of
    // them refuses that one on their own, which is the call above this.
    pub fn reject_applications(
        env: Env,
        reviewer: Address,
        applicants: Vec<Address>,
        reason: BytesN<32>,
    ) -> Result<u32, Error> {
        Self::decide_each(&env, &reviewer, &applicants, &Some(reason))
    }

    /// One decision, applied to each of them that it can still be applied to,
    /// and how many that came to.
    //
    // `None` approves.
    //
    // # Why a name that cannot be decided is passed over rather than fatal
    //
    // Because one applicant's situation is that applicant's. A queue read into
    // a browser a minute ago is a queue somebody may have been decided in
    // since — by the organizer in another tab, by a collaborator working the
    // same list, or by the applicant appearing twice in one selection — and
    // none of that is a fact about the other thirty nine. Taking them all down
    // over it would mean the larger the queue, the likelier that clearing it
    // does nothing at all, which is precisely the failure this call exists to
    // remove.
    //
    // So the count comes back. The caller asked about a list and learns how
    // much of it was still theirs to decide; the difference is the part
    // somebody else had already dealt with, and the queue re-read afterwards
    // says exactly who. Nothing is silently lost, because nothing was lost —
    // every name in that difference already has a decision on it.
    //
    // An empty list decides nothing and returns zero, which is the truthful
    // answer to asking for no decisions rather than a failure.
    fn decide_each(
        env: &Env,
        reviewer: &Address,
        applicants: &Vec<Address>,
        reason: &Option<BytesN<32>>,
    ) -> Result<u32, Error> {
        Self::require_reviewer(env, reviewer)?;

        let now = env.ledger().timestamp();
        let mut count = 0u32;

        for applicant in applicants.iter() {
            /* Somebody who never applied. Not an error here: the caller named
            a list, and a name with no application on it is a name there was
            no decision to make about. */
            let Ok(waiting) = storage::load_registration(env, &applicant) else {
                continue;
            };

            /* Somebody already decided. The refusal these produce is the right
            answer to a call about one person and the wrong one to a call about
            forty, so it is read as "not this one" and the walk goes on. */
            let outcome = match reason {
                None => waiting.approve(env, now),
                Some(written) => waiting.reject(now, written.clone()),
            };

            let Ok(decided) = outcome else {
                continue;
            };

            Self::record_decision(env, &applicant, &decided, reason.is_none());
            count += 1;
        }

        Ok(count)
    }

    /// Who may decide who takes part.
    //
    // The organizer and any collaborator, because a queue of a hundred
    // applications is exactly the thing one person cannot clear alone. Shared
    // by all four entry points rather than written out in each, since a gate
    // copied four times is a gate that ends up enforced in three places.
    fn require_reviewer(env: &Env, reviewer: &Address) -> Result<(), Error> {
        reviewer.require_auth();
        storage::load_organizing_team(env)?.require_application_reviewer(reviewer)
    }

    /// Writes one decision down and announces it.
    //
    // Shared so a refusal recorded on its own and a refusal recorded inside a
    // batch leave the same row and emit the same event. What differs between
    // the two paths is what happens when a decision cannot be made at all, and
    // that is decided by the caller rather than here.
    fn record_decision(env: &Env, applicant: &Address, decided: &Registration, approved: bool) {
        storage::save_registration(env, applicant, decided);
        events::application_decided(env, applicant, approved, &decided.reason);
    }

    /// Starts a team, with the caller as its captain.
    //
    // The captain is the address the prize is paid to, so founding a team is
    // also the moment somebody takes responsibility for settling up with the
    // people who join it.
    pub fn create_team(env: Env, captain: Address) -> Result<u32, Error> {
        captain.require_auth();
        Self::require_open_and_approved(&env, &captain)?;

        let constitution = storage::load_constitution(&env)?;
        Self::require_free_to_join(&env, &captain, &constitution.teams)?;

        let id = storage::next_team_id(&env);
        let team = Team::found(&env, id, captain.clone());

        storage::save_team(&env, &team);
        Self::record_membership(&env, &captain, id);

        events::team_founded(&env, &captain, id);

        Ok(id)
    }

    /// Adds someone to a team.
    //
    // Both sides sign: the captain because it is their team and their prize,
    // the member because being placed on a team can cost them the right to
    // join the one they meant to. Neither can do it alone.
    pub fn add_member(env: Env, team_id: u32, member: Address) -> Result<(), Error> {
        let team = storage::load_team(&env, team_id)?;

        team.captain.require_auth();
        member.require_auth();

        Self::require_open_and_approved(&env, &member)?;

        let constitution = storage::load_constitution(&env)?;
        Self::require_free_to_join(&env, &member, &constitution.teams)?;

        let grown = team.add_member(member.clone(), &constitution.teams)?;

        storage::save_team(&env, &grown);
        Self::record_membership(&env, &member, team_id);

        events::member_joined(&env, &member, team_id);

        Ok(())
    }

    /// Moves the hackathon into its next stage once the clock allows it.
    //
    // Only the three stages that end on a deadline can be moved this way, and
    // never before that deadline passes, so this can close a window but never
    // cut one short. No signature is asked for: the condition is a timestamp
    // anyone can read, and making the organizer the only one who can act on it
    // would let them stall a hackathon whose submission window has closed.
    pub fn advance_phase(env: Env) -> Result<Phase, Error> {
        let state = storage::load_state(&env)?;

        if state.phase.closing_deadline().is_none() {
            return Err(Error::WrongPhase);
        }

        let advanced = state.advance(env.ledger().timestamp())?;

        storage::save_state(&env, &advanced);
        events::phase_advanced(&env, advanced.phase);

        Ok(advanced.phase)
    }

    /// Gives one deadline more time, inside the allowance the rules announced.
    //
    // The announced schedule stays in the constitution and stays hashed. What
    // moves is the schedule in force, and the gap between the two is this
    // call's event trail, so an extension always reads as an extension rather
    // than as rules that quietly say something else.
    //
    // Three limits make that safe, and each one closes a specific way an
    // organizer could otherwise steer a result. The move has to fit the budget
    // published before the lock, so nobody is surprised by a window that keeps
    // growing. A deadline that has passed is closed for good, so an organizer
    // cannot read what arrived and only then decide to give more time. And the
    // whole schedule is revalidated afterwards, so a submission window pushed
    // past the screening round is refused rather than stranding the event.
    //
    // A reason digest is required for the same reason a screening decision
    // needs one: this is discretion, and discretion has to be answerable.
    //
    // Before the lock there is nothing to extend. The organizer edits the
    // schedule through `configure` and no allowance is spent.
    pub fn extend_deadline(
        env: Env,
        deadline: Deadline,
        moved_to: u64,
        reason: BytesN<32>,
    ) -> Result<(), Error> {
        let organizers = storage::load_organizing_team(&env)?;
        organizers.organizer.require_auth();

        move_deadlines(
            &env,
            &vec![&env, DeadlineMove { deadline, moved_to }],
            &reason,
        )
    }

    /// Gives several deadlines more time at once, under one signature.
    //
    // A hackathon that runs late runs late at every stage: a build window
    // extended by a week pushes the entry check, the judging and the vote by a
    // week with it, because the order they run in is fixed. Sending those one
    // at a time meant a wallet prompt each, and worse, an order somebody had
    // to work out — a submission deadline cannot be moved past the screening
    // round, so the schedule had to be extended backwards, from the last
    // deadline to the first, or the contract refused it halfway.
    //
    // Nothing is loosened by folding them together. Every move is checked the
    // way a single one is: it has to fit the allowance that deadline published,
    // it cannot reopen a deadline that has already passed, and the schedule has
    // to be in workable order when they are all applied. What changes is that
    // the intermediate states are nobody's business. The organizer describes
    // where the schedule should end up and the contract decides whether that
    // is allowed, rather than judging each step of a route through it.
    pub fn extend_schedule(
        env: Env,
        moves: Vec<DeadlineMove>,
        reason: BytesN<32>,
    ) -> Result<(), Error> {
        let organizers = storage::load_organizing_team(&env)?;
        organizers.organizer.require_auth();

        move_deadlines(&env, &moves, &reason)
    }

    /// Enters a project, or revises one already entered.
    //
    // Any member of the team may do this. Teams work together and joined by
    // mutual consent, and requiring the captain to be awake at the deadline is
    // a failure mode a hackathon does not need.
    //
    // The digest is supplied by the caller rather than computed here, because
    // the metadata it covers never touches the chain. A client builds it from
    // the fields of `SubmissionMetadata`, and anyone can later fetch the same
    // metadata from `uri` and check it reaches the same value.
    pub fn submit_project(
        env: Env,
        member: Address,
        team_id: u32,
        track: Symbol,
        metadata_hash: BytesN<32>,
        uri: String,
    ) -> Result<(), Error> {
        member.require_auth();

        let state = storage::load_state(&env)?;
        if state.phase != Phase::Open {
            return Err(Error::WrongPhase);
        }

        let now = env.ledger().timestamp();
        if now < state.schedule.submission_opens_at {
            return Err(Error::DeadlineNotReached);
        }
        if now > state.schedule.submission_closes_at {
            return Err(Error::DeadlinePassed);
        }

        let team = storage::load_team(&env, team_id)?;
        if !team.has_member(&member) {
            return Err(Error::NotTeamMember);
        }

        /* A sponsored track counts, once the organizer has accepted it. That is
        the whole reason its window closes while submissions are still open:
        a track nobody could enter is a bounty with nowhere to go. */
        let constitution = storage::load_constitution(&env)?;
        if constitution.track(&track).is_none() && !Self::is_running_sponsor_track(&env, &track) {
            return Err(Error::NotFound);
        }

        let revised = storage::has_submission(&env, team_id);
        let submission = if revised {
            storage::load_submission(&env, team_id)?.revise(
                track.clone(),
                metadata_hash.clone(),
                uri,
                now,
            )
        } else {
            Submission::new(
                &env,
                team_id,
                track.clone(),
                metadata_hash.clone(),
                uri,
                now,
            )
        };

        storage::save_submission(&env, &submission);
        events::project_submitted(&env, team_id, &track, &metadata_hash, revised);

        Ok(())
    }

    /// Rules an entry out of the running, on the record.
    //
    // This is the screening round: spam, an empty repository, the wrong track,
    // code written before the event. It runs before any scorecard exists, so a
    // judge's opinion can never be the thing that shapes it, and it belongs to
    // the organizer rather than to a collaborator because it is a judgement
    // about the work rather than about who gets in the door.
    //
    // The project is not deleted. It keeps its page carrying the reason, which
    // is the difference between a screening round and a disappearance.
    //
    // An entry with a disqualification case open is out of reach here. Two
    // processes running on one entry would let the lighter one land first and
    // leave the heavier one holding a verdict it can no longer apply, and the
    // team would lose the appeal window they had already been given.
    pub fn invalidate_submission(env: Env, team_id: u32, reason: BytesN<32>) -> Result<(), Error> {
        let organizers = storage::load_organizing_team(&env)?;
        organizers.organizer.require_auth();

        if storage::load_state(&env)?.phase != Phase::Screening {
            return Err(Error::WrongPhase);
        }

        if let Ok(case) = storage::load_disqualification(&env, team_id) {
            if !case.resolved {
                return Err(Error::CaseAlreadyOpen);
            }
        }

        let ruled_out = storage::load_submission(&env, team_id)?.invalidate(reason.clone())?;

        storage::save_submission(&env, &ruled_out);
        events::submission_invalidated(&env, team_id, &reason);

        Ok(())
    }

    /// Opens a case for removing an entry, on the record.
    //
    // This runs alongside screening rather than after it. The two answer
    // different problems: screening is for the entries nobody would argue
    // about, and this is for the ones somebody would, whenever they surface.
    // An organizer who finds plagiarism on the last morning of screening
    // should not have to choose between waiting and using the lighter route,
    // because the lighter route is the one that gives the team no window to
    // answer and asks no judge to agree.
    //
    // It closes at the reveal. Past that point the ranking is being computed,
    // and a removal landing after the result is announced would put every
    // payment back in doubt.
    //
    // Opening a case removes nothing by itself. The entry stays in the running
    // the entire time the case is open, and only `resolve_disqualification`
    // can take it out.
    pub fn open_disqualification(env: Env, team_id: u32, reason: BytesN<32>) -> Result<(), Error> {
        let organizers = storage::load_organizing_team(&env)?;
        organizers.organizer.require_auth();

        Self::require_disqualification_phase(&env)?;

        if !storage::load_submission(&env, team_id)?.is_valid() {
            return Err(Error::SubmissionNotEligible);
        }
        if storage::has_disqualification(&env, team_id) {
            return Err(Error::CaseAlreadyOpen);
        }

        let now = env.ledger().timestamp();
        storage::save_disqualification(
            &env,
            &DisqualificationCase::open(&env, team_id, reason.clone(), now),
        );

        events::disqualification_opened(&env, team_id, &reason);

        Ok(())
    }

    /// Files the team's answer, inside the window they were given.
    //
    // Any member may file it, for the same reason any member may enter the
    // project: a team whose captain is asleep would otherwise lose its right
    // of reply to a timezone.
    //
    // The answer changes nothing on its own and is not required for the case
    // to be settled. What it does is put the team's account on the same public
    // record as the accusation, so a reader of the proof page sees both sides
    // or knows that only one was offered.
    pub fn submit_appeal(
        env: Env,
        member: Address,
        team_id: u32,
        appeal: BytesN<32>,
    ) -> Result<(), Error> {
        member.require_auth();

        if !storage::load_team(&env, team_id)?.has_member(&member) {
            return Err(Error::NotTeamMember);
        }

        let mut case = storage::load_disqualification(&env, team_id)?;
        if case.resolved {
            return Err(Error::AppealWindowClosed);
        }

        let window = storage::load_constitution(&env)?.discretion.appeal_window;
        let now = env.ledger().timestamp();

        if !case.appeal_window_open(now, window) {
            return Err(Error::AppealWindowClosed);
        }
        if case.appealed_at != 0 {
            return Err(Error::AlreadySigned);
        }

        case.appeal = appeal.clone();
        case.appealed_at = now;
        storage::save_disqualification(&env, &case);

        events::appeal_submitted(&env, team_id, &member, &appeal);

        Ok(())
    }

    /// Adds a judge's signature to the case.
    //
    // Only a judge assigned to the entry's own track may sign. A bench that
    // never saw the project has no basis to remove it, and letting them sign
    // would turn the threshold into a headcount the organizer could reach by
    // asking whoever was easiest to convince.
    pub fn approve_disqualification(env: Env, judge: Address, team_id: u32) -> Result<(), Error> {
        judge.require_auth();

        let submission = storage::load_submission(&env, team_id)?;
        let constitution = storage::load_constitution(&env)?;
        if !Self::may_judge(&env, &constitution, &judge, &submission.track) {
            return Err(Error::NotJudge);
        }

        let mut case = storage::load_disqualification(&env, team_id)?;
        if case.resolved {
            return Err(Error::CaseNotOpen);
        }
        if storage::has_disqualification_approval(&env, team_id, &judge) {
            return Err(Error::AlreadySigned);
        }

        storage::save_disqualification_approval(&env, team_id, &judge);
        case.approvals += 1;
        storage::save_disqualification(&env, &case);

        events::disqualification_approved(&env, team_id, &judge, case.approvals);

        Ok(())
    }

    /// Settles the case, one way or the other.
    //
    // The window has to have run out first, so a case cannot be rushed through
    // before the team has had the time they were promised to answer. If the
    // judges reached the announced threshold the entry comes out of the
    // running carrying the reason it was opened with; if they did not, the
    // case closes and the project competes as though it had never been opened.
    // That default is the same one the no award path uses: a team that entered
    // is in unless somebody clears the bar to remove them.
    //
    // Nobody has to sign this. Both conditions are public values anyone can
    // read, and leaving the call to the organizer would let them park a case
    // they had lost.
    pub fn resolve_disqualification(env: Env, team_id: u32) -> Result<bool, Error> {
        Self::require_disqualification_phase(&env)?;

        let mut case = storage::load_disqualification(&env, team_id)?;
        if case.resolved {
            return Err(Error::CaseNotOpen);
        }

        let constitution = storage::load_constitution(&env)?;
        if case.appeal_window_open(
            env.ledger().timestamp(),
            constitution.discretion.appeal_window,
        ) {
            return Err(Error::AppealWindowOpen);
        }

        let upheld = case.approvals >= constitution.discretion.disqualification_threshold;

        case.resolved = true;
        storage::save_disqualification(&env, &case);

        if upheld {
            let removed = storage::load_submission(&env, team_id)?.disqualify(case.reason)?;
            storage::save_submission(&env, &removed);
        }

        events::disqualification_resolved(&env, team_id, upheld, case.approvals);

        Ok(upheld)
    }

    /// The case against one team's entry, if one was opened.
    pub fn disqualification(env: Env, team_id: u32) -> Result<DisqualificationCase, Error> {
        storage::load_disqualification(&env, team_id)
    }

    /// Calls the whole hackathon off before anybody has entered it.
    //
    // The organizer signs alone here, and only here. Until submissions open
    // there is nobody whose weekend is at stake: no team has formed, no code
    // has been written, and the only thing at risk is money the organizer put
    // in themselves. Asking a bench of judges to sign off on stopping an event
    // nobody joined would be ceremony rather than protection.
    //
    // The moment submissions open, this door closes and
    // `open_cancellation` is the only way out.
    pub fn cancel(env: Env, reason: BytesN<32>) -> Result<i128, Error> {
        let organizers = storage::load_organizing_team(&env)?;
        organizers.organizer.require_auth();

        let state = storage::load_state(&env)?;
        if state.phase != Phase::Draft && state.phase != Phase::Funding {
            return Err(Error::WrongPhase);
        }

        let returned = Self::return_the_pool(&env)?;

        storage::save_state(&env, &state.cancel()?);
        events::hackathon_cancelled(&env, &reason, 0, returned);

        Ok(returned)
    }

    /// Opens a move to stop a hackathon people are already building in.
    //
    // From the moment submissions open, stopping the event costs teams work
    // they have already done, and the organizer is the party whose deposit
    // comes back. Those two facts together are why the threshold announced
    // before the lock applies from here on: the person who benefits from
    // stopping cannot be the only person who decides to.
    //
    // Opening changes nothing on its own. The hackathon keeps running, and
    // deadlines keep passing, until the signatures are in and somebody calls
    // `resolve_cancellation`.
    pub fn open_cancellation(env: Env, reason: BytesN<32>) -> Result<(), Error> {
        let organizers = storage::load_organizing_team(&env)?;
        organizers.organizer.require_auth();

        Self::require_cancellation_phase(&env)?;

        if storage::has_cancellation(&env) {
            return Err(Error::CaseAlreadyOpen);
        }

        storage::save_cancellation(
            &env,
            &CancellationCase {
                opened_at: env.ledger().timestamp(),
                reason: reason.clone(),
                approvals: 0,
            },
        );

        events::cancellation_opened(&env, &reason);

        Ok(())
    }

    /// Adds a judge's signature to that move.
    //
    // Any judge on the bench may sign, not only those assigned to one track.
    // Stopping the event reaches every track at once, so narrowing the vote to
    // a single track's judges would let the organizer pick the smallest room
    // they had to convince.
    pub fn approve_cancellation(env: Env, judge: Address) -> Result<(), Error> {
        judge.require_auth();

        if !storage::load_constitution(&env)?.is_judge(&judge) {
            return Err(Error::NotJudge);
        }

        let mut case = storage::load_cancellation(&env)?;
        if storage::has_cancellation_approval(&env, &judge) {
            return Err(Error::AlreadySigned);
        }

        storage::save_cancellation_approval(&env, &judge);
        case.approvals += 1;
        storage::save_cancellation(&env, &case);

        events::cancellation_approved(&env, &judge, case.approvals);

        Ok(())
    }

    /// Stops the hackathon and sends the pool back along the declared route.
    //
    // Unlike the no award path, falling short of the threshold is not an
    // outcome here, it is simply not yet. A cancellation that failed would
    // leave the event running, which it already is, so the call refuses and
    // the hackathon carries on until either the signatures arrive or nobody
    // mentions it again.
    //
    // Nobody has to sign this. The signatures are already counted on chain and
    // the route was declared before the lock, so there is nothing left to
    // decide.
    pub fn resolve_cancellation(env: Env) -> Result<i128, Error> {
        let state = Self::require_cancellation_phase(&env)?;

        let case = storage::load_cancellation(&env)?;
        let threshold = storage::load_constitution(&env)?
            .discretion
            .cancellation_threshold;

        if case.approvals < threshold {
            return Err(Error::JudgeApprovalThresholdNotMet);
        }

        let returned = Self::return_the_pool(&env)?;

        storage::save_state(&env, &state.cancel()?);
        events::hackathon_cancelled(&env, &case.reason, case.approvals, returned);

        Ok(returned)
    }

    /// The move to end the hackathon early, if one was opened.
    pub fn cancellation(env: Env) -> Result<CancellationCase, Error> {
        storage::load_cancellation(&env)
    }

    /// The stretch of the event where cancellation needs the judges.
    //
    // It opens when submissions do, because that is the moment teams start
    // spending time they cannot get back, and closes when the ranking does,
    // because from there on there are winners with a claim and calling the
    // event off would take money from the people who won it.
    fn require_cancellation_phase(env: &Env) -> Result<HackathonState, Error> {
        let state = storage::load_state(env)?;

        match state.phase {
            Phase::Open | Phase::Screening | Phase::Judging | Phase::Reveal => Ok(state),
            _ => Err(Error::WrongPhase),
        }
    }

    /// Empties the vault, and reports what was in it.
    //
    // Sponsors are paid back first and in full, then whatever is left goes to
    // the organizer. The declared route is not matched on for the remainder,
    // because validation already refused every route but the organizer for a
    // cancellation: a cancelled hackathon has no remaining tracks to spread a
    // pool across.
    //
    // Sponsors used to be part of that same sentence — there was no deposit
    // ledger, so their money left with the organizer's. There is one now, and
    // handing somebody else's contribution to the organizer of an event that
    // did not happen was never defensible; it was only unimplementable. The
    // platform's cut goes back with the prize for the same reason. Nothing was
    // carried, so nothing was earned.
    //
    // They are paid before the organizer rather than after, so that a pool
    // which somehow could not cover everything shorts the party who chose to
    // stop the event rather than the parties who only put money into it.
    //
    // A hackathon cancelled while still in draft may have no vault at all, and
    // one cancelled during funding may have a vault holding nothing. Both
    // return zero rather than failing, because neither is a problem.
    fn return_the_pool(env: &Env) -> Result<i128, Error> {
        if !storage::has_vault(env) {
            return Ok(0);
        }

        let vault = VaultClient::new(env, &storage::load_vault(env)?);

        /* Bounded by `MAX_SPONSORSHIPS`, which is what that cap is for: a
        refund that walks an unbounded list is a refund that can grow past
        the point where it fits in one invocation, and a cancellation nobody
        can complete is money stranded by the very call meant to release it. */
        let mut returned = 0i128;

        for index in 0..storage::sponsorship_count(env) {
            let sponsorship = storage::load_sponsorship(env, index)?;
            vault.pay(&sponsorship.sponsor, &sponsorship.paid());
            returned += sponsorship.paid();
        }

        /* And whoever paid for a track. A track already declined took its money
        with it, so paying one again here would pay its sponsor twice out of
        a pool the organizer is owed the rest of. */
        for id in storage::sponsor_track_ids(env).iter() {
            let track = storage::load_sponsor_track(env, &id)?;

            if track.holds_money() {
                vault.pay(&track.sponsor, &track.paid());
                returned += track.paid();
            }
        }

        let remaining = vault.balance();

        if remaining > 0 {
            let organizer = storage::load_organizing_team(env)?.organizer;
            vault.pay(&organizer, &remaining);
        }

        Ok(returned + remaining)
    }

    /// The stretch of the event where a removal can still be opened or settled.
    //
    // It starts when the entries are pinned, because there is nothing to
    // remove before that, and ends when the ranking closes, because a removal
    // after the result is announced would reopen every payment behind it.
    fn require_disqualification_phase(env: &Env) -> Result<(), Error> {
        match storage::load_state(env)?.phase {
            Phase::Screening | Phase::Judging | Phase::Reveal => Ok(()),
            _ => Err(Error::WrongPhase),
        }
    }

    /// Steps a judge away from one project.
    //
    // The protocol cannot detect that a judge used to work with a team, so the
    // declaration is theirs to make. What it can do is make the declaration
    // permanent and public, and stop that judge counting toward the project's
    // quorum, so a conflict handled honestly looks different from a judge who
    // simply never got round to scoring.
    //
    // It has to happen before the judging window closes, for the same reason
    // scores are sealed: a judge who could step away after seeing where a
    // project stood would be choosing which results to touch.
    pub fn recuse(env: Env, judge: Address, team_id: u32) -> Result<(), Error> {
        judge.require_auth();

        let state = storage::load_state(&env)?;
        if state.phase != Phase::Judging {
            return Err(Error::WrongPhase);
        }
        if env.ledger().timestamp() > state.schedule.judging_closes_at {
            return Err(Error::DeadlinePassed);
        }

        let submission = storage::load_submission(&env, team_id)?;
        let constitution = storage::load_constitution(&env)?;

        if !Self::may_judge(&env, &constitution, &judge, &submission.track) {
            return Err(Error::NotJudge);
        }

        if storage::has_recused(&env, &judge, team_id) {
            return Err(Error::JudgeRecused);
        }

        storage::save_recusal(&env, &judge, team_id);
        events::judge_recused(&env, &judge, team_id);

        Ok(())
    }

    /// Seals every scorecard behind one digest.
    //
    // This is the moment the judging window closes in the easy mode. Until it
    // happens the scorecards live off chain with the collection service; after
    // it, that service can no longer change any of them, because the root it
    // published commits to all of them at once.
    //
    // Only the address the constitution named may call this, and only once.
    // A second root would let the sealer replace the whole set after seeing
    // what the first one produced.
    pub fn publish_score_root(env: Env, root: BytesN<32>) -> Result<(), Error> {
        let constitution = storage::load_constitution(&env)?;
        let sealer = constitution
            .judging_mode
            .sealer()
            .ok_or(Error::WrongJudgingMode)?;

        sealer.require_auth();

        let state = storage::load_state(&env)?;
        if state.phase != Phase::Judging {
            return Err(Error::WrongPhase);
        }
        if env.ledger().timestamp() < state.schedule.judging_closes_at {
            return Err(Error::DeadlineNotReached);
        }
        if storage::has_score_root(&env) {
            return Err(Error::RootAlreadyPublished);
        }

        storage::save_score_root(&env, &root);
        events::score_root_published(&env, &root);

        Ok(())
    }

    /// Opens one sealed scorecard.
    //
    // Anyone may call this and it needs no signature, because the proof is the
    // authorization: a scorecard that does not sit under the published root is
    // refused, and one that does was written by the judge it names before the
    // window closed. That is what lets a participant open every scorecard
    // themselves rather than waiting for somebody to publish them.
    pub fn reveal_score(
        env: Env,
        scorecard: Scorecard,
        proof: Vec<BytesN<32>>,
    ) -> Result<u32, Error> {
        if storage::load_state(&env)?.phase != Phase::Reveal {
            return Err(Error::WrongPhase);
        }

        let root = storage::load_score_root(&env)?;
        let leaf = hashing::scorecard_leaf(&env, &scorecard);

        if !merkle::verify(&env, &root, &leaf, &proof) {
            return Err(Error::ProofDoesNotMatchRoot);
        }

        if storage::has_score(&env, scorecard.team, &scorecard.judge) {
            return Err(Error::ScorecardAlreadyRecorded);
        }

        let submission = storage::load_submission(&env, scorecard.team)?;
        let constitution = storage::load_constitution(&env)?;

        if !Self::may_judge(&env, &constitution, &scorecard.judge, &submission.track) {
            return Err(Error::NotJudge);
        }

        // A judge who stepped away is not counted, even if the sealer included
        // their card. Otherwise the recusal would be cosmetic.
        if storage::has_recused(&env, &scorecard.judge, scorecard.team) {
            return Err(Error::JudgeRecused);
        }

        let track = Self::rubric_of(&env, &constitution, &submission.track)?;
        let weighted = scorecard.weighted_total(&track)?;

        storage::save_score(&env, scorecard.team, &scorecard.judge, weighted);

        // The per criterion tallies are what the tie break chain reads when it
        // is asked to separate two projects on a single criterion, which the
        // blended weighted total can no longer answer.
        for entry in scorecard.scores.iter() {
            storage::bump_criterion_tally(&env, scorecard.team, &entry.criterion, entry.score);
        }

        events::score_revealed(&env, &scorecard.judge, scorecard.team, weighted);

        Ok(weighted)
    }

    /// Seals every community ballot behind one digest.
    //
    // The same address that seals the scorecards seals the ballots, and for
    // the same reason: the crowd votes in a single action off chain, and
    // asking two hundred people to come back and reveal would lose most of
    // them. What the sealer cannot do is drop a ballot without the voter who
    // cast it being able to prove the omission.
    pub fn publish_ballot_root(env: Env, root: BytesN<32>) -> Result<(), Error> {
        let constitution = storage::load_constitution(&env)?;
        if !constitution.community_vote_enabled() {
            return Err(Error::CommunityVoteDisabled);
        }

        let sealer = constitution
            .judging_mode
            .sealer()
            .ok_or(Error::WrongJudgingMode)?;
        sealer.require_auth();

        let state = storage::load_state(&env)?;
        if state.phase != Phase::Judging {
            return Err(Error::WrongPhase);
        }
        if env.ledger().timestamp() < state.schedule.community_vote_closes_at {
            return Err(Error::DeadlineNotReached);
        }
        if storage::has_ballot_root(&env) {
            return Err(Error::RootAlreadyPublished);
        }

        storage::save_ballot_root(&env, &root);
        events::ballot_root_published(&env, &root);

        Ok(())
    }

    /// Opens one sealed ballot and counts it.
    //
    // Three gates stand between a sealed ballot and the tally. The voter has
    // to have been approved before registration closed, so an organizer cannot
    // admit an electorate once they know what it would decide. They cannot
    // have been counted before, so one wallet spends its power once. And the
    // ballot has to be the shape the rules froze: every point placed, across
    // no more projects than the document allows.
    //
    // A voter may back their own team. That is a deliberate loosening of an
    // earlier refusal, and it is not free: a team of five can place fifty
    // points on itself, so a project's own members are a visible part of its
    // total rather than something the contract quietly removes. The event
    // carries the whole ballot, which is what lets a reader separate the two.
    //
    // A choice naming a project that screening ruled out is dropped rather
    // than taken as a reason to refuse the ballot. The voter chose while that
    // project was still standing, and the alternative — voiding every ballot
    // that happened to name it — would let one disqualification silently
    // delete the rest of somebody's vote.
    //
    // Like the scorecard reveal, this needs no signature: the proof is what
    // authorizes it.
    pub fn reveal_ballot(
        env: Env,
        voter: Address,
        choices: Vec<VoteChoice>,
        proof: Vec<BytesN<32>>,
    ) -> Result<(), Error> {
        let state = storage::load_state(&env)?;
        if state.phase != Phase::Reveal {
            return Err(Error::WrongPhase);
        }

        let root = storage::load_ballot_root(&env)?;
        let leaf = hashing::ballot_leaf(&env, &voter, &choices);

        if !merkle::verify(&env, &root, &leaf, &proof) {
            return Err(Error::ProofDoesNotMatchRoot);
        }

        if storage::has_ballot_counted(&env, &voter) {
            return Err(Error::BallotAlreadyCounted);
        }

        if !storage::load_registration(&env, &voter)?
            .may_vote(state.schedule.registration_closes_at)
        {
            return Err(Error::VoterNotEligible);
        }

        let constitution = storage::load_constitution(&env)?;
        validate_ballot(&choices, &constitution.vote)?;

        /* Marked before the points are placed, so a ballot whose every choice
        turns out to be ruled out still uses the wallet up. */
        storage::mark_voted(&env, &voter);

        for choice in choices.iter() {
            // Loading it is also what proves the team exists: a ballot naming a
            // project nobody entered is refused here rather than counted into
            // a total for a team that was never created.
            if storage::load_submission(&env, choice.team)?.is_valid() {
                storage::add_vote_weight(&env, choice.team, choice.weight);
            }
        }

        events::ballot_counted(&env, &voter, &choices);

        Ok(())
    }

    /// Computes the ranking and closes the result.
    //
    // Nothing is accepted from the caller. The contract reads the revealed
    // scorecards, the counted ballots and the locked formula, and works the
    // order out itself, which is the difference between a result anybody can
    // reproduce and a result somebody announced.
    //
    // Every project that was ruled out in screening, or that never reached the
    // judge quorum, is left out of the ranking rather than placed last. Those
    // are different situations from a project that was judged and came last,
    // and the page shows which one applies.
    //
    // A disqualification case still open holds this call back. Closing the
    // ranking around an entry whose standing is undecided would force the
    // outcome one way while the team still had time to answer, and there is no
    // way back once the result is final.
    pub fn finalize_results(env: Env) -> Result<(), Error> {
        let state = storage::load_state(&env)?;
        if state.phase != Phase::Reveal {
            return Err(Error::WrongPhase);
        }

        for team_id in 1..=storage::team_count(&env) {
            if let Ok(case) = storage::load_disqualification(&env, team_id) {
                if !case.resolved {
                    return Err(Error::DisqualificationUnresolved);
                }
            }
        }

        let constitution = storage::load_constitution(&env)?;

        for track in constitution.tracks.iter() {
            let ranking = Self::rank_track(&env, &constitution, &track.id)?;
            storage::save_ranking(&env, &track.id, &ranking);
            events::track_ranked(&env, &track.id, ranking.len());
        }

        /* And the ones sponsors opened. A track that is ranked nowhere has no
        placement for its position to pay, so leaving these out would strand
        every bounty a sponsor brought. */
        for id in storage::sponsor_track_ids(&env).iter() {
            if !Self::is_running_sponsor_track(&env, &id) {
                continue;
            }

            let ranking = Self::rank_track(&env, &constitution, &id)?;
            storage::save_ranking(&env, &id, &ranking);
            events::track_ranked(&env, &id, ranking.len());
        }

        let mut closed = state.advance(env.ledger().timestamp())?;
        closed.finalized_at = env.ledger().timestamp();

        storage::save_state(&env, &closed);
        events::results_finalized(&env, closed.finalized_at);

        Ok(())
    }

    /// Pays one team member their share of one prize position.
    //
    // A prize is split equally across the team and each member is paid
    // directly, so the contract shows the last hop of the money rather than
    // stopping at the captain's address and leaving the rest to trust.
    //
    // One member at a time, and that is not a convenience. A Stellar account
    // holding no trustline for the prize asset cannot receive it, and the
    // transfer that fails takes the whole transaction with it. Paying a team
    // in one call would therefore let a single unprepared member freeze their
    // teammates' money as surely as an unprepared winner used to freeze the
    // other positions. Paid one at a time, they block only themselves.
    //
    // No signature is asked for. The ranking is settled, the amounts come
    // from the locked prize table, the split is arithmetic and the recipients
    // come from the team, so there is nothing left for anybody to decide.
    // Making this the organizer's call would only give them the power to sit
    // on it.
    pub fn settle_prize(
        env: Env,
        track: Symbol,
        rank: u32,
        member: Address,
    ) -> Result<i128, Error> {
        let state = storage::load_state(&env)?;
        if state.phase != Phase::Settlement {
            return Err(Error::WrongPhase);
        }
        if state.settlement_paused {
            return Err(Error::SettlementPaused);
        }

        let (team, share) = Self::share_due(&env, &track, rank, &member)?;

        Self::hand_over(&env, &track, rank, &member, &member, share, team.size())?;
        events::prize_paid(&env, &member, &track, rank, team.id, share);

        Ok(share)
    }

    /// Sends the platform its cut, once.
    //
    // A call of its own rather than a slice taken off each prize, because the
    // fee is charged on top of the table and never out of it: a winner is paid
    // the number their position announced. Taking it here also means the fee
    // cannot fail a prize payment. If the collector's account is unprepared for
    // the asset, this call fails and every winner is still paid.
    //
    // Anyone may call it, like the prize payments beside it, and for the same
    // reason. The amount, the recipient and the rate were all frozen at the
    // lock, so there is nothing left for anybody to decide and making it the
    // organizer's call would only give them the power to sit on it. The
    // platform sitting on it is no better: an unsettled fee holds a balance in
    // a vault that is supposed to empty.
    //
    // A zero fee is settled rather than refused. The vault will not move zero,
    // so nothing is transferred, but the event is published and the marker is
    // written, which is what makes a free event distinguishable from one whose
    // fee is still outstanding.
    pub fn settle_platform_fee(env: Env) -> Result<i128, Error> {
        let state = storage::load_state(&env)?;
        if state.phase != Phase::Settlement {
            return Err(Error::WrongPhase);
        }
        if state.settlement_paused {
            return Err(Error::SettlementPaused);
        }

        // Reusing the prize error rather than adding a case. The spec caps an
        // error enum at fifty and this contract is at forty eight; a distinct
        // name for "this exact payment has already happened" is not worth one of
        // the two remaining slots when the existing one says precisely that.
        if storage::is_platform_fee_settled(&env) {
            return Err(Error::PrizeAlreadyPaid);
        }

        let constitution = storage::load_constitution(&env)?;

        /* Both cuts in one payment. The first is a function of the frozen
        table; the second was accumulated as sponsors arrived, each one
        having funded its own. Settling them separately would mean two
        markers, two ways to be half paid, and a `complete` that has to check
        both. */
        let amount = constitution.platform_fee_amount()? + storage::load_sponsored_fee(&env);
        let collector = constitution.platform_fee.collector.clone();

        storage::mark_platform_fee_settled(&env);

        if amount > 0 {
            let vault = storage::load_vault(&env)?;
            VaultClient::new(&env, &vault).pay(&collector, &amount);
        }

        events::platform_fee_settled(&env, &collector, amount, constitution.platform_fee.bps);

        Ok(amount)
    }

    /// What one member is owed from a position, refusing anything already
    /// settled.
    //
    // Shared by the payout and the sweep because the two differ only in where
    // the money goes; everything about who is owed what is the same question
    // and deserves one answer.
    fn share_due(
        env: &Env,
        track: &Symbol,
        rank: u32,
        member: &Address,
    ) -> Result<(Team, i128), Error> {
        if storage::is_paid(env, track, rank) {
            return Err(Error::PrizeAlreadyPaid);
        }
        if storage::is_share_settled(env, track, rank, member) {
            return Err(Error::PrizeAlreadyPaid);
        }

        /* What the position is worth rather than what the table froze. A
        sponsored position pays the frozen amount plus what was added to it,
        and reading the tier alone here would leave the difference in a vault
        that nothing else can reach. */
        let worth = Self::worth_of(env, track, rank)?;

        let placement = storage::load_ranking(env, track)?
            .iter()
            .find(|placement| placement.rank == rank)
            .ok_or(Error::ResultsNotFinalized)?;

        let team = storage::load_team(env, placement.team)?;
        let share = team.share_of(worth, member).ok_or(Error::NotTeamMember)?;

        Ok((team, share))
    }

    /// Moves one share out of the vault and closes the position once the last
    /// one has gone.
    //
    // A share of nothing is recorded without a transfer. It happens when a
    // prize is smaller than the team, and the vault refuses to move zero, so
    // paying it would fail rather than settle. Leaving it unrecorded would
    // hold the position open forever and stop the hackathon from ever closing.
    fn hand_over(
        env: &Env,
        track: &Symbol,
        rank: u32,
        member: &Address,
        to: &Address,
        share: i128,
        size: u32,
    ) -> Result<(), Error> {
        if storage::settle_share(env, track, rank, member) == size {
            storage::mark_paid(env, track, rank);
        }

        if share > 0 {
            let vault = storage::load_vault(env)?;
            VaultClient::new(env, &vault).pay(to, &share);
        }

        Ok(())
    }

    /// Opens settlement once the safety window has run out.
    //
    // The window buys time to stop a payout after a bug is found between the
    // ranking and the money moving. It cannot change a score either way, and
    // it is capped, because a hold nobody can end is indistinguishable from
    // not paying at all.
    pub fn open_settlement(env: Env) -> Result<(), Error> {
        let state = storage::load_state(&env)?;
        if state.phase != Phase::Finalization {
            return Err(Error::WrongPhase);
        }

        let hold = storage::load_constitution(&env)?
            .discretion
            .settlement
            .hold_seconds();

        if env.ledger().timestamp() < state.finalized_at + hold {
            return Err(Error::SafetyWindowOpen);
        }

        let mut opened = state.advance(env.ledger().timestamp())?;
        opened.settlement_opened_at = env.ledger().timestamp();

        storage::save_state(&env, &opened);
        events::phase_advanced(&env, Phase::Settlement);

        Ok(())
    }

    /// Holds the money where it is, with a reason.
    //
    // Scores are untouchable either way. This stops payment and nothing else,
    // which is the only power worth having when a contract bug turns up after
    // the ranking is already correct.
    pub fn pause_settlement(env: Env, reason: BytesN<32>) -> Result<(), Error> {
        let organizers = storage::load_organizing_team(&env)?;
        organizers.organizer.require_auth();

        let mut state = storage::load_state(&env)?;
        if state.phase != Phase::Finalization && state.phase != Phase::Settlement {
            return Err(Error::WrongPhase);
        }
        if state.settlement_paused {
            return Err(Error::SettlementPaused);
        }

        state.settlement_paused = true;
        storage::save_state(&env, &state);
        events::settlement_held(&env, true, &reason);

        Ok(())
    }

    /// Lets the money move again.
    pub fn resume_settlement(env: Env, reason: BytesN<32>) -> Result<(), Error> {
        let organizers = storage::load_organizing_team(&env)?;
        organizers.organizer.require_auth();

        let mut state = storage::load_state(&env)?;
        if !state.settlement_paused {
            return Err(Error::SettlementNotPaused);
        }

        state.settlement_paused = false;
        storage::save_state(&env, &state);
        events::settlement_held(&env, false, &reason);

        Ok(())
    }

    /// Returns a position that never had a winner.
    //
    // A track nobody entered, or one whose entries all fell short of the
    // quorum, still has a prize sitting against it, and a vault that can never
    // empty is a vault whose balance stops meaning anything. This is the whole
    // position at once because there is no team to split it between.
    //
    // A position that was won is out of reach here however long nobody
    // collects it. Its shares belong to named people, and each one is returned
    // on its own through `sweep_share`.
    pub fn sweep_unclaimed(env: Env, track: Symbol, rank: u32) -> Result<i128, Error> {
        let tier = Self::sweepable(&env, &track, rank)?;

        if storage::load_ranking(&env, &track)?
            .iter()
            .any(|placement| placement.rank == rank)
        {
            return Err(Error::PrizeAlreadyPaid);
        }

        storage::mark_paid(&env, &track, rank);

        let back_to = Self::refund_target(&env, &track)?;
        VaultClient::new(&env, &storage::load_vault(&env)?).pay(&back_to, &tier);

        events::prize_swept(&env, &track, rank, tier);

        Ok(tier)
    }

    /// Returns one member's share, once they have had the window they were
    /// promised and not used it.
    //
    // Only that member's share moves. A teammate who did collect keeps what
    // they collected, and a teammate who has not yet still has until the
    // period runs out for them too, because the period is the same for
    // everybody and counts from the moment the money became payable.
    pub fn sweep_share(env: Env, track: Symbol, rank: u32, member: Address) -> Result<i128, Error> {
        Self::sweepable(&env, &track, rank)?;

        let (team, share) = Self::share_due(&env, &track, rank, &member)?;
        let back_to = Self::refund_target(&env, &track)?;

        Self::hand_over(&env, &track, rank, &member, &back_to, share, team.size())?;
        events::share_swept(&env, &track, rank, &member, share);

        Ok(share)
    }

    /// The conditions both sweeps share, and the amount the position carries.
    fn sweepable(env: &Env, track: &Symbol, rank: u32) -> Result<i128, Error> {
        let state = storage::load_state(env)?;
        if state.phase != Phase::Settlement {
            return Err(Error::WrongPhase);
        }
        if storage::is_paid(env, track, rank) {
            return Err(Error::PrizeAlreadyPaid);
        }

        let constitution = storage::load_constitution(env)?;
        let claim_period = constitution.discretion.prize_claim_period;

        if env.ledger().timestamp() < state.settlement_opened_at + claim_period {
            return Err(Error::ClaimPeriodOpen);
        }

        Self::worth_of(env, track, rank)
    }

    /// Closes the hackathon for good.
    //
    // Every prize position has to have been settled one way or another first:
    // paid to a winner, returned after a no award, or swept once the claim
    // period ran out. A hackathon that closed with money still owed would be
    // exactly the outcome the proof page exists to make impossible.
    //
    // The platform's cut is one of the things owed. Letting an event close
    // without it would leave the fee in a vault nothing can reach afterwards,
    // and would make the platform the one party in this system whose money can
    // be stranded by finishing the event correctly. It is checked last, so the
    // failure a caller sees names the missing prize when both are outstanding.
    pub fn complete(env: Env) -> Result<(), Error> {
        let state = storage::load_state(&env)?;
        if state.phase != Phase::Settlement {
            return Err(Error::WrongPhase);
        }

        let constitution = storage::load_constitution(&env)?;
        for tier in Self::payable_positions(&env, &constitution).iter() {
            if !storage::is_paid(&env, &tier.track, tier.rank) {
                return Err(Error::SettlementIncomplete);
            }
        }

        if !storage::is_platform_fee_settled(&env) {
            return Err(Error::SettlementIncomplete);
        }

        storage::save_state(&env, &state.advance(env.ledger().timestamp())?);
        events::phase_advanced(&env, Phase::Completed);

        Ok(())
    }

    /// Opens a track's move to award nothing.
    //
    // The track had to be marked for this before the rules locked, which means
    // every participant read it before writing a line of code. An organizer
    // who did not mark it cannot reach for this afterwards, however
    // disappointing the entries turned out to be.
    pub fn open_no_award(env: Env, track: Symbol, reason: BytesN<32>) -> Result<(), Error> {
        let organizers = storage::load_organizing_team(&env)?;
        organizers.organizer.require_auth();

        let state = storage::load_state(&env)?;
        if state.phase != Phase::Finalization {
            return Err(Error::WrongPhase);
        }

        let constitution = storage::load_constitution(&env)?;
        let definition = Self::rubric_of(&env, &constitution, &track)?;

        if !definition.no_award_allowed {
            return Err(Error::NoAwardNotDeclarable);
        }
        if storage::has_no_award(&env, &track) {
            return Err(Error::CaseAlreadyOpen);
        }

        storage::save_no_award(
            &env,
            &track,
            &NoAwardCase {
                opened_at: env.ledger().timestamp(),
                reason: reason.clone(),
                approvals: 0,
                resolved: false,
            },
        );

        events::no_award_opened(&env, &track, &reason);

        Ok(())
    }

    /// Adds a judge's signature to that move.
    //
    // Withholding a prize is the one decision that most needs somebody other
    // than the organizer to agree, since the organizer is the party the money
    // goes back to.
    pub fn approve_no_award(env: Env, judge: Address, track: Symbol) -> Result<(), Error> {
        judge.require_auth();

        let constitution = storage::load_constitution(&env)?;
        if !Self::may_judge(&env, &constitution, &judge, &track) {
            return Err(Error::NotJudge);
        }

        let mut case = storage::load_no_award(&env, &track)?;
        if case.resolved {
            return Err(Error::CaseNotOpen);
        }
        if storage::has_no_award_approval(&env, &track, &judge) {
            return Err(Error::AlreadySigned);
        }

        storage::save_no_award_approval(&env, &track, &judge);
        case.approvals += 1;
        storage::save_no_award(&env, &track, &case);

        events::no_award_approved(&env, &track, &judge, case.approvals);

        Ok(())
    }

    /// Settles the move, one way or the other.
    //
    // The appeal window has to have run out and the judges have to have
    // signed. If either is missing the move fails and the track pays out
    // normally, which is the right default: a prize that was announced is owed
    // unless somebody clears a bar to withhold it.
    pub fn resolve_no_award(env: Env, track: Symbol) -> Result<bool, Error> {
        let state = storage::load_state(&env)?;
        if state.phase != Phase::Finalization {
            return Err(Error::WrongPhase);
        }

        let mut case = storage::load_no_award(&env, &track)?;
        if case.resolved {
            return Err(Error::CaseNotOpen);
        }

        let constitution = storage::load_constitution(&env)?;
        let window = constitution.discretion.appeal_window;

        if env.ledger().timestamp() < case.opened_at + window {
            return Err(Error::AppealWindowOpen);
        }

        let declared = case.approvals >= constitution.discretion.disqualification_threshold;

        case.resolved = true;
        storage::save_no_award(&env, &track, &case);

        let mut returned = 0i128;
        if declared {
            // Every position in the track is marked paid so settlement cannot
            // reach them, and the money goes back along the announced route.
            let organizer = storage::load_organizing_team(&env)?.organizer;
            let vault = VaultClient::new(&env, &storage::load_vault(&env)?);

            for tier in constitution.prize_tiers.iter() {
                if tier.track != track || storage::is_paid(&env, &track, tier.rank) {
                    continue;
                }

                storage::mark_paid(&env, &track, tier.rank);
                vault.pay(&organizer, &tier.amount);
                returned += tier.amount;
            }
        }

        events::no_award_resolved(&env, &track, declared, returned);

        Ok(declared)
    }

    /// A track's move to award nothing, if one was opened.
    pub fn no_award(env: Env, track: Symbol) -> Result<NoAwardCase, Error> {
        storage::load_no_award(&env, &track)
    }

    /// Whether a prize position has already been paid.
    pub fn is_paid(env: Env, track: Symbol, rank: u32) -> bool {
        storage::is_paid(&env, &track, rank)
    }

    /// One track's finished ranking, in order.
    pub fn ranking(env: Env, track: Symbol) -> Result<Vec<Placement>, Error> {
        storage::load_ranking(&env, &track)
    }

    /// Whether a project gathered the scorecards its track's quorum asks for.
    pub fn meets_quorum(env: Env, team_id: u32) -> Result<bool, Error> {
        let constitution = storage::load_constitution(&env)?;
        if !constitution.vote.judge_score_counts() {
            return Ok(true);
        }

        Ok(storage::load_score_tally(&env, team_id).count >= constitution.judge_quorum)
    }

    /// Builds one track's ranking from what was revealed.
    fn rank_track(
        env: &Env,
        constitution: &Constitution,
        track: &Symbol,
    ) -> Result<Vec<Placement>, Error> {
        let top_votes = storage::top_vote_weight(env);
        let quorum_binds = constitution.vote.judge_score_counts();

        let mut ordered: Vec<Candidate> = Vec::new(env);

        for team_id in 1..=storage::team_count(env) {
            let submission = match storage::load_submission(env, team_id) {
                Ok(submission) => submission,
                Err(_) => continue,
            };

            if &submission.track != track || !submission.is_valid() {
                continue;
            }

            let tally = storage::load_score_tally(env, team_id);
            if quorum_binds && tally.count < constitution.judge_quorum {
                continue;
            }

            let community = results::community_score(storage::vote_weight(env, team_id), top_votes);
            let judge_average = tally.average();

            let candidate = Candidate {
                team: team_id,
                final_score: results::final_score(&constitution.vote, judge_average, community),
                judge_average: judge_average.unwrap_or(0),
                community,
                submitted_at: submission.submitted_at,
                criterion_averages: Self::tie_break_averages(env, constitution, team_id),
            };

            // Insertion sort. Team counts are in the tens, and a sort a reader
            // can follow line by line is worth more here than one that would be
            // faster on data this contract will never see.
            let mut at = ordered.len();
            while at > 0 {
                let above = ordered.get(at - 1).unwrap();
                if results::compare(&candidate, &above, &constitution.tie_break).0
                    != core::cmp::Ordering::Greater
                {
                    break;
                }
                at -= 1;
            }
            ordered.insert(at, candidate);
        }

        let mut ranking: Vec<Placement> = Vec::new(env);
        for index in 0..ordered.len() {
            let candidate = ordered.get(index).unwrap();

            let decided_by = if index == 0 {
                results::DecidedBy::Score
            } else {
                let above = ordered.get(index - 1).unwrap();
                results::compare(&above, &candidate, &constitution.tie_break).1
            };

            ranking.push_back(Placement {
                team: candidate.team,
                rank: index + 1,
                final_score: candidate.final_score,
                judge_average: candidate.judge_average,
                community: candidate.community,
                decided_by,
            });
        }

        Ok(ranking)
    }

    /// Means for exactly the criteria the tie break chain names.
    //
    // Gathering only those keeps the candidate small and makes the comparison
    // a pure function of what the constitution actually asked for.
    fn tie_break_averages(
        env: &Env,
        constitution: &Constitution,
        team_id: u32,
    ) -> Vec<CriterionScore> {
        let mut averages = Vec::new(env);

        for rule in constitution.tie_break.iter() {
            if let TieBreakRule::Criterion(id) = rule {
                let tally = storage::load_criterion_tally(env, team_id, &id);
                averages.push_back(CriterionScore {
                    criterion: id,
                    score: tally.average().unwrap_or(0),
                });
            }
        }

        averages
    }

    /// The digest sealing the ballots.
    pub fn ballot_root(env: Env) -> Result<BytesN<32>, Error> {
        storage::load_ballot_root(&env)
    }

    /// How many points a project has been given, across every ballot counted.
    pub fn vote_weight(env: Env, team_id: u32) -> u32 {
        storage::vote_weight(&env, team_id)
    }

    /// The largest total any project holds.
    //
    // This is the denominator the community score is measured against, so the
    // project the crowd gave most to scores a hundred and the rest are placed
    // relative to it.
    pub fn top_vote_weight(env: Env) -> u32 {
        storage::top_vote_weight(&env)
    }

    /// Whether this wallet's ballot has already been counted.
    pub fn has_voted(env: Env, voter: Address) -> bool {
        storage::has_ballot_counted(&env, &voter)
    }

    /// The digest sealing the scorecards.
    pub fn score_root(env: Env) -> Result<BytesN<32>, Error> {
        storage::load_score_root(&env)
    }

    /// One judge's weighted total for one project, once revealed.
    pub fn score(env: Env, team_id: u32, judge: Address) -> Result<u32, Error> {
        storage::load_score(&env, team_id, &judge)
    }

    /// A project's revealed scorecards, as a count and a sum.
    pub fn score_tally(env: Env, team_id: u32) -> ScoreTally {
        storage::load_score_tally(&env, team_id)
    }

    /// One criterion's revealed scores for one project.
    pub fn criterion_tally(env: Env, team_id: u32, criterion: Symbol) -> CriterionTally {
        storage::load_criterion_tally(&env, team_id, &criterion)
    }

    /// Whether this judge stepped away from this project.
    pub fn is_recused(env: Env, judge: Address, team_id: u32) -> bool {
        storage::has_recused(&env, &judge, team_id)
    }

    /// How many judges are left to score a project, after recusals.
    //
    // This is the number the quorum is measured against, so a project whose
    // bench emptied out through honest conflicts is visibly short of judges
    // rather than mysteriously unfinishable.
    pub fn available_judges(env: Env, team_id: u32) -> Result<u32, Error> {
        let submission = storage::load_submission(&env, team_id)?;
        let constitution = storage::load_constitution(&env)?;
        let bench = Self::bench_for(&env, &constitution, &submission.track);
        let assigned = constitution.judges_on_track(&bench);

        Ok(assigned.saturating_sub(storage::recusal_count(&env, team_id)))
    }

    /// One team's entry.
    pub fn submission(env: Env, team_id: u32) -> Result<Submission, Error> {
        storage::load_submission(&env, team_id)
    }

    /// One person's registration.
    pub fn registration(env: Env, applicant: Address) -> Result<Registration, Error> {
        storage::load_registration(&env, &applicant)
    }

    /// One team.
    pub fn team_by_id(env: Env, id: u32) -> Result<Team, Error> {
        storage::load_team(&env, id)
    }

    /// How many teams have been founded.
    pub fn team_count(env: Env) -> u32 {
        storage::team_count(&env)
    }

    /// The teams one person belongs to.
    pub fn membership(env: Env, who: Address) -> Vec<u32> {
        storage::load_membership(&env, &who)
    }

    /// Whether this person may cast a community ballot.
    pub fn may_vote(env: Env, who: Address) -> Result<bool, Error> {
        let closes_at = storage::load_state(&env)?.schedule.registration_closes_at;

        Ok(storage::load_registration(&env, &who)?.may_vote(closes_at))
    }

    fn require_open_and_approved(env: &Env, who: &Address) -> Result<(), Error> {
        if storage::load_state(env)?.phase != Phase::Open {
            return Err(Error::WrongPhase);
        }

        if !storage::load_registration(env, who)?.is_approved() {
            return Err(Error::NotApproved);
        }

        Ok(())
    }

    fn require_free_to_join(env: &Env, who: &Address, policy: &TeamPolicy) -> Result<(), Error> {
        if !policy.multi_team_allowed && !storage::load_membership(env, who).is_empty() {
            return Err(Error::TeamJoinRejected);
        }

        Ok(())
    }

    fn record_membership(env: &Env, who: &Address, team_id: u32) {
        let mut teams = storage::load_membership(env, who);
        teams.push_back(team_id);
        storage::save_membership(env, who, &teams);
    }

    /// What has to be in the vault before the hackathon may open: the prize
    /// table plus the platform's cut.
    pub fn required_funding(env: Env) -> Result<i128, Error> {
        storage::load_constitution(&env)?.required_funding()
    }

    /// What the prize table on its own adds up to.
    //
    // Separate from the line above now that a fee sits between them, so a page
    // showing "the prize" and a page showing "what the organizer deposits" read
    // two numbers rather than one number and a subtraction somebody has to know
    // to perform.
    pub fn prize_total(env: Env) -> Result<i128, Error> {
        storage::load_constitution(&env)?.prize_total()
    }

    /// What the platform is owed for this event, at the rate frozen at the lock.
    pub fn platform_fee(env: Env) -> Result<i128, Error> {
        storage::load_constitution(&env)?.platform_fee_amount()
    }

    /// Whether that cut has left the vault.
    pub fn is_platform_fee_settled(env: Env) -> bool {
        storage::is_platform_fee_settled(&env)
    }

    /// What the vault actually holds.
    pub fn funding(env: Env) -> Result<i128, Error> {
        let vault = storage::load_vault(&env)?;

        Ok(VaultClient::new(&env, &vault).balance())
    }

    /// Whether the prize is covered in full.
    pub fn is_fully_funded(env: Env) -> Result<bool, Error> {
        Ok(Self::funding(env.clone())? >= Self::required_funding(env)?)
    }

    /// The vault holding this hackathon's prize.
    pub fn vault(env: Env) -> Result<Address, Error> {
        storage::load_vault(&env)
    }

    /// The rules, draft or locked.
    pub fn constitution(env: Env) -> Result<Constitution, Error> {
        storage::load_constitution(&env)
    }

    /// The digest of the locked rules, once they are locked.
    pub fn constitution_hash(env: Env) -> Result<BytesN<32>, Error> {
        storage::load_constitution_hash(&env)
    }

    /// Where the hackathon is in its lifecycle, and the deadlines in force.
    pub fn state(env: Env) -> Result<HackathonState, Error> {
        storage::load_state(&env)
    }

    /// What one deadline has spent of its announced allowance.
    //
    // Read beside `constitution().extensions`, this is what tells a
    // participant how much further a window could still move, which is the
    // question an announced allowance exists to answer.
    pub fn extension_usage(env: Env, deadline: Deadline) -> ExtensionUsage {
        storage::load_extension_usage(&env, deadline)
    }

    /// The organizer and their collaborators.
    pub fn team(env: Env) -> Result<OrganizingTeam, Error> {
        storage::load_organizing_team(&env)
    }

    /// The current phase, which is the one value most readers want.
    pub fn phase(env: Env) -> Result<Phase, Error> {
        Ok(storage::load_state(&env)?.phase)
    }
}

/*
  The two steps `set_up` shares with the entry points they came from.

  They exist because of one host rule: `require_auth` for the same address twice
  in the same invocation is refused as a duplicate authorization. `set_up` checks
  the organizer's signature once and then does the work of `lock_rules` and
  `bind_vault`, so the work had to come out of them. Neither helper checks a
  signature; every caller does that first, and there is no path to them from
  outside the contract.
*/

/// One deadline and where it is going.
//
// A type rather than a pair, because a `Vec` of two anonymous numbers is a
// list nobody can read at a call site and nothing stops being reversed.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeadlineMove {
    pub deadline: Deadline,
    pub moved_to: u64,
}

/*
  The body both extension calls share.

  Neither checks a signature: every caller does that first, and `require_auth`
  twice for one address in one frame is refused by the host as a duplicate
  authorization. There is no path here from outside the contract.
*/
fn move_deadlines(env: &Env, moves: &Vec<DeadlineMove>, reason: &BytesN<32>) -> Result<(), Error> {
    if moves.is_empty() {
        return Err(Error::ScheduleInvalid);
    }

    let state = storage::load_state(env)?;
    if state.phase.is_configurable() || state.phase.is_terminal() {
        return Err(Error::WrongPhase);
    }

    let constitution = storage::load_constitution(env)?;
    let now = env.ledger().timestamp();

    let mut schedule = state.schedule.clone();

    for step in moves.iter() {
        /* Read inside the loop rather than once, so a call that moves the same
        deadline twice spends its allowance twice rather than half of it. */
        let usage = storage::load_extension_usage(env, step.deadline);
        let added = schedule.check_extension(step.deadline, step.moved_to, now)?;

        constitution
            .extensions
            .check(usage.times, usage.seconds_added, added)?;

        schedule = schedule.with_deadline(step.deadline, step.moved_to);

        storage::save_extension_usage(env, step.deadline, &usage.record(added)?);
        events::deadline_extended(env, step.deadline, step.moved_to, added, reason);
    }

    /* Once, at the end. A run that moves the whole schedule back passes through
    orders that make no sense — a submission deadline sitting past a
    screening round that has not moved yet — and refusing those would make
    the caller responsible for finding a route rather than a destination. */
    schedule.validate(constitution.community_vote_enabled())?;

    storage::save_state(env, &HackathonState { schedule, ..state });

    Ok(())
}

/// Freezes the rules and returns their digest.
fn freeze(env: &Env) -> Result<BytesN<32>, Error> {
    let state = storage::load_state(env)?;
    if !state.phase.is_configurable() {
        return Err(Error::RulesAlreadyLocked);
    }

    let constitution = storage::load_constitution(env)?;
    constitution.validate()?;

    let hash = hash_constitution(env, &constitution);

    storage::lock_constitution(env, &hash);
    storage::save_state(env, &state.advance(env.ledger().timestamp())?);

    events::rules_locked(env, &hash);

    Ok(hash)
}

/// Points the hackathon at a vault, checking the binding from both sides.
fn bind(env: &Env, vault: &Address) -> Result<(), Error> {
    if storage::has_vault(env) {
        return Err(Error::VaultAlreadyBound);
    }

    let state = storage::load_state(env)?;
    if state.phase != Phase::Funding {
        return Err(Error::WrongPhase);
    }

    let client = VaultClient::new(env, vault);
    if client.core() != env.current_contract_address() {
        return Err(Error::VaultRejected);
    }

    let constitution = storage::load_constitution(env)?;
    if client.asset() != constitution.prize_asset {
        return Err(Error::VaultRejected);
    }

    storage::save_vault(env, vault);
    events::vault_bound(env, vault);

    Ok(())
}
