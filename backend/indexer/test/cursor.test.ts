import { describe, expect, it } from "vitest";

import { drifted, MAX_DRIFT_LEDGERS } from "../src/cursor.js";

/**
 * When a scan that found nothing is worth a database write.
 *
 * This is the rule that decides what an idle indexer costs. Before it, every
 * lap wrote the cursor and read it back several times over, so a week of
 * watching a quiet hackathon spent more egress than a free Supabase
 * organization gets in a month — against a database of thirty megabytes, which
 * is the detail that makes it a bug rather than a bill.
 *
 * The other direction has a real cost too, so it is not simply "write less".
 * Drifting too far means a killed process rescans from the last written ledger,
 * and drifting past what the node still serves means it cannot rescan at all.
 */
describe("deciding whether a scan is worth writing down", () => {
  it("holds a scan that has barely moved", () => {
    expect(drifted(1_000, 999)).toBe(false);
  });

  it("writes once the scan is a full drift ahead", () => {
    expect(drifted(1_000 + MAX_DRIFT_LEDGERS, 1_000)).toBe(true);
  });

  it("writes when the scan is further ahead still", () => {
    expect(drifted(50_000, 1_000)).toBe(true);
  });

  /**
   * A contract with no row yet reads as zero, and the first quiet laps on a
   * freshly followed hackathon must not each write. They only start writing
   * once the scan has covered a drift's worth of ledgers.
   */
  it("treats an unwritten cursor as the beginning rather than as a reason to write", () => {
    expect(drifted(MAX_DRIFT_LEDGERS - 1, 0)).toBe(false);
    expect(drifted(MAX_DRIFT_LEDGERS, 0)).toBe(true);
  });

  /**
   * The window a Stellar RPC node serves is measured in days and this is
   * measured in about ninety minutes. A drift that outgrew the window would
   * resume at a ledger the node has dropped, which is the one failure the
   * cursor is careful about everywhere else.
   */
  it("stays far inside what a node still serves", () => {
    const ledgersInADay = 17_280;

    expect(MAX_DRIFT_LEDGERS).toBeLessThan(ledgersInADay);
  });
});
