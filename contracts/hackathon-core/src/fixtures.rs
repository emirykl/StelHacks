//! Shared test data.
//!
//! A valid constitution takes sixty lines to build, and three modules need one.
//! Keeping a single copy here means a new field added to the constitution
//! breaks in one place rather than three, and every test agrees on what a
//! well formed hackathon looks like.

use soroban_sdk::testutils::Address as _;
use soroban_sdk::{symbol_short, vec, Address, BytesN, Env, String, Symbol, Vec};

use crate::constitution::{
    Constitution, Criterion, DiscretionPolicy, ExtensionPolicy, JudgeAssignment, JudgingMode,
    PrizeTier, ProjectVisibility, RefundRoute, Schedule, SettlementMode, TeamPolicy, TieBreakRule,
    Track, VotePolicy, CONSTITUTION_VERSION,
};
use crate::submission::{SubmissionMetadata, SubmissionRequirements};

pub const HOUR: u64 = 60 * 60;
pub const DAY: u64 = 24 * HOUR;

/// A schedule with room between its deadlines, so a test that moves one by a
/// day is not immediately refused for running into the next.
pub fn sample_schedule() -> Schedule {
    Schedule {
        registration_opens_at: 1_000 * DAY,
        registration_closes_at: 1_007 * DAY,
        submission_opens_at: 1_000 * DAY,
        submission_closes_at: 1_009 * DAY,
        screening_closes_at: 1_011 * DAY,
        judging_closes_at: 1_014 * DAY,
        community_vote_opens_at: 1_011 * DAY + 2 * HOUR,
        community_vote_closes_at: 1_013 * DAY,
    }
}

fn sample_criteria(env: &Env) -> Vec<Criterion> {
    vec![
        env,
        Criterion {
            id: symbol_short!("technical"),
            weight_bps: 6_000,
        },
        Criterion {
            id: symbol_short!("novelty"),
            weight_bps: 4_000,
        },
    ]
}

/// Two tracks, three judges covering both, an eighty twenty split, a public
/// gallery and a ten thousand unit prize pool.
pub fn sample_constitution(env: &Env) -> Constitution {
    sample_constitution_paying(env, Address::generate(env))
}

/// The same hackathon, denominated in a caller supplied asset, for tests that
/// need the prize token to be a contract that actually exists.
pub fn sample_constitution_paying(env: &Env, prize_asset: Address) -> Constitution {
    let payments = symbol_short!("payments");
    let defi = symbol_short!("defi");

    let mut judges = Vec::new(env);
    for _ in 0..3 {
        judges.push_back(JudgeAssignment {
            judge: Address::generate(env),
            tracks: vec![env, payments.clone(), defi.clone()],
        });
    }

    Constitution {
        version: CONSTITUTION_VERSION,
        metadata_hash: BytesN::from_array(env, &[7u8; 32]),
        prize_asset,
        tracks: vec![
            env,
            Track {
                id: payments.clone(),
                criteria: sample_criteria(env),
                no_award_allowed: false,
            },
            Track {
                id: defi.clone(),
                criteria: sample_criteria(env),
                no_award_allowed: true,
            },
        ],
        judges,
        judge_quorum: 3,
        judging_mode: JudgingMode::Easy(Address::generate(env)),
        vote: VotePolicy {
            judge_bps: 8_000,
            community_bps: 2_000,
        },
        visibility: ProjectVisibility::Public,
        submission_requirements: SubmissionRequirements::code_and_video(),
        teams: TeamPolicy::small_teams(),
        prize_tiers: vec![
            env,
            PrizeTier {
                track: payments.clone(),
                rank: 1,
                amount: 5_000,
            },
            PrizeTier {
                track: payments,
                rank: 2,
                amount: 3_000,
            },
            PrizeTier {
                track: defi,
                rank: 1,
                amount: 2_000,
            },
        ],
        tie_break: vec![env, TieBreakRule::JudgeScore, TieBreakRule::SubmissionOrder],
        discretion: DiscretionPolicy {
            disqualification_threshold: 2,
            appeal_window: 48 * HOUR,
            settlement: SettlementMode::SafetyWindow(24 * HOUR),
            prize_claim_period: 90 * DAY,
            unclaimed_refund: RefundRoute::Organizer,
            no_award_refund: RefundRoute::Organizer,
            cancellation_threshold: 2,
            cancellation_refund: RefundRoute::Depositors,
        },
        schedule: sample_schedule(),
        extensions: ExtensionPolicy {
            max_extensions_per_deadline: 2,
            max_total_seconds_per_deadline: 2 * DAY,
        },
    }
}

/// A complete project submission, carrying every link the organizer can ask
/// for.
pub fn sample_metadata(env: &Env, track: Symbol) -> SubmissionMetadata {
    SubmissionMetadata {
        name: String::from_str(env, "Lumen Split"),
        summary: String::from_str(env, "Shared expenses settled in USDC"),
        description: String::from_str(env, "A longer write up of the project."),
        logo_uri: String::from_str(env, "https://cdn.example.com/lumen-split.png"),
        repository_url: String::from_str(env, "https://github.com/example/lumen-split"),
        demo_video_url: String::from_str(env, "https://youtu.be/example"),
        live_url: String::from_str(env, "https://lumen-split.example.com"),
        track,
    }
}
