#![no_std]

//! The authority for a single hackathon.
//!
//! It holds the locked constitution, enforces the lifecycle, records submissions,
//! judge scorecards and community votes, and computes the final ranking. Nothing
//! outside this contract is allowed to decide who won.

mod constitution;
mod contract;
mod errors;
mod events;
#[cfg(test)]
mod fixtures;
mod hashing;
mod merkle;
mod organizers;
mod phase;
mod results;
mod roster;
mod scorecard;
mod state;
mod storage;
mod submission;
#[cfg(test)]
mod test;
mod vault;

pub use constitution::{
    total_prize_amount, validate_prize_tiers, validate_tie_break, Constitution, Criterion,
    Deadline, DiscretionPolicy, ExtensionPolicy, JudgeAssignment, JudgingMode, PlatformFee,
    PrizeTier, ProjectVisibility, RefundRoute, Schedule, SettlementMode, TeamPolicy, TieBreakRule,
    Track, VotePolicy, CONSTITUTION_VERSION, FEE_TOTAL_BPS, MAX_CRITERION_SCORE,
    MAX_PLATFORM_FEE_BPS, MAX_SETTLEMENT_SAFETY_WINDOW, MAX_TEAM_SIZE, MIN_TEAM_SIZE,
    VOTE_SPLIT_TOTAL_BPS, WEIGHT_TOTAL_BPS,
};
pub use contract::{HackathonCore, HackathonCoreClient};
pub use errors::Error;
pub use hashing::{ballot_leaf, hash_constitution, hash_submission_metadata, scorecard_leaf};
pub use organizers::OrganizingTeam;
pub use phase::Phase;
pub use results::{
    community_score, compare, final_score, Candidate, DecidedBy, NoAwardCase, Placement,
};
pub use roster::{ApplicationStatus, Registration, Team};
pub use scorecard::{CriterionScore, CriterionTally, ScoreTally, Scorecard, MAX_WEIGHTED_SCORE};
pub use state::{ExtensionUsage, HackathonState};
pub use storage::DataKey;
pub use submission::{Submission, SubmissionMetadata, SubmissionRequirements, SubmissionStatus};
pub use vault::{Vault, VaultClient};
