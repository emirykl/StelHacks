import { describe, expect, it } from "vitest";

import { fits } from "../src/rules.js";
import { contractOf, isBallot, isRecord, isScorecard } from "../src/validate.js";

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

describe("a ballot arriving at the door", () => {
  const cast = [
    { team: 1, weight: 6 },
    { team: 4, weight: 4 },
  ];

  it("is taken when every choice is a whole positive pair in ascending order", () => {
    expect(isBallot(cast)).toBe(true);
  });

  it("is taken when everything goes on one project", () => {
    expect(isBallot([{ team: 2, weight: 10 }])).toBe(true);
  });

  it("is refused when it names nobody", () => {
    expect(isBallot([])).toBe(false);
  });

  /**
   * The contract hashes the choices in this order and will not sort them, so a
   * ballot that arrives out of order would be sealed under a digest the reveal
   * cannot reproduce. Refusing it here is the difference between an error the
   * voter can act on and a vote that quietly fails weeks later.
   */
  it("is refused when the choices are out of order", () => {
    expect(isBallot([{ team: 4, weight: 4 }, ...[{ team: 1, weight: 6 }]])).toBe(false);
  });

  it("is refused when one project is named twice", () => {
    expect(
      isBallot([
        { team: 2, weight: 5 },
        { team: 2, weight: 5 },
      ]),
    ).toBe(false);
  });

  it("is refused when a choice is worth nothing", () => {
    expect(
      isBallot([
        { team: 1, weight: 10 },
        { team: 2, weight: 0 },
      ]),
    ).toBe(false);
  });

  it("is refused when a weight is not whole", () => {
    expect(isBallot([{ team: 1, weight: 2.5 }])).toBe(false);
  });

  it("is refused when it is not a list at all", () => {
    expect(isBallot({ team: 1, weight: 10 })).toBe(false);
  });
});

describe("a ballot measured against the rules it was cast under", () => {
  const rules = { power: 10, maxChoices: 3 };

  it("fits when it spends every point inside the spread", () => {
    expect(
      fits(
        [
          { team: 1, weight: 5 },
          { team: 2, weight: 5 },
        ],
        rules,
      ),
    ).toBe(true);
  });

  it("does not fit when it leaves points unspent", () => {
    expect(fits([{ team: 1, weight: 4 }], rules)).toBe(false);
  });

  it("does not fit when it places more than it was given", () => {
    expect(
      fits(
        [
          { team: 1, weight: 8 },
          { team: 2, weight: 8 },
        ],
        rules,
      ),
    ).toBe(false);
  });

  it("does not fit when it is spread wider than the rules allow", () => {
    expect(
      fits(
        [
          { team: 1, weight: 3 },
          { team: 2, weight: 3 },
          { team: 3, weight: 2 },
          { team: 4, weight: 2 },
        ],
        rules,
      ),
    ).toBe(false);
  });
});
