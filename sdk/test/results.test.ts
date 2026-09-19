import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  average,
  communityScore,
  compare,
  DecidedBy,
  finalScore,
  MAX_WEIGHTED_SCORE,
  rankTrack,
  type Candidate,
  type ProjectData,
} from "../src/results.js";
import { canonicalConstitution } from "./canonical.js";

/**
 * A finished ranking, inputs and outcome together, written by the contract.
 *
 * This is the test the package exists for. Everything the ranking was derived
 * from is read out of the file, the SDK derives the order again from nothing
 * else, and the two are compared. A participant doing the same thing in a
 * browser is doing exactly this, which is the entire point of the claim that
 * nobody has to trust the reference application to know who won.
 */
function ranking(): { topVotes: number; projects: ProjectData[]; expected: Row[] } {
  const path = join(import.meta.dirname, "..", "..", "fixtures", "ranking.txt");
  const lines = readFileSync(path, "utf8").trim().split("\n");

  let topVotes = 0;
  const projects: ProjectData[] = [];
  const expected: Row[] = [];

  for (const line of lines) {
    const fields = Object.fromEntries(
      line
        .split(" ")
        .slice(line.startsWith("top_votes") ? 0 : 1)
        .map((pair) => pair.split("=") as [string, string]),
    );

    if (line.startsWith("top_votes")) {
      topVotes = Number(fields["top_votes"]);
    } else if (line.startsWith("project")) {
      projects.push({
        team: Number(fields["team"]),
        track: fields["track"]!,
        submittedAt: BigInt(fields["submitted_at"]!),
        valid: fields["valid"] === "1",
        scores: { count: Number(fields["score_count"]), total: BigInt(fields["score_total"]!) },
        votes: Number(fields["votes"]),
        criterionTallies: {},
      });
    } else {
      expected.push({
        rank: Number(fields["rank"]),
        team: Number(fields["team"]),
        finalScore: Number(fields["final_score"]),
        judgeAverage: Number(fields["judge_average"]),
        community: Number(fields["community"]),
        decidedBy: Number(fields["decided_by"]),
      });
    }
  }

  return { topVotes, projects, expected };
}

interface Row {
  rank: number;
  team: number;
  finalScore: number;
  judgeAverage: number;
  community: number;
  decidedBy: number;
}

describe("recomputing a finished ranking", () => {
  const { topVotes, projects, expected } = ranking();

  it("reaches the order the contract published", () => {
    const placements = rankTrack(canonicalConstitution(), "payments", projects, topVotes);

    expect(placements.map((placement) => [placement.rank, placement.team])).toEqual(
      expected.map((row) => [row.rank, row.team]),
    );
  });

  /**
   * The numbers, not only the order. Two implementations can agree on who won
   * and still disagree about by how much, and the margin is exactly what a
   * participant asking why they came second wants to see.
   */
  it("reaches the same scores, to the unit", () => {
    const placements = rankTrack(canonicalConstitution(), "payments", projects, topVotes);

    placements.forEach((placement, index) => {
      const row = expected[index]!;

      expect(placement.final_score).toBe(row.finalScore);
      expect(placement.judge_average).toBe(row.judgeAverage);
      expect(placement.community).toBe(row.community);
    });
  });

  it("names the same step for every placing", () => {
    const placements = rankTrack(canonicalConstitution(), "payments", projects, topVotes);

    placements.forEach((placement, index) => {
      expect(placement.decided_by).toBe(expected[index]!.decidedBy);
    });
  });
});

describe("what the ranking leaves out", () => {
  const base = (team: number, overrides: Partial<ProjectData> = {}): ProjectData => ({
    team,
    track: "payments",
    submittedAt: 100n,
    valid: true,
    scores: { count: 3, total: 3_000_000n },
    votes: 0,
    criterionTallies: {},
    ...overrides,
  });

  /**
   * An entry ruled out is left out rather than placed last. Those are different
   * situations from a project that was judged and came last, and the page shows
   * which one applies.
   */
  it("leaves out an entry that was ruled out", () => {
    const placements = rankTrack(
      canonicalConstitution(),
      "payments",
      [base(1), base(2, { valid: false })],
      0,
    );

    expect(placements.map((placement) => placement.team)).toEqual([1]);
  });

  /**
   * Short of the quorum is not the same as badly scored, so the project is not
   * ranked at all.
   */
  it("leaves out an entry short of the judge quorum", () => {
    const placements = rankTrack(
      canonicalConstitution(),
      "payments",
      [base(1), base(2, { scores: { count: 2, total: 2_000_000n } })],
      0,
    );

    expect(placements.map((placement) => placement.team)).toEqual([1]);
  });

  it("leaves out an entry from another track", () => {
    const placements = rankTrack(
      canonicalConstitution(),
      "payments",
      [base(1), base(2, { track: "defi" })],
      0,
    );

    expect(placements.map((placement) => placement.team)).toEqual([1]);
  });
});

