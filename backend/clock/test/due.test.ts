import { describe, expect, it } from "vitest";

import { named, nothingToDo, refusal, stillMoving } from "../src/due.js";

/**
 * What the clock is allowed to skip, and what it has to report.
 *
 * Both halves fail the same way when they are wrong: quietly. A hackathon
 * skipped for a reason that does not hold sits at a deadline that has passed
 * and nobody is told, and a refusal miscounted as ordinary hides the day the
 * account runs out of money. So each test here is one thing that must not be
 * swallowed.
 */

function known(phases: Record<string, number>, extra: string[] = []) {
  return {
    contracts: [...Object.keys(phases), ...extra],
    phases: new Map(Object.entries(phases)),
  };
}

/** How a failed simulation actually arrives, down to the newline. */
function simulated(code: number): string {
  return (
    `HostError: Error(Contract, #${code})\n\nEvent log (newest first):\n` +
    `   0: [Diagnostic Event] topics:[error, Error(Contract, #${code})]`
  );
}

describe("which hackathons get a lap", () => {
  /** Skipping these forever is the only reason to read the projection at all. */
  it("leaves the finished and the cancelled alone", () => {
    expect(stillMoving(known({ done: 8, stopped: 9, judging: 4 }))).toEqual(["judging"]);
  });

  /**
   * The indexer rebuilds from the log, so its phase can lag the chain's. A
   * hackathon whose window closed while the projection still says Draft is
   * exactly the one that needs moving, and filtering on the phases a deadline
   * closes would have skipped it.
   */
  it("keeps a hackathon the indexer has not caught up on", () => {
    expect(stillMoving(known({ behind: 0 }))).toEqual(["behind"]);
    expect(stillMoving(known({ settling: 7 }))).toEqual(["settling"]);
  });

  /** A hackathon created a moment ago has no projected state at all yet. */
  it("keeps one the indexer has never seen", () => {
    expect(stillMoving(known({}, ["fresh"]))).toEqual(["fresh"]);
  });
});

describe("reading a refusal", () => {
  it("takes the code out of the simulation, whatever follows it", () => {
    expect(refusal(simulated(32))).toBe(32);
  });

  /**
   * RPC gives up, or state has expired, and neither is the contract saying no.
   * Reading a code out of one of those would report a refusal nobody made.
   */
  it("finds nothing in a failure that is not the contract's", () => {
    expect(refusal("request timed out")).toBeNull();
    expect(refusal("")).toBeNull();
  });
});

describe("which refusals are worth saying out loud", () => {
  /**
   * The codes are read from the spec the wasm publishes, so these numbers are
   * the contract's own and this test is what notices if they move.
   *
   * One per call this service makes. Each is the ordinary state of a hackathon
   * that is simply still running, and a lap that reported them would drown the
   * one line that matters in a commentary on every event in the database.
   */
  it("says nothing about a condition that has not been met yet", () => {
    expect(nothingToDo(refusal(simulated(32)))).toBe(true);
    expect(nothingToDo(refusal(simulated(30)))).toBe(true);
    expect(nothingToDo(refusal(simulated(81)))).toBe(true);
    expect(nothingToDo(refusal(simulated(84)))).toBe(true);

    expect(named(32)).toBe("DeadlineNotReached");
    expect(named(30)).toBe("WrongPhase");
    expect(named(81)).toBe("SafetyWindowOpen");
    expect(named(84)).toBe("SettlementIncomplete");
  });

  /**
   * A schedule that will not validate is a hackathon that needs a person, and
   * an unreadable failure is usually the account having run out of money. Both
   * have to reach the log or the clock stops silently.
   */
  it("reports any other refusal, and anything it could not read", () => {
    expect(nothingToDo(refusal(simulated(34)))).toBe(false);
    expect(nothingToDo(null)).toBe(false);
  });
});
