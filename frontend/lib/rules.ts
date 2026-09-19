/**
 * The frozen rules, read from the contract that holds them.
 *
 * Everything here is the constitution: the deadlines, the prize table, the
 * tracks and their weights, who may read the submissions. It was locked before
 * registration opened and the contract will not let it change, which is why
 * this is read from the chain on every request rather than mirrored into a
 * table somebody could later edit.
 *
 * The indexer's copy in `hackathon_state` carries only the digest of all this,
 * on purpose. A page that showed a deadline out of our own database would be
 * showing a deadline we could quietly move; a page that reads it here is
 * showing the one the contract will actually enforce.
 *
 * One call gets all of it. `constitution` returns the whole document, so a
 * surface wanting the prize and a surface wanting the schedule cost the same
 * single round trip.
 */

/** The eight announced moments, seconds since the epoch. */
export interface Schedule {
  registrationOpens: number;
  registrationCloses: number;
  submissionOpens: number;
  submissionCloses: number;
  screeningCloses: number;
  judgingCloses: number;
  communityVoteOpens: number;
  communityVoteCloses: number;
}

/** One payable position, in the smallest unit of the prize asset. */
export interface Tier {
  track: string;
  rank: number;
  amount: bigint;
}

/** One thing a judge scores, and how much of the total it decides. */
export interface Criterion {
  id: string;
  weightBps: number;
}

export interface Track {
  id: string;
  criteria: Criterion[];
  noAwardAllowed: boolean;
}

/**
 * Who may read the submitted projects while the event runs.
 *
 * The three levels are the contract's own, in its order, and the database
 * enforces the same three in `may_see_gallery`. Naming them in one place here
 * keeps the interface from inventing a fourth.
 */
export const VISIBILITY = ["Public", "Participants", "Restricted"] as const;

export interface Rules {
  prizeAsset: string | null;
  /** Every tier added up, which is what a reader means by "the prize". */
  total: bigint;
  tiers: Tier[];
  tracks: Track[];
  schedule: Schedule;
  /** An index into `VISIBILITY`. */
  visibility: number;
  judges: number;
  judgeQuorum: number;
  maxTeamSize: number;
  multiTeamAllowed: boolean;
  requires: { repository: boolean; demoVideo: boolean; liveUrl: boolean };
  /** How the final score splits, in basis points. The two total ten thousand. */
  judgeBps: number;
  communityBps: number;
}

export async function rulesFor(contractId: string): Promise<Rules | null> {
  const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
  const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

  if (rpcUrl === undefined || passphrase === undefined) {
    return null;
  }

  const [{ Account, Contract, TransactionBuilder, BASE_FEE, scValToNative }, rpc] =
    await Promise.all([
      import("@stellar/stellar-sdk/base"),
      import("@stellar/stellar-sdk/rpc"),
    ]);

  const server = new rpc.Server(rpcUrl);

  const tx = new TransactionBuilder(
    /* A throwaway account with no balance and no signature. Simulation never
       submits, so the only thing the source has to be is well formed. */
    new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
    { fee: BASE_FEE, networkPassphrase: passphrase },
  )
    .addOperation(new Contract(contractId).call("constitution"))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simulated) || simulated.result === undefined) {
    /* Absent rather than a default. A hackathon whose contract could not be
       reached has unknown rules, and every surface built on this says so
       instead of drawing an empty prize table. */
    return null;
  }

  return shape(scValToNative(simulated.result.retval) as Record<string, unknown>);
}

/**
 * The contract's document, in the shape the interface reads.
 *
 * Every field is defended, because this crosses a network and a decoder. A
 * contract one version ahead, a node returning something unexpected, a field
 * renamed: all of them arrive here as `undefined` and have to become a number
 * this side can render rather than an exception halfway through a page.
 */
