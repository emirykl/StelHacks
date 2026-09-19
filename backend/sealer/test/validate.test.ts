import { describe, expect, it } from "vitest";

import { contractOf, isRecord, isScorecard } from "../src/validate.js";

/**
 * The edge of the service, where a body is a claim rather than a value.
 *
 * These routes are open to whoever can reach them. Everything past this point
 * assumes a shape, so the assumptions are checked here and the failures are the
 * interesting cases.
 */

const CONTRACT = "CCQ7LAZ7TH3DPWK3MCL2JFOM3JLMK6UKFTOMR2TERRXVLYBZ55LEHHNB";
const JUDGE = "GA3A3NY4VLTTUPJCJSTJ457KAOXKPZ3PQER4M2F5TQRFG5TTNEOBQZ3K";

const scorecard = {
  judge: JUDGE,
  team: 1,
  scores: [{ criterion: "technical", score: 80 }],
};

describe("a body", () => {
  it("has to be an object at all", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord("a scorecard, honest")).toBe(false);
    expect(isRecord({})).toBe(true);
  });
});

describe("the contract a submission names", () => {
  it("has to look like a contract address", () => {
    expect(contractOf({ contract: CONTRACT })).toBe(CONTRACT);
    expect(contractOf({ contract: JUDGE })).toBeNull();
    expect(contractOf({ contract: "CCQ7" })).toBeNull();
    expect(contractOf({})).toBeNull();
  });

  /**
   * An account address is the near miss worth naming: it is the right length
   * and the right alphabet, and it is not a contract.
   */
  it("refuses an account address in the contract's place", () => {
    expect(contractOf({ contract: JUDGE })).toBeNull();
  });
});

describe("a scorecard", () => {
  it("is accepted when every field is the shape it claims", () => {
    expect(isScorecard(scorecard)).toBe(true);
  });

  it("is refused when a score is not a number", () => {
    expect(isScorecard({ ...scorecard, scores: [{ criterion: "technical", score: "80" }] })).toBe(
      false,
    );
  });

  it("is refused when a criterion has no name", () => {
    expect(isScorecard({ ...scorecard, scores: [{ score: 80 }] })).toBe(false);
  });

  it("is refused when the scores are not a list", () => {
    expect(isScorecard({ ...scorecard, scores: { technical: 80 } })).toBe(false);
  });

  it("is refused when the team is not a number", () => {
    expect(isScorecard({ ...scorecard, team: "1" })).toBe(false);
  });
});
