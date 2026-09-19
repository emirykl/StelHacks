use soroban_sdk::{contract, contractimpl, Address, BytesN, Env};

use crate::constitution::Constitution;
use crate::errors::Error;
use crate::events;
use crate::hashing::hash_constitution;
use crate::phase::Phase;
use crate::state::HackathonState;
use crate::storage;
use crate::team::OrganizingTeam;
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

        storage::save_team(&env, &OrganizingTeam::new(&env, organizer.clone()));
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
        let team = storage::load_team(&env)?;
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
        let mut team = storage::load_team(&env)?;
        team.organizer.require_auth();

        team.add_collaborator(collaborator.clone())?;
        storage::save_team(&env, &team);

        events::collaborator_added(&env, &collaborator);

        Ok(())
    }

    /// Removes a helper.
    ///
    /// Applications they already decided stay decided. Reversing those would
    /// mean a participant's admission could be revoked by an argument between
    /// organizers, which is not a thing the participant can defend against.
    pub fn remove_collaborator(env: Env, collaborator: Address) -> Result<(), Error> {
        let mut team = storage::load_team(&env)?;
        team.organizer.require_auth();

        team.remove_collaborator(&collaborator)?;
        storage::save_team(&env, &team);

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
        let team = storage::load_team(&env)?;
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
        let team = storage::load_team(&env)?;
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
        storage::load_team(&env)
    }

    /// The current phase, which is the one value most readers want.
    pub fn phase(env: Env) -> Result<Phase, Error> {
        Ok(storage::load_state(&env)?.phase)
    }
}
