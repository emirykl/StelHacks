import { DecidedBy } from "hackathon-core";
import type { Constitution, Placement, VotePolicy } from "hackathon-core";

/**
 * The ranking, recomputed from chain data alone.
 *
 * This is the module the whole package exists for. Everything else lets a
 * client talk to the contract; this lets a client refuse to take the contract's
 * word for it. Given the locked rules, the revealed scorecards and the counted
 * ballots — all of them public — it derives the same order the contract
 * derived, and a participant can compare the two without asking anybody's
 * permission.
 *
 * Every number below is integer arithmetic that truncates, exactly as the
 * contract's does. Floating point would agree almost always, and the times it
 * did not would be ties decided a hair apart, which is precisely where somebody
 * would want to check.
 */

/** A judge's score on one criterion runs from zero to a hundred. */
export const MAX_CRITERION_SCORE = 100;

/** Criterion weights are basis points and add up to this. */
export const WEIGHT_TOTAL_BPS = 10_000;

/**
 * The scale weighted totals are held at.
 *
 * Scores keep full precision rather than being divided down to a percentage,
 * because the division would happen twice and each one drops a fraction that
 * decides close results. Only the interface rounds.
 */
export const MAX_WEIGHTED_SCORE = MAX_CRITERION_SCORE * WEIGHT_TOTAL_BPS;

/** The judge and community shares add up to this. */
export const VOTE_SPLIT_TOTAL_BPS = 10_000;

/** A running count and sum, the shape the contract stores tallies in. */
export interface Tally {
  count: number;
  total: bigint;
}

/** Everything the ranking needs to know about one entry, all of it public. */
export interface ProjectData {
  team: number;
  track: string;
  /** When the entry first arrived, which is the last resort separator. */
  submittedAt: bigint;
  /** False once an entry is screened out or disqualified. */
  valid: boolean;
  /** The revealed scorecards, as a count and a sum of weighted totals. */
  scores: Tally;
  /** How many community ballots the project was given. */
  votes: number;
  /** Each criterion's revealed scores, keyed by criterion. */
  criterionTallies: Record<string, Tally>;
}

/**
 * The community's share of a project, at [`MAX_WEIGHTED_SCORE`] scale.
 *
 * The project the crowd liked most scores full marks and the rest are placed
 * relative to it. A hackathon where nobody voted has no top count, and every
 * project scores zero rather than the arithmetic dividing by zero and taking
 * the whole result down with it.
 */
export function communityScore(votes: number, topVotes: number): number {
  if (topVotes === 0) {
    return 0;
  }

  return Number((BigInt(votes) * BigInt(MAX_WEIGHTED_SCORE)) / BigInt(topVotes));
}

/**
 * A project's final score, at [`MAX_WEIGHTED_SCORE`] scale.
 *
 * Both components arrive on the same scale, so the split is a plain weighted
 * average. A project with no valid scorecards contributes nothing from the
 * judge side rather than a zero, because those are different claims: one says
 * the judges thought little of it, the other says the judges never saw it.
 */
export function finalScore(
  vote: VotePolicy,
  judgeAverage: number | null,
  community: number,
): number {
  const judge = BigInt(judgeAverage ?? 0);
  const weighted = judge * BigInt(vote.judge_bps) + BigInt(community) * BigInt(vote.community_bps);

  return Number(weighted / BigInt(VOTE_SPLIT_TOTAL_BPS));
}

/**
 * The mean of a tally, or nothing when there is nothing to average.
 *
 * A project nobody scored has no average rather than an average of zero.
 * Treating it as zero would quietly rank an unjudged project below a badly
 * judged one, which is a different claim from the one the data supports.
 */
export function average(tally: Tally): number | null {
  if (tally.count === 0) {
    return null;
  }

  return Number(tally.total / BigInt(tally.count));
}

/**
 * Which step of the tie break chain decided a placing.
 *
 * Re-exported from the generated bindings rather than declared again here, so
 * the values cannot drift from the contract's.
 */
export { DecidedBy };

/** One project as the ranking sees it. */
export interface Candidate {
  team: number;
  finalScore: number;
  judgeAverage: number;
  community: number;
  submittedAt: bigint;
  criterionAverages: Map<string, number>;
}

/**
 * Orders two projects, and names the step that separated them.
 *
 * A positive result means `a` places above `b`. The chain is walked in the
 * order the constitution locked, and because that chain always ends in
 * submission order, two different projects are never left undecided.
 */
