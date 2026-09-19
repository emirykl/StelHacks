use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Vec};

use crate::constitution::{Constitution, TeamPolicy};
use crate::errors::Error;
use crate::events;
use crate::hashing::hash_constitution;
use crate::organizers::OrganizingTeam;
use crate::phase::Phase;
use crate::roster::{Registration, Team};
use crate::state::HackathonState;
use crate::storage;
use crate::vault::VaultClient;

/// The authority for a single hackathon.
#[contract]
pub struct HackathonCore;

#[contractimpl]
impl HackathonCore {
    /// Creates a hackathon in draft, with its first version of the rules.
    ///
    /// The rules are validated immediately rather than at the lock. A draft
    /// that cannot become a valid hackathon is not worth the ledger space, and
    /// an organizer discovers the problem while they are still editing rather
    /// than at the moment they meant to publish.
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
    ///
    /// Only the organizer, and only while the hackathon is still a draft. The
    /// phase check is what makes the lock mean anything: once the rules are
    /// frozen this call has no path back in, no matter who signs it.
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
            },
        );

        events::hackathon_configured(&env, &team.organizer);

        Ok(())
    }

    /// Adds a helper who can work through the application queue.
    ///
    /// Unlike the rules, the collaborator list stays editable for the whole
    /// event, because a hundred applications arriving at once is exactly when
    /// an organizer needs another pair of hands and exactly when they cannot
    /// wait for a new hackathon. The reach of that helper is narrow enough that
    /// widening the list under pressure is safe.
    pub fn add_collaborator(env: Env, collaborator: Address) -> Result<(), Error> {
        let mut team = storage::load_organizing_team(&env)?;
        team.organizer.require_auth();

        team.add_collaborator(collaborator.clone())?;
        storage::save_organizing_team(&env, &team);

        events::collaborator_added(&env, &collaborator);

        Ok(())
    }

    /// Removes a helper.
    ///
    /// Applications they already decided stay decided. Reversing those would
    /// mean a participant's admission could be revoked by an argument between
    /// organizers, which is not a thing the participant can defend against.
    pub fn remove_collaborator(env: Env, collaborator: Address) -> Result<(), Error> {
        let mut team = storage::load_organizing_team(&env)?;
        team.organizer.require_auth();

        team.remove_collaborator(&collaborator)?;
        storage::save_organizing_team(&env, &team);

        events::collaborator_removed(&env, &collaborator);

        Ok(())
    }

    /// Freezes the rules and returns their digest.
    ///
    /// This is the one irreversible step of the setup path, and everything the
    /// product promises rests on it. After this call the rules can be read by
    /// anyone and written by no one, so a participant who reads the page before
    /// they start building is reading the rules that will decide the result.
    pub fn lock_rules(env: Env) -> Result<BytesN<32>, Error> {
        let team = storage::load_organizing_team(&env)?;
        team.organizer.require_auth();

        let state = storage::load_state(&env)?;
        if !state.phase.is_configurable() {
            return Err(Error::RulesAlreadyLocked);
        }

        let constitution = storage::load_constitution(&env)?;
        constitution.validate()?;

        let hash = hash_constitution(&env, &constitution);

        storage::lock_constitution(&env, &hash);
        storage::save_state(&env, &state.advance(env.ledger().timestamp())?);

        events::rules_locked(&env, &hash);

        Ok(hash)
    }

    /// Points the hackathon at the vault holding its prize.
    ///
    /// The binding is checked from both sides rather than taken on the
    /// organizer's word. A vault serving a different hackathon, or holding a
    /// different token from the one the rules name, is refused; otherwise an
    /// organizer could point at a pool they control and publish a hackathon
    /// whose prize was never really committed.
    pub fn bind_vault(env: Env, vault: Address) -> Result<(), Error> {
        let team = storage::load_organizing_team(&env)?;
        team.organizer.require_auth();

        if storage::has_vault(&env) {
            return Err(Error::VaultAlreadyBound);
        }

        let state = storage::load_state(&env)?;
        if state.phase != Phase::Funding {
            return Err(Error::WrongPhase);
        }

        let client = VaultClient::new(&env, &vault);
        if client.core() != env.current_contract_address() {
            return Err(Error::VaultServesAnotherHackathon);
        }

        let constitution = storage::load_constitution(&env)?;
        if client.asset() != constitution.prize_asset {
            return Err(Error::VaultHoldsTheWrongAsset);
        }

        storage::save_vault(&env, &vault);
        events::vault_bound(&env, &vault);

        Ok(())
    }

    /// Opens the hackathon for registration and submissions.
    ///
    /// The funding check is the whole point of this call. A hackathon that
    /// announces a prize it does not hold is the first problem the product set
    /// out to remove, so the pool has to cover the prize table in full before
    /// anybody can sign up. Anyone may call this once that is true; making it
    /// the organizer's privilege would let them sit on a funded hackathon.
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

    /// Asks to take part.
    ///
    /// The request has to arrive before registration closes. An organizer may
    /// still be working through the queue after that, and a late approval is
    /// fine, but a late request is not: the deadline is what fixes who could
    /// possibly be in the electorate.
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
            return Err(Error::ApplicationAlreadyExists);
        }

        storage::save_registration(&env, &applicant, &Registration::pending(&env, now));
        events::applied(&env, &applicant);

        Ok(())
    }

    /// Lets someone in.
    ///
    /// Open to the organizer and to any collaborator, because a queue of a
    /// hundred applications is exactly the thing one person cannot clear alone.
    pub fn approve_application(
        env: Env,
        reviewer: Address,
        applicant: Address,
    ) -> Result<(), Error> {
        reviewer.require_auth();
        storage::load_organizing_team(&env)?.require_application_reviewer(&reviewer)?;

        let now = env.ledger().timestamp();
        let decided = storage::load_registration(&env, &applicant)?.approve(&env, now)?;

        storage::save_registration(&env, &applicant, &decided);
        events::application_decided(&env, &applicant, true, &decided.reason);

        Ok(())
    }

    /// Keeps someone out, on the record.
    ///
    /// The reason digest is required rather than optional. A refusal that
    /// leaves no trace is the quiet back door beside the disqualification
    /// process the product makes so much noise about.
    pub fn reject_application(
        env: Env,
        reviewer: Address,
        applicant: Address,
        reason: BytesN<32>,
    ) -> Result<(), Error> {
        reviewer.require_auth();
        storage::load_organizing_team(&env)?.require_application_reviewer(&reviewer)?;

        let now = env.ledger().timestamp();
        let decided = storage::load_registration(&env, &applicant)?.reject(now, reason)?;

        storage::save_registration(&env, &applicant, &decided);
        events::application_decided(&env, &applicant, false, &decided.reason);

        Ok(())
    }

    /// Starts a team, with the caller as its captain.
    ///
    /// The captain is the address the prize is paid to, so founding a team is
    /// also the moment somebody takes responsibility for settling up with the
    /// people who join it.
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
    ///
    /// Both sides sign: the captain because it is their team and their prize,
    /// the member because being placed on a team can cost them the right to
    /// join the one they meant to. Neither can do it alone.
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
            return Err(Error::AlreadyOnAnotherTeam);
        }

        Ok(())
    }

    fn record_membership(env: &Env, who: &Address, team_id: u32) {
        let mut teams = storage::load_membership(env, who);
        teams.push_back(team_id);
        storage::save_membership(env, who, &teams);
    }

    /// What the prize table adds up to.
    pub fn required_funding(env: Env) -> Result<i128, Error> {
        storage::load_constitution(&env)?.required_funding()
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

    /// The organizer and their collaborators.
    pub fn team(env: Env) -> Result<OrganizingTeam, Error> {
        storage::load_organizing_team(&env)
    }

    /// The current phase, which is the one value most readers want.
    pub fn phase(env: Env) -> Result<Phase, Error> {
        Ok(storage::load_state(&env)?.phase)
    }
}
