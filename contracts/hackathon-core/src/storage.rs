use soroban_sdk::{contracttype, Address, BytesN, Env, Symbol, Vec};

use crate::constitution::{Constitution, Deadline};
use crate::errors::Error;
use crate::organizers::OrganizingTeam;
use crate::results::{NoAwardCase, Placement};
use crate::roster::{Registration, Team};
use crate::scorecard::{CriterionTally, ScoreTally};
use crate::state::{ExtensionUsage, HackathonState};
use crate::submission::Submission;

/// Ledgers closed in a day, at roughly five seconds a ledger.
const LEDGERS_PER_DAY: u32 = 17_280;

/// How far ahead instance storage is pushed whenever it is written.
///
/// A hackathon runs for weeks and its proof page is supposed to outlive it, so
/// the lifetime is generous. Every write extends it, which means an active
/// hackathon can never expire underneath itself; only a finished one starts
/// counting down, and by then the indexer has everything.
pub const INSTANCE_LIFETIME_LEDGERS: u32 = 120 * LEDGERS_PER_DAY;

/// The remaining lifetime below which a write pushes the entry back out.
pub const INSTANCE_BUMP_THRESHOLD_LEDGERS: u32 = 90 * LEDGERS_PER_DAY;

/// Registrations and teams live in persistent storage rather than the instance,
/// because there can be hundreds of them and loading the instance would then
/// mean loading the whole event on every call. They carry the same lifetime as
/// the instance, since the proof page reads them long after the event ends.
const ENTRY_LIFETIME_LEDGERS: u32 = INSTANCE_LIFETIME_LEDGERS;
const ENTRY_BUMP_THRESHOLD_LEDGERS: u32 = INSTANCE_BUMP_THRESHOLD_LEDGERS;

/// Everything the core contract stores, one variant per family of entry.
///
/// Keys are an enum rather than loose symbols so that adding a new kind of
/// entry is a change the compiler sees. A typo in a raw symbol key writes to a
/// slot nobody reads, and that failure is silent, which is the worst shape a
/// storage bug can take when prize money is involved.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// The organizer and their collaborators.
    Organizers,
    /// The rules, once locked.
    Constitution,
    /// The digest of those rules, kept beside them so a reader never has to
    /// trust a client to recompute it.
    ConstitutionHash,
    /// Phase, effective schedule and the rest of what changes as the event runs.
    State,
    /// How much of its announced allowance one deadline has spent. Kept per
    /// deadline rather than as one counter, because the allowance is declared
    /// per deadline and a single counter would let a slipping submission window
    /// silently eat the judging window's room.
    Extensions(Deadline),
    /// The vault holding this hackathon's prize.
    Vault,
    /// One person's request to take part.
    Registration(Address),
    /// One team.
    Team(u32),
    /// How many teams exist, which is also the next team's identifier.
    TeamCount,
    /// The teams one person belongs to.
    Membership(Address),
    /// One team's entry, keyed by team because a team enters once.
    Submission(u32),
    /// A judge who stepped away from one project.
    Recusal(Address, u32),
    /// How many judges stepped away from one project, so the quorum can be
    /// checked without walking the whole bench.
    RecusalCount(u32),
    /// The digest sealing every scorecard until the reveal.
    ScoreRoot,
    /// One judge's weighted total for one project, once revealed.
    Score(u32, Address),
    /// How many scorecards a project has had revealed, and their sum, so the
    /// average never needs the whole list loaded.
    ScoreTally(u32),
    /// The digest sealing every community ballot until the reveal.
    BallotRoot,
    /// Whether one wallet's ballot has been counted.
    BallotCounted(Address),
    /// How many ballots one project has been given.
    VoteCount(u32),
    /// The largest vote count any project holds, which is the denominator the
    /// community score is measured against.
    TopVoteCount,
    /// One criterion's revealed scores for one project.
    CriterionTally(u32, Symbol),
    /// One track's finished ranking, in order.
    Ranking(Symbol),
    /// A prize position that has already been paid.
    Paid(Symbol, u32),
    /// A track's move to award nothing.
    NoAward(Symbol),
    /// One judge's signature on that move.
    NoAwardApproval(Symbol, Address),
}

/// Pushes the instance entry's lifetime out. Called on every write, so an
/// active hackathon keeps itself alive.
fn touch(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_BUMP_THRESHOLD_LEDGERS, INSTANCE_LIFETIME_LEDGERS);
}

/// Whether this contract instance has been created yet.
pub fn is_initialized(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Organizers)
}

pub fn save_organizing_team(env: &Env, team: &OrganizingTeam) {
    env.storage().instance().set(&DataKey::Organizers, team);
    touch(env);
}

pub fn load_organizing_team(env: &Env) -> Result<OrganizingTeam, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Organizers)
        .ok_or(Error::NotInitialized)
}

