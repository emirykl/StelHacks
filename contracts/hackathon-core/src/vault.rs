//! The core contract's view of its vault.
//!
//! Declared as an interface rather than imported as a crate, so the two
//! contracts stay independently deployable and the core's wasm carries only the
//! calls it makes.

use soroban_sdk::{contractclient, Address, Env};

#[contractclient(name = "VaultClient")]
pub trait Vault {
    /// The hackathon this vault serves.
    fn core(env: Env) -> Address;
    /// The token the prize is denominated in.
    fn asset(env: Env) -> Address;
    /// What the pool holds right now.
    fn balance(env: Env) -> i128;
    /// Sends part of the pool to a winner.
    fn pay(env: Env, to: Address, amount: i128);
}