function shape(raw: Record<string, unknown>): Rules {
  const tiers = list(raw["prize_tiers"]).map((tier) => ({
    track: String(field(tier, "track") ?? ""),
    rank: Number(field(tier, "rank") ?? 0),
    amount: BigInt((field(tier, "amount") as bigint | undefined) ?? 0),
  }));

  const schedule = (raw["schedule"] ?? {}) as Record<string, unknown>;
  const teams = (raw["teams"] ?? {}) as Record<string, unknown>;
  const needs = (raw["submission_requirements"] ?? {}) as Record<string, unknown>;
  const vote = (raw["vote"] ?? {}) as Record<string, unknown>;

  return {
    prizeAsset: typeof raw["prize_asset"] === "string" ? raw["prize_asset"] : null,
    total: tiers.reduce((sum, tier) => sum + tier.amount, BigInt(0)),
    tiers,
    tracks: list(raw["tracks"]).map((track) => ({
      id: String(field(track, "id") ?? ""),
      noAwardAllowed: field(track, "no_award_allowed") === true,
      criteria: list(field(track, "criteria")).map((criterion) => ({
        id: String(field(criterion, "id") ?? ""),
        weightBps: Number(field(criterion, "weight_bps") ?? 0),
      })),
    })),
    schedule: {
      registrationOpens: seconds(schedule["registration_opens_at"]),
      registrationCloses: seconds(schedule["registration_closes_at"]),
      submissionOpens: seconds(schedule["submission_opens_at"]),
      submissionCloses: seconds(schedule["submission_closes_at"]),
      screeningCloses: seconds(schedule["screening_closes_at"]),
      judgingCloses: seconds(schedule["judging_closes_at"]),
      communityVoteOpens: seconds(schedule["community_vote_opens_at"]),
      communityVoteCloses: seconds(schedule["community_vote_closes_at"]),
    },
    /* Out of range falls to Restricted rather than Public. Every other default
       in this file is cosmetic; this one decides who reads somebody's
       unpublished work, and the safe end of it is the closed end. */
    visibility: within(raw["visibility"], VISIBILITY.length) ? Number(raw["visibility"]) : 2,
    judges: list(raw["judges"]).length,
    judgeQuorum: Number(raw["judge_quorum"] ?? 0),
    maxTeamSize: Number(teams["max_size"] ?? 0),
    multiTeamAllowed: teams["multi_team_allowed"] === true,
    requires: {
      repository: needs["repository_required"] === true,
      demoVideo: needs["demo_video_required"] === true,
      liveUrl: needs["live_url_required"] === true,
    },
    judgeBps: Number(vote["judge_bps"] ?? 0),
    communityBps: Number(vote["community_bps"] ?? 0),
  };
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function field(holder: unknown, key: string): unknown {
  return typeof holder === "object" && holder !== null
    ? (holder as Record<string, unknown>)[key]
    : undefined;
}

/** Timestamps cross as bigints, and every use of one here is arithmetic. */
function seconds(value: unknown): number {
  return value === undefined || value === null ? 0 : Number(value);
}

function within(value: unknown, count: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < count;
}

/**
 * The schedule as a reader follows it, in order, with today marked.
 *
 * The community vote is left out when the crowd has no share of the score.
 * Both of its timestamps are still in the document and the contract ignores
 * them, so showing them would put two dates on a page that decide nothing.
 */
export interface Milestone {
  label: string;
  at: number;
  passed: boolean;
  /** The next one still to come, which is the line a reader is looking for. */
  next: boolean;
}

export function milestonesOf(rules: Rules, now = Math.floor(Date.now() / 1000)): Milestone[] {
  const { schedule } = rules;

  const moments: [string, number][] = [
    ["Registration opens", schedule.registrationOpens],
    ["Registration closes", schedule.registrationCloses],
    ["Submissions open", schedule.submissionOpens],
    ["Submissions close", schedule.submissionCloses],
    ["Screening closes", schedule.screeningCloses],
    ...(rules.communityBps > 0
      ? ([
          ["Community vote opens", schedule.communityVoteOpens],
          ["Community vote closes", schedule.communityVoteCloses],
        ] as [string, number][])
      : []),
    ["Judging closes", schedule.judgingCloses],
  ];

  const ordered = moments
    .filter(([, at]) => at > 0)
    .sort((left, right) => left[1] - right[1]);

  const upcoming = ordered.findIndex(([, at]) => at > now);

  return ordered.map(([label, at], index) => ({
    label,
    at,
    passed: at <= now,
    next: index === upcoming,
  }));
}
