#![no_std]

//! The authority for a single hackathon.
//!
//! It holds the locked constitution, enforces the lifecycle, records submissions,
//! judge scorecards and community votes, and computes the final ranking. Nothing
//! outside this contract is allowed to decide who won.

mod constitution;
mod errors;
mod phase;
mod team;

pub use constitution::{
    total_prize_amount, validate_prize_tiers, validate_tie_break, Criterion, Deadline,
    DiscretionPolicy, ExtensionPolicy, JudgingMode, PrizeTier, ProjectVisibility, RefundRoute,
    Schedule, SettlementMode, TieBreakRule, Track, VotePolicy, MAX_CRITERION_SCORE,
    MAX_SETTLEMENT_SAFETY_WINDOW, VOTE_SPLIT_TOTAL_BPS, WEIGHT_TOTAL_BPS,
};
pub use errors::Error;
pub use phase::Phase;
pub use team::OrganizingTeam;

use soroban_sdk::contract;

#[contract]
pub struct HackathonCore;
