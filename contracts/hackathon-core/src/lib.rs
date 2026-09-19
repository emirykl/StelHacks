#![no_std]

//! The authority for a single hackathon.
//!
//! It holds the locked constitution, enforces the lifecycle, records submissions,
//! judge scorecards and community votes, and computes the final ranking. Nothing
//! outside this contract is allowed to decide who won.

mod constitution;
mod errors;
mod phase;

pub use constitution::{
    total_prize_amount, validate_prize_tiers, Criterion, Deadline, ExtensionPolicy, PrizeTier,
    Schedule, Track, VotePolicy, MAX_CRITERION_SCORE, VOTE_SPLIT_TOTAL_BPS, WEIGHT_TOTAL_BPS,
};
pub use errors::Error;
pub use phase::Phase;

use soroban_sdk::contract;

#[contract]
pub struct HackathonCore;
