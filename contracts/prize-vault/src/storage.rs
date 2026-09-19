use soroban_sdk::{contracttype, Address, Env};

use crate::errors::Error;

/// Ledgers closed in a day, at roughly five seconds a ledger.
const LEDGERS_PER_DAY: u32 = 17_280;

/// The vault outlives the hackathon it serves, because an unclaimed prize can
/// sit here for the whole claim period and the proof page links to it long
/// after that.
const INSTANCE_LIFETIME_LEDGERS: u32 = 120 * LEDGERS_PER_DAY;
const INSTANCE_BUMP_THRESHOLD_LEDGERS: u32 = 90 * LEDGERS_PER_DAY;

/// What the vault stores.
///
/// Both entries are written once at creation and never again. A vault whose
/// hackathon or asset could be changed later would be a vault whose deposits
/// mean nothing, since the money could be redirected after it arrived.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// The hackathon this vault pays for. The only address allowed to move
    /// money out.
    Core,
    /// The token the prize is denominated and paid in.
    Asset,
}

fn touch(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_BUMP_THRESHOLD_LEDGERS, INSTANCE_LIFETIME_LEDGERS);
}

pub fn is_initialized(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Core)
}

/// Binds the vault to one hackathon and one asset, permanently.
pub fn save_binding(env: &Env, core: &Address, asset: &Address) {
    env.storage().instance().set(&DataKey::Core, core);
    env.storage().instance().set(&DataKey::Asset, asset);
    touch(env);
}

pub fn load_core(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Core)
        .ok_or(Error::NotInitialized)
}

pub fn load_asset(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Asset)
        .ok_or(Error::NotInitialized)
}
