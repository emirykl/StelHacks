//! The core contract's view of its vault.
//!
//! Declared as an interface rather than imported as a crate, so the two
//! contracts stay independently deployable and the core's wasm carries only the
//! calls it makes.

use soroban_sdk::{contractclient, Address, Env};

#[contractclient(name = "VaultClient")]
pub trait Vault {
    /// Binds a freshly deployed vault to this hackathon and its prize token.
    ///
    /// Called once, by `set_up`, on a vault this contract has just put up. It
    /// is an ordinary entry point rather than a constructor, which is why the
    /// deployment and this call are two steps rather than one.
    fn create(env: Env, core: Address, asset: Address);
    /// Adds to the prize pool, from an address that authorizes it.
    fn deposit(env: Env, from: Address, amount: i128);
    /// The hackathon this vault serves.
    fn core(env: Env) -> Address;
    /// The token the prize is denominated in.
    fn asset(env: Env) -> Address;
    /// What the pool holds right now.
    fn balance(env: Env) -> i128;
    /// Sends part of the pool to a winner.
    fn pay(env: Env, to: Address, amount: i128);
}
