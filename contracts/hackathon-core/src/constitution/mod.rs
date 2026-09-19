//! The rules of a hackathon: everything that decides the outcome.
//!
//! The whole module is written to be locked. Once the organizer signs the lock,
//! nothing in here may change, and a client can hash the same values off chain
//! to prove the running competition is still the one it read.

mod schedule;
mod scoring;
mod voting;

pub use schedule::{Deadline, ExtensionPolicy, Schedule};
pub use voting::{
    RegistrationGate, VotePolicy, APPROVED_REGISTRATION_REQUIRED_ABOVE_BPS, VOTE_SPLIT_TOTAL_BPS,
};
pub use scoring::{
    total_prize_amount, validate_prize_tiers, Criterion, PrizeTier, Track, MAX_CRITERION_SCORE,
    WEIGHT_TOTAL_BPS,
};