describe("the arithmetic the contract uses", () => {
  it("gives the most voted project full marks and places the rest against it", () => {
    expect(communityScore(40, 40)).toBe(MAX_WEIGHTED_SCORE);
    expect(communityScore(20, 40)).toBe(MAX_WEIGHTED_SCORE / 2);
  });

  /**
   * A hackathon where nobody voted has no top count, and dividing by it would
   * take the whole result down rather than scoring zero.
   */
  it("scores zero rather than failing when nobody voted", () => {
    expect(communityScore(0, 0)).toBe(0);
  });

  it("blends an eighty twenty split", () => {
    const vote = { judge_bps: 8_000, community_bps: 2_000 };

    expect(finalScore(vote, 800_000, 500_000)).toBe(740_000);
  });

  /**
   * A project with no scorecards contributes nothing from the judge side rather
   * than a zero, because those are different claims: one says the judges
   * thought little of it, the other says they never saw it.
   */
  it("has no average for a project nobody scored", () => {
    expect(average({ count: 0, total: 0n })).toBeNull();
    expect(average({ count: 3, total: 300n })).toBe(100);
  });

  /**
   * Truncating division, matching the contract. Rounding differently would
   * agree almost always, and the times it did not would be ties decided a hair
   * apart, which is precisely where somebody would want to check.
   */
  it("truncates rather than rounds", () => {
    expect(average({ count: 3, total: 100n })).toBe(33);
    expect(communityScore(1, 3)).toBe(333_333);
  });
});

describe("the tie break chain", () => {
  const candidate = (overrides: Partial<Candidate>): Candidate => ({
    team: 1,
    finalScore: 500_000,
    judgeAverage: 500_000,
    community: 0,
    submittedAt: 100n,
    criterionAverages: new Map(),
    ...overrides,
  });

  it("does not run at all when the scores differ", () => {
    const [ordering, decided] = compare(
      candidate({ finalScore: 600_000 }),
      candidate({}),
      canonicalConstitution().tie_break,
    );

    expect(ordering).toBe(1);
    expect(decided).toBe(DecidedBy.Score);
  });

  it("falls to the judges average first", () => {
    const [ordering, decided] = compare(
      candidate({ judgeAverage: 600_000 }),
      candidate({ judgeAverage: 400_000 }),
      canonicalConstitution().tie_break,
    );

    expect(ordering).toBe(1);
    expect(decided).toBe(DecidedBy.JudgeScore);
  });

  /**
   * The chain always ends in submission order, and submission order falls back
   * to the team identifier, so two different projects are never left undecided.
   */
  it("separates two projects that agree on everything else", () => {
    const [ordering, decided] = compare(
      candidate({ team: 1, submittedAt: 100n }),
      candidate({ team: 2, submittedAt: 100n }),
      canonicalConstitution().tie_break,
    );

    expect(ordering).toBe(1);
    expect(decided).toBe(DecidedBy.SubmissionOrder);
  });

  it("places the earlier entry above", () => {
    const [ordering, decided] = compare(
      candidate({ team: 2, submittedAt: 100n }),
      candidate({ team: 1, submittedAt: 200n }),
      canonicalConstitution().tie_break,
    );

    expect(ordering).toBe(1);
    expect(decided).toBe(DecidedBy.SubmissionOrder);
  });

  /**
   * A criterion named in the chain is read from the per criterion means, which
   * exist precisely because the weighted total has already blended them.
   */
  it("separates on a named criterion when the chain asks for one", () => {
    const chain = [
      { tag: "Criterion" as const, values: ["technical"] as readonly [string] },
      { tag: "SubmissionOrder" as const, values: undefined },
    ];

    const [ordering, decided] = compare(
      candidate({ criterionAverages: new Map([["technical", 90]]) }),
      candidate({ criterionAverages: new Map([["technical", 70]]) }),
      chain,
    );

    expect(ordering).toBe(1);
    expect(decided).toBe(DecidedBy.Criterion);
  });
});
