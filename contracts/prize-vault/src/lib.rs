#![no_std]

//! Custody of the prize pool for a single hackathon.
//!
//! The vault accepts deposits from anyone at any phase, but only ever pays out
//! against a result that the paired hackathon has finalized. No platform key
//! can move the funds, because there is no function that would let one.

mod contract;
mod errors;
mod events;
mod storage;

#[cfg(test)]
mod test;

pub use contract::{PrizeVault, PrizeVaultClient};
pub use errors::Error;
pub use events::{Created, Deposited, Paid};
pub use storage::DataKey;
