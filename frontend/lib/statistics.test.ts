import { describe, expect, it } from "vitest";
import { summarize, readPages, type AnalyticsRows } from "./statistics";

const rows: AnalyticsRows = {
  hackathons: [{ contract_id: "old", name: "Old", slug: "old" }, { contract_id: "new", name: "New", slug: "new" }, { contract_id: "draft", name: "Draft", slug: "draft" }],
  states: [
    { contract_id: "old", phase: 8, prize_asset: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC" },
    { contract_id: "new", phase: 2, prize_asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA" },
    { contract_id: "draft", phase: 0, prize_asset: null },
  ],
  participants: [{ contract_id: "old", address: "a", approved_at_ledger: 1 }, { contract_id: "new", address: "a", approved_at_ledger: 5 }, { contract_id: "new", address: "b", approved_at_ledger: 6 }],
  profiles: [{ id: "person", country: "TR", created_at: "2026-09-01" }, { id: "future", country: null, created_at: "2027-01-01" }],
  links: [{ address: "a", profile_id: "person" }],
  approvals: [{ contract_id: "old", ledger: 1, occurred_at: "2026-08-01T15:00:00Z" }, { contract_id: "new", ledger: 5, occurred_at: "2026-09-18T21:30:00Z" }],
  submissions: [{ contract_id: "new", team_id: 1, status: 0 }, { contract_id: "old", team_id: 1, status: 2 }],
  payments: [
    { contract_id: "old", track: "main", amount: "30000000", kind: 0 },
    { contract_id: "old", track: "main", amount: "20000000", kind: 0 },
    { contract_id: "old", track: "design", amount: "90000000", kind: 1 },
    { contract_id: "new", track: "design", amount: "40000000", kind: 0 },
  ],
};
const now = new Date("2026-09-19T12:00:00Z");
describe("public statistics", () => {
  it("filters current events without losing earlier participation history", () => {
    const result = summarize(rows, "current", now);
    expect(result.selected).toBe(1);
    expect(result.registrations).toBe(2);
    expect(result.newUsers).toBe(1);
    expect(result.projects).toBe(1);
  });
  it("does not invent countries or dates for unlinked wallets", () => {
    const result = summarize(rows, "new", now);
    expect(result.countries).toEqual([{ code: "TR", count: 1 }]);
    expect(result.missingCountry).toBe(1);
    expect(result.missingDate).toBe(1);
    expect(result.timeline).toEqual([{ date: "2026-09-18", count: 1, total: 1 }]);
  });
  it("counts registrations per event and unique wallets separately", () => {
    const result = summarize(rows, "all", now);
    expect(result.registrations).toBe(3);
    expect(result.wallets).toBe(2);
    expect(result.countries[0].count).toBe(2);
    expect(result.projectStatuses).toEqual([1, 0, 1]);
    expect(summarize(rows, "past", now).registrations).toBe(1);
  });
  it("ranks tracks on what winners were paid, not on what left the vault", () => {
    const result = summarize(rows, "all", now);
    // The 9 XLM sweep on "design" is kind 1: nobody won it, so it cannot put
    // that track above the 5 XLM two winners were actually paid on "main".
    expect(result.tracks).toEqual([
      { track: "main", amount: "50000000" },
      { track: "design", amount: "40000000" },
    ]);
    expect(summarize(rows, "past", now).tracks).toEqual([{ track: "main", amount: "50000000" }]);
  });
  it("totals prize money per token rather than adding two currencies together", () => {
    // 5 XLM over two payments on the old event, 4 USDC over one on the new. The
    // 9 XLM sweep is kind 1 and belongs to neither figure. At 20 cents a lumen
    // the XLM side is worth a dollar; the stablecoin needs no quote.
    expect(summarize(rows, "all", now, 0.2).paidAssets).toEqual([
      { code: "XLM", amount: "50000000", payouts: 2, dollars: 1 },
      { code: "USDC", amount: "40000000", payouts: 1, dollars: 4 },
    ]);
    expect(summarize(rows, "new", now).paidAssets).toEqual([
      { code: "USDC", amount: "40000000", payouts: 1, dollars: 4 },
    ]);
  });
  it("leaves a lumen total unquoted rather than valuing it at nothing", () => {
    // A missing quote has to stay missing all the way to the panel, which is
    // what stops it drawing an XLM slice of zero beside a real USDC one.
    const [lumens, stablecoin] = summarize(rows, "all", now).paidAssets;
    expect(lumens.dollars).toBeNull();
    expect(stablecoin.dollars).toBe(4);
  });
  it("names a prize token it does not know by its address instead of guessing", () => {
    const unknown: AnalyticsRows = {
      ...rows,
      states: [{ contract_id: "new", phase: 2, prize_asset: "CXYZ0000000000000000000000000000000000000000000000000ABCD" }],
    };
    expect(summarize(unknown, "new", now, 0.2).paidAssets).toEqual([
      { code: "CXYZ…ABCD", amount: "40000000", payouts: 1, dollars: null },
    ]);
  });
  it("keeps an unknown selection empty instead of showing unrelated totals", () => {
    expect(summarize(rows, "missing", now).registrations).toBe(0);
  });
  it("reads beyond the API page limit", async () => {
    const all = Array.from({ length: 1205 }, (_, id) => ({ id }));
    const result = await readPages(async (from, to) => ({ data: all.slice(from, to + 1), error: null }));
    expect(result).toEqual(all);
  });
  it("rejects failed pages rather than displaying partial counts", async () => {
    await expect(readPages(async () => ({ data: null, error: { message: "offline" } }))).rejects.toThrow("offline");
  });
});