pub fn save_state(env: &Env, state: &HackathonState) {
    env.storage().instance().set(&DataKey::State, state);
    touch(env);
}

pub fn load_state(env: &Env) -> Result<HackathonState, Error> {
    env.storage()
        .instance()
        .get(&DataKey::State)
        .ok_or(Error::NotInitialized)
}

/// What a deadline has spent of its allowance. A deadline nobody has moved has
/// spent nothing, which is the same answer as no entry, so the caller never
/// handles both.
pub fn load_extension_usage(env: &Env, deadline: Deadline) -> ExtensionUsage {
    env.storage()
        .instance()
        .get(&DataKey::Extensions(deadline))
        .unwrap_or_else(ExtensionUsage::unused)
}

pub fn save_extension_usage(env: &Env, deadline: Deadline, usage: &ExtensionUsage) {
    env.storage()
        .instance()
        .set(&DataKey::Extensions(deadline), usage);
    touch(env);
}

/// Writes the rules while they are still a draft and still editable.
pub fn save_constitution(env: &Env, constitution: &Constitution) {
    env.storage()
        .instance()
        .set(&DataKey::Constitution, constitution);
    touch(env);
}

pub fn load_constitution(env: &Env) -> Result<Constitution, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Constitution)
        .ok_or(Error::NotInitialized)
}

/// Freezes the rules by recording their digest.
///
/// The phase remains the authority on whether a hackathon is locked, so that
/// there is one answer to that question rather than two that could drift
/// apart. This digest is the consequence of the lock and the value every later
/// reader compares against.
pub fn lock_constitution(env: &Env, hash: &BytesN<32>) {
    env.storage()
        .instance()
        .set(&DataKey::ConstitutionHash, hash);
    touch(env);
}

/// Binds the hackathon to the vault that holds its prize.
pub fn save_vault(env: &Env, vault: &Address) {
    env.storage().instance().set(&DataKey::Vault, vault);
    touch(env);
}

pub fn load_vault(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Vault)
        .ok_or(Error::VaultNotBound)
}

pub fn has_vault(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Vault)
}

fn touch_entry(env: &Env, key: &DataKey) {
    env.storage().persistent().extend_ttl(
        key,
        ENTRY_BUMP_THRESHOLD_LEDGERS,
        ENTRY_LIFETIME_LEDGERS,
    );
}

pub fn save_registration(env: &Env, applicant: &Address, registration: &Registration) {
    let key = DataKey::Registration(applicant.clone());
    env.storage().persistent().set(&key, registration);
    touch_entry(env, &key);
}

pub fn load_registration(env: &Env, applicant: &Address) -> Result<Registration, Error> {
    let key = DataKey::Registration(applicant.clone());
    let registration = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::ApplicationNotFound)?;
    touch_entry(env, &key);

    Ok(registration)
}

pub fn has_registration(env: &Env, applicant: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Registration(applicant.clone()))
}

/// The identifier the next team will take, counting from one so that zero can
/// stay a sentinel meaning no team.
pub fn next_team_id(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::TeamCount)
        .unwrap_or(0u32)
        + 1
}

pub fn save_team(env: &Env, team: &Team) {
    let key = DataKey::Team(team.id);
    env.storage().persistent().set(&key, team);
    touch_entry(env, &key);

    if team.id
        > env
            .storage()
            .instance()
            .get(&DataKey::TeamCount)
            .unwrap_or(0u32)
    {
        env.storage().instance().set(&DataKey::TeamCount, &team.id);
        touch(env);
    }
}

pub fn load_team(env: &Env, id: u32) -> Result<Team, Error> {
    let key = DataKey::Team(id);
    let team = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::TeamNotFound)?;
    touch_entry(env, &key);

    Ok(team)
}

pub fn team_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::TeamCount)
        .unwrap_or(0u32)
}

/// The teams one person belongs to. An unknown address belongs to none, which
/// is the same answer as an empty list, so the caller never handles both.
pub fn load_membership(env: &Env, who: &Address) -> Vec<u32> {
    env.storage()
        .persistent()
        .get(&DataKey::Membership(who.clone()))
        .unwrap_or_else(|| Vec::new(env))
}

pub fn save_membership(env: &Env, who: &Address, teams: &Vec<u32>) {
    let key = DataKey::Membership(who.clone());
    env.storage().persistent().set(&key, teams);
    touch_entry(env, &key);
}

pub fn save_submission(env: &Env, submission: &Submission) {
    let key = DataKey::Submission(submission.team);
    env.storage().persistent().set(&key, submission);
    touch_entry(env, &key);
}

pub fn load_submission(env: &Env, team: u32) -> Result<Submission, Error> {
    let key = DataKey::Submission(team);
    let submission = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::SubmissionNotFound)?;
    touch_entry(env, &key);

    Ok(submission)
}

