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
    PlatformFee, PrizeTier, ProjectVisibility, RefundRoute, Schedule, SettlementMode, TeamPolicy,
    TieBreakRule, Track, VotePolicy, CONSTITUTION_VERSION,
};
use crate::scorecard::{CriterionScore, Scorecard};
use crate::submission::{SubmissionMetadata, SubmissionRequirements};

pub const HOUR: u64 = 60 * 60;
pub const DAY: u64 = 24 * HOUR;

/// Addresses written out in full rather than generated.
///
/// Everything else in this file may use `Address::generate`, because a random
/// address is fine when only one language is looking at it. The canonical
/// fixture below is read by the TypeScript SDK as well, and a value that
/// differs between the two runs would make the whole comparison meaningless.
pub const CANONICAL_PRIZE_ASSET: &str = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
pub const CANONICAL_SEALER: &str = "GAF6IFHHU3QF3LFFDYCJ3WDB3JFLUWF73LBLWF3UK3GK5GXHH7PHWQWY";
pub const CANONICAL_JUDGES: [&str; 3] = [
    "GA3A3NY4VLTTUPJCJSTJ457KAOXKPZ3PQER4M2F5TQRFG5TTNEOBQZ3K",
    "GD5UICFSMKGZAEP67EPBIXVENKEUXSUWT7RUT27YH4HHYVGRQURDMVXL",
    "GCZYAVTGEEWBFJNBFNPWOYNFPBA4C5O7YFYVZXUHWLKXZCV4LCAJH2QC",
];
pub const CANONICAL_FEE_COLLECTOR: &str =
    "GAMX62ZD4FWIKMWGVPEDR6WNL2TYTPQMO2ZJEAZUAON7VCZ5G2GWDF7W";
pub const CANONICAL_VOTER: &str = "GDWL4D6IKDN4OQIA5PISXXN7TCT3Q7S45SXAKHHEONCUCHDHV2CXUVJ4";

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
        platform_fee: PlatformFee {
            collector: Address::generate(env),
            bps: 500,
        },
        tie_break: vec![env, TieBreakRule::JudgeScore, TieBreakRule::SubmissionOrder],
        discretion: DiscretionPolicy {
            disqualification_threshold: 2,
            appeal_window: 48 * HOUR,
            settlement: SettlementMode::SafetyWindow(24 * HOUR),
            prize_claim_period: 90 * DAY,
            unclaimed_refund: RefundRoute::Organizer,
            no_award_refund: RefundRoute::Organizer,
            cancellation_threshold: 2,
            cancellation_refund: RefundRoute::Organizer,
        },
        schedule: sample_schedule(),
        extensions: ExtensionPolicy {
            max_extensions_per_deadline: 2,
            max_total_seconds_per_deadline: 2 * DAY,
        },
    }
}

/// The hackathon both languages hash.
///
/// Every value here is written out rather than derived, and nothing about it
/// depends on the machine it runs on, because the whole point is that a
/// TypeScript client building the same object from the same numbers arrives at
/// the same digest. It is deliberately not the same as [`sample_constitution`]:
/// this one has to stay frozen, and that one is free to change whenever a test
/// needs a different shape.
pub fn canonical_constitution(env: &Env) -> Constitution {
    let payments = symbol_short!("payments");
    let defi = symbol_short!("defi");

    let mut judges = Vec::new(env);
    for address in CANONICAL_JUDGES {
        judges.push_back(JudgeAssignment {
            judge: Address::from_str(env, address),
            tracks: vec![env, payments.clone(), defi.clone()],
        });
    }

    Constitution {
        version: CONSTITUTION_VERSION,
        metadata_hash: BytesN::from_array(env, &[7u8; 32]),
        prize_asset: Address::from_str(env, CANONICAL_PRIZE_ASSET),
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
        judging_mode: JudgingMode::Easy(Address::from_str(env, CANONICAL_SEALER)),
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
        platform_fee: PlatformFee {
            collector: Address::from_str(env, CANONICAL_FEE_COLLECTOR),
            bps: 500,
        },
        tie_break: vec![env, TieBreakRule::JudgeScore, TieBreakRule::SubmissionOrder],
        discretion: DiscretionPolicy {
            disqualification_threshold: 2,
            appeal_window: 48 * HOUR,
            settlement: SettlementMode::SafetyWindow(24 * HOUR),
            prize_claim_period: 90 * DAY,
            unclaimed_refund: RefundRoute::Organizer,
            no_award_refund: RefundRoute::Organizer,
            cancellation_threshold: 2,
            cancellation_refund: RefundRoute::Organizer,
        },
        schedule: sample_schedule(),
        extensions: ExtensionPolicy {
            max_extensions_per_deadline: 2,
            max_total_seconds_per_deadline: 2 * DAY,
        },
    }
}

/// The scorecard both languages turn into a leaf.
pub fn canonical_scorecard(env: &Env) -> Scorecard {
    Scorecard {
        judge: Address::from_str(env, CANONICAL_JUDGES[0]),
        team: 1,
        scores: vec![
            env,
            CriterionScore {
                criterion: symbol_short!("technical"),
                score: 82,
            },
            CriterionScore {
                criterion: symbol_short!("novelty"),
                score: 64,
            },
        ],
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
