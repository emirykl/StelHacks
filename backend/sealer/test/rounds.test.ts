import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ core: vi.fn(), held: vi.fn(), contracts: vi.fn() }));
vi.mock("../src/core.js", () => ({ core: mocked.core }));
vi.mock("../src/store.js", () => ({
  everyHackathon: mocked.contracts, heldBallots: mocked.held,
  heldScorecards: mocked.held, leaves: vi.fn(),
}));
// Import the real contract spec: startup must catch removed/renamed error cases.
import { round } from "../src/rounds.js";

describe("automatic rounds", () => {
  beforeEach(() => vi.clearAllMocks());
  it("loads with the current contract and leaves an open event alone", async () => {
    mocked.core.mockReturnValue({ phase: async () => ({ result: { isOk: () => true, unwrap: () => 2 } }) });
    await expect(round("event")).resolves.toEqual([]);
    expect(mocked.held).not.toHaveBeenCalled();
  });
  it("does not send a ranking transaction before the contract is ready", async () => {
    const signAndSend = vi.fn();
    mocked.held.mockResolvedValue([]);
    mocked.core.mockReturnValue({
      phase: async () => ({ result: { isOk: () => true, unwrap: () => 5 } }),
      finalize_results: async () => ({ simulation: { error: "Error(Contract, #32)" }, signAndSend }),
    });
    await expect(round("event")).resolves.toEqual([]);
    expect(signAndSend).not.toHaveBeenCalled();
  });
  it("reports unexpected refusals instead of concealing a failed round", async () => {
    const signAndSend = vi.fn();
    mocked.held.mockResolvedValue([]);
    mocked.core.mockReturnValue({
      phase: async () => ({ result: { isOk: () => true, unwrap: () => 5 } }),
      finalize_results: async () => ({ simulation: { error: "Error(Contract, #64)" }, signAndSend }),
    });
    await expect(round("event")).resolves.toEqual(["event: the ranking refused: BallotMalformed"]);
    expect(signAndSend).not.toHaveBeenCalled();
  });
});