pub fn has_submission(env: &Env, team: u32) -> bool {
    env.storage().persistent().has(&DataKey::Submission(team))
}

pub fn has_recused(env: &Env, judge: &Address, team: u32) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Recusal(judge.clone(), team))
}

pub fn save_recusal(env: &Env, judge: &Address, team: u32) {
    let key = DataKey::Recusal(judge.clone(), team);
    env.storage().persistent().set(&key, &true);
    touch_entry(env, &key);

    let count = recusal_count(env, team) + 1;
    let counter = DataKey::RecusalCount(team);
    env.storage().persistent().set(&counter, &count);
    touch_entry(env, &counter);
}

pub fn recusal_count(env: &Env, team: u32) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::RecusalCount(team))
        .unwrap_or(0u32)
}

pub fn save_score_root(env: &Env, root: &BytesN<32>) {
    env.storage().instance().set(&DataKey::ScoreRoot, root);
    touch(env);
}

pub fn load_score_root(env: &Env) -> Result<BytesN<32>, Error> {
    env.storage()
        .instance()
        .get(&DataKey::ScoreRoot)
        .ok_or(Error::ScoreRootMissing)
}

pub fn has_score_root(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::ScoreRoot)
}

pub fn has_score(env: &Env, team: u32, judge: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Score(team, judge.clone()))
}

pub fn save_score(env: &Env, team: u32, judge: &Address, weighted: u32) {
    let key = DataKey::Score(team, judge.clone());
    env.storage().persistent().set(&key, &weighted);
    touch_entry(env, &key);

    let tally = load_score_tally(env, team);
    let updated = ScoreTally {
        count: tally.count + 1,
        total: tally.total + weighted as u64,
    };

    let counter = DataKey::ScoreTally(team);
    env.storage().persistent().set(&counter, &updated);
    touch_entry(env, &counter);
}

pub fn load_score(env: &Env, team: u32, judge: &Address) -> Result<u32, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Score(team, judge.clone()))
        .ok_or(Error::ScorecardNotFound)
}

pub fn bump_criterion_tally(env: &Env, team: u32, criterion: &Symbol, score: u32) {
    let key = DataKey::CriterionTally(team, criterion.clone());
    let tally = load_criterion_tally(env, team, criterion);

    env.storage().persistent().set(
        &key,
        &CriterionTally {
            count: tally.count + 1,
            total: tally.total + score as u64,
        },
    );
    touch_entry(env, &key);
}

pub fn load_criterion_tally(env: &Env, team: u32, criterion: &Symbol) -> CriterionTally {
    env.storage()
        .persistent()
        .get(&DataKey::CriterionTally(team, criterion.clone()))
        .unwrap_or(CriterionTally { count: 0, total: 0 })
}

pub fn load_score_tally(env: &Env, team: u32) -> ScoreTally {
    env.storage()
        .persistent()
        .get(&DataKey::ScoreTally(team))
        .unwrap_or(ScoreTally { count: 0, total: 0 })
}

pub fn save_ballot_root(env: &Env, root: &BytesN<32>) {
    env.storage().instance().set(&DataKey::BallotRoot, root);
    touch(env);
}

pub fn load_ballot_root(env: &Env) -> Result<BytesN<32>, Error> {
    env.storage()
        .instance()
        .get(&DataKey::BallotRoot)
        .ok_or(Error::BallotRootMissing)
}

pub fn has_ballot_root(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::BallotRoot)
}

pub fn has_ballot_counted(env: &Env, voter: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::BallotCounted(voter.clone()))
}

/// Counts one ballot, marking the voter so they cannot be counted again.
pub fn count_ballot(env: &Env, voter: &Address, team: u32) {
    let voted = DataKey::BallotCounted(voter.clone());
    env.storage().persistent().set(&voted, &true);
    touch_entry(env, &voted);

    let tally = vote_count(env, team) + 1;
    let counter = DataKey::VoteCount(team);
    env.storage().persistent().set(&counter, &tally);
    touch_entry(env, &counter);

    if tally > top_vote_count(env) {
        env.storage().instance().set(&DataKey::TopVoteCount, &tally);
        touch(env);
    }
}

pub fn vote_count(env: &Env, team: u32) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::VoteCount(team))
        .unwrap_or(0u32)
}

pub fn top_vote_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::TopVoteCount)
        .unwrap_or(0u32)
}

pub fn save_ranking(env: &Env, track: &Symbol, ranking: &Vec<Placement>) {
    let key = DataKey::Ranking(track.clone());
    env.storage().persistent().set(&key, ranking);
    touch_entry(env, &key);
}

pub fn load_ranking(env: &Env, track: &Symbol) -> Result<Vec<Placement>, Error> {
    let key = DataKey::Ranking(track.clone());
    let ranking = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::ResultsNotFinalized)?;
    touch_entry(env, &key);

    Ok(ranking)
}

