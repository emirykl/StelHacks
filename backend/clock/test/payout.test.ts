import { spec, type HackathonCore } from "@stelhacks/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { payOut } from "../src/payout.js";

/**
 * What the clock sends once settlement is open, against a contract that only
 * answers simulations.
 *
 * The contract decides who may be paid; these tests hold the clock to asking
 * it the right questions and sending only what it said yes to. Every one of
 * them is a way money would move when it should not, or stay put when it
 * should have gone.
 */

const SETTLEMENT = 7;
const WINNERS = ["GALICE", "GBOB", "GCAROL"];

function code(name: string): number {
  const found = spec.errorCases().find((error) => error.name().toString() === name);

  if (found === undefined) {
    throw new Error(`no ${name} in the contract spec`);
  }

  return found.value();
}

const ok = <T>(value: T) => ({ isOk: () => true, unwrap: () => value });
const missing = { isOk: () => false, unwrap: () => { throw new Error("err"); } };

/** A call the contract would let through. */
function goes<T>(result: T) {
  return { result, simulation: {}, signAndSend: vi.fn() };
}

/** A call the contract refuses with one of its own errors. */
function refused(name: string) {
  return {
    result: missing,
    simulation: { error: `HostError: Error(Contract, #${code(name)})` },
    signAndSend: vi.fn(),
  };
}

/** A call to a function the deployed wasm does not have. */
const absent = {
  result: missing,
  simulation: { error: "HostError: Error(WasmVm, MissingValue) trying to invoke non-existent contract function" },
  signAndSend: vi.fn(),
};

type Call = ReturnType<typeof goes> | ReturnType<typeof refused> | typeof absent;

interface Chain {
  phase?: number;
  paused?: boolean;
  /** Who won payments #1, or nobody. */
  won?: boolean;
  settlePosition?: () => Call;
  sweepShare?: () => Call;
}

/** One frozen position, payments #1, and whatever the test says about it. */
function chain(given: Chain) {
  const calls: Record<string, Call[]> = {};
  const record = (name: string, call: Call) => {
    (calls[name] ??= []).push(call);
    return call;
  };

  const core = {
    state: async () => ({
      result: ok({ phase: given.phase ?? SETTLEMENT, settlement_paused: given.paused ?? false }),
    }),
    settle_platform_fee: async () => record("settle_platform_fee", refused("PrizeAlreadyPaid")),
    constitution: async () => ({ result: ok({ prize_tiers: [{ track: "payments", rank: 1 }] }) }),
    sponsor_track_ids: async () => ({ result: [] }),
    is_paid: async () => ({ result: false }),
    ranking: async () => ({ result: ok(given.won === false ? [] : [{ rank: 1, team: 1 }]) }),
    team_by_id: async () => ({ result: ok({ members: WINNERS }) }),
    settle_position: async () =>
      record("settle_position", given.settlePosition?.() ?? goes(ok(WINNERS.length))),
    settle_prize: async () => record("settle_prize", goes(ok(1))),
    sweep_share: async () => record("sweep_share", given.sweepShare?.() ?? refused("PrizeAlreadyPaid")),
    sweep_unclaimed: async () => record("sweep_unclaimed", goes(ok(1))),
  };

  const sentTo = (name: string) =>
    (calls[name] ?? []).filter((call) => call.signAndSend.mock.calls.length > 0).length;

  return { core: core as unknown as HackathonCore, calls, sentTo };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("paying a hackathon out", () => {
  it("pays the whole team in one call", async () => {
    const { core, sentTo } = chain({});

    const paid = await payOut(core, "CONE");

    expect(sentTo("settle_position")).toBe(1);
    expect(sentTo("settle_prize")).toBe(0);
    expect(paid.map((each) => each.call)).toEqual(["settle_position"]);
  });

  /** Nothing to pay is not a transaction worth a fee. */
  it("sends nothing when the contract says nobody can be paid yet", async () => {
    const { core, sentTo } = chain({ settlePosition: () => goes(ok(0)) });

    expect(await payOut(core, "CTWO")).toEqual([]);
    expect(sentTo("settle_position")).toBe(0);
  });

  /**
   * Hackathons keep the code they were deployed with. One from before the
   * team call has to be paid member by member, or it is never paid at all.
   */
  it("pays member by member on a contract that predates the team call", async () => {
    const { core, sentTo } = chain({ settlePosition: () => absent });

    await payOut(core, "COLD");

    expect(sentTo("settle_prize")).toBe(WINNERS.length);
  });

  /** A refusal from the team call is the contract's answer, not a missing function. */
  it("does not fall back when the team call is refused", async () => {
    const { core, sentTo } = chain({ settlePosition: () => refused("PrizeAlreadyPaid") });

    await payOut(core, "CREF");

    expect(sentTo("settle_prize")).toBe(0);
  });

  it("returns a position nobody won", async () => {
    const { core, sentTo } = chain({ won: false });

    await payOut(core, "CNONE");

    expect(sentTo("sweep_unclaimed")).toBe(1);
    expect(sentTo("settle_position")).toBe(0);
  });

  /**
   * The hold exists to stop the money while somebody looks for a bug. Older
   * contracts still let a sweep through it, so the clock has to be the one
   * that does not ask.
   */
  it("moves nothing while settlement is on hold", async () => {
    const { core, calls } = chain({ paused: true, sweepShare: () => goes(ok(1)) });

    expect(await payOut(core, "CHOLD")).toEqual([]);
    expect(Object.keys(calls)).toEqual([]);
  });

  it("does nothing outside settlement", async () => {
    const { core, calls } = chain({ phase: SETTLEMENT - 1 });

    expect(await payOut(core, "CEARLY")).toEqual([]);
    expect(Object.keys(calls)).toEqual([]);
  });

  /** A month of laps should say once that a winner is owed, not a month of times. */
  it("reports a member still owed once, however many laps it takes", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    const { core } = chain({
      settlePosition: () => goes(ok(0)),
      sweepShare: () => refused("ClaimPeriodOpen"),
    });

    await payOut(core, "COWED");
    await payOut(core, "COWED");

    expect(said).toHaveBeenCalledTimes(WINNERS.length);
  });

  /** Once the claim period is over, an unpaid share goes back to its funder. */
  it("returns a share nobody could collect once the claim period is over", async () => {
    const { core, sentTo } = chain({
      settlePosition: () => goes(ok(0)),
      sweepShare: () => goes(ok(1)),
    });

    await payOut(core, "CLATE");

    expect(sentTo("sweep_share")).toBe(WINNERS.length);
  });
});
