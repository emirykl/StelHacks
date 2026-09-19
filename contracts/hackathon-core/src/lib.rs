#![no_std]

//! The authority for a single hackathon.
//!
//! It holds the locked constitution, enforces the lifecycle, records submissions,
//! judge scorecards and community votes, and computes the final ranking. Nothing
//! outside this contract is allowed to decide who won.

use soroban_sdk::contract;

#[contract]
pub struct HackathonCore;