pub fn is_paid(env: &Env, track: &Symbol, rank: u32) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Paid(track.clone(), rank))
}

pub fn mark_paid(env: &Env, track: &Symbol, rank: u32) {
    let key = DataKey::Paid(track.clone(), rank);
    env.storage().persistent().set(&key, &true);
    touch_entry(env, &key);
}

pub fn save_no_award(env: &Env, track: &Symbol, case: &NoAwardCase) {
    let key = DataKey::NoAward(track.clone());
    env.storage().persistent().set(&key, case);
    touch_entry(env, &key);
}

pub fn load_no_award(env: &Env, track: &Symbol) -> Result<NoAwardCase, Error> {
    let key = DataKey::NoAward(track.clone());
    let case = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::NoAwardNotOpen)?;
    touch_entry(env, &key);

    Ok(case)
}

pub fn has_no_award(env: &Env, track: &Symbol) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::NoAward(track.clone()))
}

pub fn has_no_award_approval(env: &Env, track: &Symbol, judge: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::NoAwardApproval(track.clone(), judge.clone()))
}

pub fn save_no_award_approval(env: &Env, track: &Symbol, judge: &Address) {
    let key = DataKey::NoAwardApproval(track.clone(), judge.clone());
    env.storage().persistent().set(&key, &true);
    touch_entry(env, &key);
}

pub fn load_constitution_hash(env: &Env) -> Result<BytesN<32>, Error> {
    env.storage()
        .instance()
        .get(&DataKey::ConstitutionHash)
        .ok_or(Error::RulesNotLocked)
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::fixtures::{sample_constitution, sample_schedule as schedule};
    use crate::hashing::hash_constitution;
    use crate::phase::Phase;
    use crate::HackathonCore;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Address;

    /// Runs a closure inside a registered contract, which is the only context
    /// where instance storage exists.
    fn in_contract<T>(env: &Env, body: impl FnOnce() -> T) -> T {
        let id = env.register(HackathonCore, ());
        env.as_contract(&id, body)
    }

    #[test]
    fn an_empty_instance_reports_itself_uninitialized() {
        let env = Env::default();

        in_contract(&env, || {
            assert!(!is_initialized(&env));
            assert_eq!(load_organizing_team(&env), Err(Error::NotInitialized));
            assert_eq!(load_state(&env), Err(Error::NotInitialized));
        });
    }

    #[test]
    fn the_organizing_team_survives_a_write_and_a_read() {
        let env = Env::default();

        in_contract(&env, || {
            let organizer = Address::generate(&env);
            let mut team = OrganizingTeam::new(&env, organizer.clone());
            team.add_collaborator(Address::generate(&env)).unwrap();

            save_organizing_team(&env, &team);

            assert!(is_initialized(&env));
            assert_eq!(load_organizing_team(&env), Ok(team));
        });
    }

    #[test]
    fn the_state_survives_a_write_and_a_read() {
        let env = Env::default();

        in_contract(&env, || {
            let state = HackathonState::draft(schedule());
            save_state(&env, &state);

            let loaded = load_state(&env).unwrap();
            assert_eq!(loaded.phase, Phase::Draft);
            assert_eq!(loaded.schedule, schedule());
        });
    }

    #[test]
    fn writing_the_state_again_replaces_it() {
        let env = Env::default();

        in_contract(&env, || {
            save_state(&env, &HackathonState::draft(schedule()));

            let advanced = load_state(&env).unwrap().advance(0).unwrap();
            save_state(&env, &advanced);

            assert_eq!(load_state(&env).unwrap().phase, Phase::Funding);
        });
    }

    #[test]
    fn nothing_is_stored_before_the_hackathon_is_created() {
        let env = Env::default();

        in_contract(&env, || {
            assert_eq!(load_constitution(&env).err(), Some(Error::NotInitialized));
            assert_eq!(
                load_constitution_hash(&env).err(),
                Some(Error::RulesNotLocked)
            );
        });
    }

    #[test]
    fn a_draft_becomes_locked_only_when_its_digest_is_written() {
        let env = Env::default();

        in_contract(&env, || {
            let constitution = sample_constitution(&env);
            let hash = hash_constitution(&env, &constitution);

            save_constitution(&env, &constitution);
            assert!(
                load_constitution_hash(&env).is_err(),
                "a draft carries no digest"
            );

            lock_constitution(&env, &hash);

            assert_eq!(load_constitution(&env), Ok(constitution.clone()));
            assert_eq!(load_constitution_hash(&env), Ok(hash.clone()));

            // The stored digest has to be the digest of the stored rules, or a
            // reader comparing the two would be checking nothing.
            assert_eq!(
                hash_constitution(&env, &load_constitution(&env).unwrap()),
                hash
            );
        });
    }
}
