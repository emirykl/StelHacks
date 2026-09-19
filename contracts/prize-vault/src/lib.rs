#![no_std]

//! Custody of the prize pool for a single hackathon.
//!
//! The vault accepts deposits from anyone at any phase, but only ever pays out
//! against a result that the paired [`hackathon-core`] instance has finalised.
//! No platform key can move the funds.

use soroban_sdk::contract;

#[contract]
pub struct PrizeVault;
