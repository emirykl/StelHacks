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

import type { FieldRule, SubmissionFields } from "./constitution";

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

/**
 * The constitution shape this build understands.
 *
 * It is three because a submission field stopped being a yes or no, and a
 * hackathon created before that has three booleans where this build reads five
 * rules. The number is here rather than imported from the contract because
 * nothing on this side can import Rust; it has to match `CONSTITUTION_VERSION`
 * in `contracts/hackathon-core/src/constitution/document.rs`, and the fixtures
 * both languages read are what catch it when it does not.
 */
export const CONSTITUTION_VERSION = 4;

export interface Rules {
  /**
   * Which shape of the document this is.
   *
   * Carried rather than dropped because it is the only thing that distinguishes
   * a hackathon running on superseded code from one running on ours, and the
   * contracts have no upgrade path, so an old event stays old forever.
   */
  version: number;
  prizeAsset: string | null;
  /** Every tier added up, which is what a reader means by "the prize". */
  total: bigint;
  tiers: Tier[];
  tracks: Track[];
  schedule: Schedule;
  /** An index into `VISIBILITY`. */
  visibility: number;
  judges: number;
  /**
   * Every judge's address, for the one surface that has to put them back into a
   * form. Everywhere else wants only how many there are, which is why the count
   * stays beside this rather than being derived from it at each call site.
   */
  judgeAddresses: string[];
  judgeQuorum: number;
  maxTeamSize: number;
  multiTeamAllowed: boolean;
  /**
   * Whether anybody who applies is in, or an application waits for a decision.
   *
   * Read back rather than inferred from whether a queue has anything in it: an
   * open hackathon and a reviewed one nobody has applied to yet look identical
   * from the outside, and only one of them is asking the organizer to do
   * something.
   */
  openRegistration: boolean;
  requires: SubmissionFields;
  /** How the final score splits, in basis points. The two total ten thousand. */
  judgeBps: number;
  communityBps: number;
  /**
   * Seconds between the ranking and the first payment, or zero for none.
   *
   * Read back because the edit form has to put it in front of somebody again,
   * and because it is the one rule whose effect arrives as a refusal a day
   * later rather than as anything visible when it was chosen.
   */
  settlementDelay: number;
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
  const discretion = (raw["discretion"] ?? {}) as Record<string, unknown>;

  return {
    version: Number(raw["version"] ?? 0),
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
    judgeAddresses: list(raw["judges"])
      .map((assignment) => field(assignment, "judge"))
      .filter((address): address is string => typeof address === "string"),
    judgeQuorum: Number(raw["judge_quorum"] ?? 0),
    maxTeamSize: Number(teams["max_size"] ?? 0),
    multiTeamAllowed: teams["multi_team_allowed"] === true,
    /* Reviewed unless the document plainly says otherwise, which is the safe
       end: reading an open event as reviewed leaves an organizer with a queue
       that decides nothing, and reading a reviewed one as open would tell a
       page that strangers were already admitted. */
    openRegistration: Number(raw["registration"] ?? 0) === 1,
    requires: {
      repository: ruleOf(needs["repository"]),
      demoVideo: ruleOf(needs["demo_video"]),
      liveUrl: ruleOf(needs["live_url"]),
      pitchDeck: ruleOf(needs["pitch_deck"]),
      deployedContract: ruleOf(needs["deployed_contract"]),
    },
    judgeBps: Number(vote["judge_bps"] ?? 0),
    communityBps: Number(vote["community_bps"] ?? 0),
    settlementDelay: delayOf(discretion["settlement"]),
  };
}

/**
 * What the frozen rules say about one submission field.
 *
 * The enum carries no payload, so it arrives as the number the contract gave
 * it. Anything unrecognised reads as offered rather than as never asked for:
 * a rule this side cannot name is a field a team might still need to fill in,
 * and hiding it would take away the only way they have to comply.
 */
function ruleOf(raw: unknown): FieldRule {
  return raw === 2 ? "required" : raw === 0 ? "unasked" : "optional";
}

/**
 * The wait a settlement policy names, in seconds.
 *
 * The enum decodes as a tag and its values, so `Immediate` is a bare tag with
 * nothing after it and reads as no wait at all. Anything unrecognised reads the
 * same way rather than inventing a delay, since a wait this side made up would
 * be a countdown pointing at a moment the contract has never heard of.
 */
function delayOf(settlement: unknown): number {
  return Array.isArray(settlement) && settlement[0] === "SafetyWindow"
    ? Number(settlement[1] ?? 0)
    : 0;
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
 * The schedule as a reader follows it: windows, not moments.
 *
 * There were eight lines here and they were six too many. Registration opening
 * and registration closing are not two facts a person holds separately, they
 * are one window with two ends, and printing them as separate rows made
 * somebody read six dates to answer "when can I still get in". A window is one
 * row with an arrow in it and the answer is on the line.
 *
 * The community vote is left out when the crowd has no share of the score.
 * Both of its timestamps are still in the document and the contract ignores
 * them, so showing them would put two dates on a page that decide nothing.
 */
export interface Window {
  label: string;
  from: number;
  /** Absent for a deadline, which is an end with no matching beginning. */
  to: number | null;
  /** Whether it is behind us, running now, or still ahead. */
  standing: "past" | "now" | "ahead";
}

export function windowsOf(rules: Rules, now = Math.floor(Date.now() / 1000)): Window[] {
  const { schedule } = rules;

  const spans: [string, number, number | null][] = [
    ["Registration ends", schedule.registrationOpens, schedule.registrationCloses],
    ["Submissions end", schedule.submissionOpens, schedule.submissionCloses],
    ["Entry check ends", schedule.screeningCloses, null],
    ...(rules.communityBps > 0
      ? ([["Community vote ends", schedule.communityVoteOpens, schedule.communityVoteCloses]] as [
          string,
          number,
          number | null,
        ][])
      : []),
    ["Judging ends", schedule.judgingCloses, null],
  ];

  const windows = spans
    .filter(([, from]) => from > 0)
    .map(([label, from, to]) => ({
      label,
      from,
      to,
      standing: (to === null
        ? now >= from
          ? "past"
          : "ahead"
        : now >= to
          ? "past"
          : now >= from
            ? "now"
            : "ahead") as Window["standing"],
    }));

  /*
    Whatever is next is where the event is.

    Half of these are a deadline rather than a window — the entry check and the
    judging have a closing moment and no opening one — so on the rule above they
    could only ever be past or ahead, never the stage you are in. An event in
    its judging round therefore had nothing marked at all, and a reader looking
    for where it had got to found four grey lines.

    The first row that has not happened is that stage, whichever shape it is.
  */
  if (!windows.some((window) => window.standing === "now")) {
    const next = windows.find((window) => window.standing === "ahead");

    if (next !== undefined) {
      next.standing = "now";
    }
  }

  return windows;
}
