import type { Constitution, Scorecard, SubmissionMetadata } from "hackathon-core";
import { ProjectVisibility, RefundRoute } from "hackathon-core";

/**
 * The same values `fixtures.rs` builds in Rust, written out again here.
 *
 * Writing them twice is the point. If this file imported the numbers from
 * somewhere shared, the two languages would agree by construction and the
 * comparison would prove nothing. Two independent constructions reaching one
 * committed digest is what actually demonstrates that a participant hashing the
 * rules in a browser lands where the contract landed.
 */

const HOUR = 3_600;
const DAY = 24 * HOUR;

export const PRIZE_ASSET = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
export const SEALER = "GAF6IFHHU3QF3LFFDYCJ3WDB3JFLUWF73LBLWF3UK3GK5GXHH7PHWQWY";
export const JUDGES = [
  "GA3A3NY4VLTTUPJCJSTJ457KAOXKPZ3PQER4M2F5TQRFG5TTNEOBQZ3K",
  "GD5UICFSMKGZAEP67EPBIXVENKEUXSUWT7RUT27YH4HHYVGRQURDMVXL",
  "GCZYAVTGEEWBFJNBFNPWOYNFPBA4C5O7YFYVZXUHWLKXZCV4LCAJH2QC",
];
export const VOTER = "GDWL4D6IKDN4OQIA5PISXXN7TCT3Q7S45SXAKHHEONCUCHDHV2CXUVJ4";

const criteria = () => [
  { id: "technical", weight_bps: 6_000 },
  { id: "novelty", weight_bps: 4_000 },
];

export function canonicalConstitution(): Constitution {
  return {
    version: 1,
    metadata_hash: Buffer.alloc(32, 7),
    prize_asset: PRIZE_ASSET,
    tracks: [
      { id: "payments", criteria: criteria(), no_award_allowed: false },
      { id: "defi", criteria: criteria(), no_award_allowed: true },
    ],
    judges: JUDGES.map((judge) => ({ judge, tracks: ["payments", "defi"] })),
    judge_quorum: 3,
    judging_mode: { tag: "Easy", values: [SEALER] },
    vote: { judge_bps: 8_000, community_bps: 2_000 },
    visibility: ProjectVisibility.Public,
    submission_requirements: {
      repository_required: true,
      demo_video_required: true,
      live_url_required: false,
    },
    teams: { max_size: 4, multi_team_allowed: false },
    prize_tiers: [
      { track: "payments", rank: 1, amount: 5_000n },
      { track: "payments", rank: 2, amount: 3_000n },
      { track: "defi", rank: 1, amount: 2_000n },
    ],
    tie_break: [
      { tag: "JudgeScore", values: undefined },
      { tag: "SubmissionOrder", values: undefined },
    ],
    discretion: {
      disqualification_threshold: 2,
      appeal_window: BigInt(48 * HOUR),
      settlement: { tag: "SafetyWindow", values: [BigInt(24 * HOUR)] },
      prize_claim_period: BigInt(90 * DAY),
      unclaimed_refund: RefundRoute.Organizer,
      no_award_refund: RefundRoute.Organizer,
      cancellation_threshold: 2,
      cancellation_refund: RefundRoute.Organizer,
    },
    schedule: {
      registration_opens_at: BigInt(1_000 * DAY),
      registration_closes_at: BigInt(1_007 * DAY),
      submission_opens_at: BigInt(1_000 * DAY),
      submission_closes_at: BigInt(1_009 * DAY),
      screening_closes_at: BigInt(1_011 * DAY),
      judging_closes_at: BigInt(1_014 * DAY),
      community_vote_opens_at: BigInt(1_011 * DAY + 2 * HOUR),
      community_vote_closes_at: BigInt(1_013 * DAY),
    },
    extensions: {
      max_extensions_per_deadline: 2,
      max_total_seconds_per_deadline: BigInt(2 * DAY),
    },
  };
}

export function canonicalMetadata(): SubmissionMetadata {
  return {
    name: "Lumen Split",
    summary: "Shared expenses settled in USDC",
    description: "A longer write up of the project.",
    logo_uri: "https://cdn.example.com/lumen-split.png",
    repository_url: "https://github.com/example/lumen-split",
    demo_video_url: "https://youtu.be/example",
    live_url: "https://lumen-split.example.com",
    track: "payments",
  };
}

export function canonicalScorecard(): Scorecard {
  return {
    judge: JUDGES[0]!,
    team: 1,
    scores: [
      { criterion: "technical", score: 82 },
      { criterion: "novelty", score: 64 },
    ],
  };
}
