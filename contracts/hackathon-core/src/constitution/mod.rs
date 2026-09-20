//! The rules of a hackathon: everything that decides the outcome.
//!
//! The whole module is written to be locked. Once the organizer signs the lock,
//! nothing in here may change, and a client can hash the same values off chain
//! to prove the running competition is still the one it read.

mod discretion;
mod document;
mod fee;
mod judging;
mod ranking;
mod registration;
mod schedule;
mod scoring;
mod teams;
mod visibility;
mod voting;

pub use discretion::{DiscretionPolicy, RefundRoute, SettlementMode, MAX_SETTLEMENT_SAFETY_WINDOW};
pub use document::{Constitution, JudgeAssignment, CONSTITUTION_VERSION};
pub use fee::{PlatformFee, FEE_TOTAL_BPS, MAX_PLATFORM_FEE_BPS};
pub use judging::JudgingMode;
pub use ranking::{validate_tie_break, TieBreakRule};
pub use registration::RegistrationPolicy;
pub use schedule::{Deadline, ExtensionPolicy, Schedule};
pub use scoring::{
    total_prize_amount, validate_prize_tiers, Criterion, PrizeTier, Track, MAX_CRITERION_SCORE,
    WEIGHT_TOTAL_BPS,
};
pub use teams::{TeamPolicy, MAX_TEAM_SIZE, MIN_TEAM_SIZE};
pub use visibility::ProjectVisibility;
pub use voting::{
    VotePolicy, DEFAULT_MAX_CHOICES, DEFAULT_VOTE_POWER, MAX_VOTE_POWER, VOTE_SPLIT_TOTAL_BPS,
};