export function compare(
  a: Candidate,
  b: Candidate,
  chain: Constitution["tie_break"],
): [number, DecidedBy] {
  if (a.finalScore !== b.finalScore) {
    return [sign(a.finalScore - b.finalScore), DecidedBy.Score];
  }

  for (const rule of chain) {
    const [ordering, decidedBy] = step(a, b, rule);

    if (ordering !== 0) {
      return [ordering, decidedBy];
    }
  }

  return [0, DecidedBy.Score];
}

/**
 * One track's ranking, derived the way the contract derives it.
 *
 * Entries that were ruled out, and entries that never reached the judge quorum,
 * are left out rather than placed last. Those are different situations from a
 * project that was judged and came last, and flattening them would be a claim
 * the data does not support.
 */
export function rankTrack(
  constitution: Constitution,
  track: string,
  projects: readonly ProjectData[],
  topVotes: number,
): Placement[] {
  const quorumBinds = constitution.vote.judge_bps > 0;
  const ordered: Candidate[] = [];

  // Teams are walked in the order they were founded, matching the contract's
  // loop over team identifiers. Order matters here even though the comparison
  // never ties, because reproducing the contract means reproducing it exactly.
  for (const project of [...projects].sort((left, right) => left.team - right.team)) {
    if (project.track !== track || !project.valid) {
      continue;
    }
    if (quorumBinds && project.scores.count < constitution.judge_quorum) {
      continue;
    }

    const judgeAverage = average(project.scores);
    const community = communityScore(project.votes, topVotes);

    const candidate: Candidate = {
      team: project.team,
      finalScore: finalScore(constitution.vote, judgeAverage, community),
      judgeAverage: judgeAverage ?? 0,
      community,
      submittedAt: project.submittedAt,
      criterionAverages: tieBreakAverages(constitution, project),
    };

    let at = ordered.length;
    while (at > 0) {
      if (compare(candidate, ordered[at - 1]!, constitution.tie_break)[0] <= 0) {
        break;
      }
      at -= 1;
    }
    ordered.splice(at, 0, candidate);
  }

  return ordered.map((candidate, index) => ({
    team: candidate.team,
    rank: index + 1,
    final_score: candidate.finalScore,
    judge_average: candidate.judgeAverage,
    community: candidate.community,
    decided_by:
      index === 0
        ? DecidedBy.Score
        : compare(ordered[index - 1]!, candidate, constitution.tie_break)[1],
  }));
}

/**
 * Means for exactly the criteria the tie break chain names.
 *
 * Gathering only those keeps the candidate small and makes the comparison a
 * pure function of what the constitution actually asked for.
 */
function tieBreakAverages(constitution: Constitution, project: ProjectData): Map<string, number> {
  const averages = new Map<string, number>();

  for (const rule of constitution.tie_break) {
    if (rule.tag === "Criterion") {
      const id = rule.values[0];
      averages.set(id, average(project.criterionTallies[id] ?? { count: 0, total: 0n }) ?? 0);
    }
  }

  return averages;
}

function step(
  a: Candidate,
  b: Candidate,
  rule: Constitution["tie_break"][number],
): [number, DecidedBy] {
  switch (rule.tag) {
    case "JudgeScore":
      return [sign(a.judgeAverage - b.judgeAverage), DecidedBy.JudgeScore];

    case "Criterion": {
      const id = rule.values[0];

      return [
        sign((a.criterionAverages.get(id) ?? 0) - (b.criterionAverages.get(id) ?? 0)),
        DecidedBy.Criterion,
      ];
    }

    case "CommunityScore":
      return [sign(a.community - b.community), DecidedBy.CommunityScore];

    // The project entered first places above, so the earlier timestamp is the
    // better one and the comparison is reversed. Two entries can land in the
    // same ledger and share a timestamp, so the team identifier settles it
    // after that: it is unique and it counts up in the order teams were
    // founded, which is what makes this step separate any two projects rather
    // than merely usually separate them.
    case "SubmissionOrder": {
      const byTime = compareBigInt(b.submittedAt, a.submittedAt);

      return [byTime !== 0 ? byTime : sign(b.team - a.team), DecidedBy.SubmissionOrder];
    }
  }
}

function sign(difference: number): number {
  return difference === 0 ? 0 : difference > 0 ? 1 : -1;
}

function compareBigInt(a: bigint, b: bigint): number {
  return a === b ? 0 : a > b ? 1 : -1;
}
