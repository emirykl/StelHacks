use soroban_sdk::{contracttype, BytesN, Env};

use crate::constitution::Constitution;
use crate::errors::Error;
use crate::state::HackathonState;
use crate::team::OrganizingTeam;

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
    Team,
    /// The rules, once locked.
    Constitution,
    /// The digest of those rules, kept beside them so a reader never has to
    /// trust a client to recompute it.
    ConstitutionHash,
    /// Phase, effective schedule and the rest of what changes as the event runs.
    State,
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
    env.storage().instance().has(&DataKey::Team)
}

pub fn save_team(env: &Env, team: &OrganizingTeam) {
    env.storage().instance().set(&DataKey::Team, team);
    touch(env);
}

pub fn load_team(env: &Env) -> Result<OrganizingTeam, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Team)
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
            assert_eq!(load_team(&env), Err(Error::NotInitialized));
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

            save_team(&env, &team);

            assert!(is_initialized(&env));
            assert_eq!(load_team(&env), Ok(team));
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
