import { PRIZE_ASSETS, codeOf, dollarsOf } from "./money";

/** Public analytics count approved wallet registrations, never pending applications. */
export interface AnalyticsRows {
  hackathons: { contract_id: string; name: string; slug: string }[];
  states: { contract_id: string; phase: number; prize_asset: string | null }[];
  participants: { contract_id: string; address: string; approved_at_ledger: number }[];
  profiles: { id: string; country: string | null; created_at: string }[];
  links: { address: string; profile_id: string }[];
  approvals: { contract_id: string; ledger: number; occurred_at: string }[];
  submissions: { contract_id: string; team_id: number; status: number }[];
  /** Amounts arrive as decimal strings; `numeric(39, 0)` does not fit a number. */
  payments: { contract_id: string; track: string; amount: string; kind: number }[];
}

export type AnalyticsScope = "current" | "all" | "past" | string;
/**
 * `lumen` is the dollar price of one XLM, or null when no quote could be had.
 * Passed in rather than fetched so this stays a pure function of its rows: the
 * one figure here that comes from off chain arrives as an argument, and a test
 * can pin it.
 */
export function summarize(rows: AnalyticsRows, scope: AnalyticsScope, now = new Date(), lumen: number | null = null) {
  const phases = new Map(rows.states.map((row) => [row.contract_id, row.phase]));
  const events = rows.hackathons.map((row) => ({ ...row, phase: phases.get(row.contract_id) ?? null }));
  const selected = events.filter((row) => scope === "all" || (scope === "current"
    ? row.phase !== null && row.phase >= 1 && row.phase < 8
    : scope === "past" ? row.phase === 8 || row.phase === 9 : row.contract_id === scope));
  const ids = new Set(selected.map((row) => row.contract_id));
  const participants = rows.participants.filter((row) => ids.has(row.contract_id));
  const profiles = new Map(rows.profiles.map((row) => [row.id, row]));
  const owners = new Map(rows.links.map((row) => [row.address, row.profile_id]));
  const times = new Map(rows.approvals.map((row) => [`${row.contract_id}:${row.ledger}`, row.occurred_at]));
  const countries = new Map<string, number>();
  const days = new Map<string, number>();
  let missingCountry = 0;
  let missingDate = 0;
  for (const row of participants) {
    const country = profiles.get(owners.get(row.address) ?? "")?.country;
    if (country) countries.set(country, (countries.get(country) ?? 0) + 1);
    else missingCountry++;
    const timestamp = times.get(`${row.contract_id}:${row.approved_at_ledger}`);
    if (timestamp && Number.isFinite(Date.parse(timestamp))) {
      const day = new Date(timestamp).toISOString().slice(0, 10);
      days.set(day, (days.get(day) ?? 0) + 1);
    } else missingDate++;
  }
  let cumulative = 0;
  const timeline = [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => {
    cumulative += count;
    return { date, count, total: cumulative };
  });
  const submissions = rows.submissions.filter((row) => ids.has(row.contract_id));
  // Only kind 0. The other two are a sweep and a returned no-award, which left
  // the vault without anybody winning them; counting those as prize money would
  // credit a track for a prize nobody was paid.
  const paid = new Map<string, bigint>();
  // Totalled per token, never across them: a hackathon paying in XLM and one
  // paying in USDC have nothing addable between them, and one combined figure
  // would be an exchange rate this page never asked for.
  const byAsset = new Map<string, { amount: bigint; payouts: number }>();
  const assets = new Map(rows.states.map((row) => [row.contract_id, row.prize_asset]));
  for (const row of rows.payments) {
    if (!ids.has(row.contract_id) || row.kind !== 0) continue;
    paid.set(row.track, (paid.get(row.track) ?? BigInt(0)) + BigInt(row.amount));
    const code = codeOf(assets.get(row.contract_id) ?? null);
    const running = byAsset.get(code) ?? { amount: BigInt(0), payouts: 0 };
    byAsset.set(code, { amount: running.amount + BigInt(row.amount), payouts: running.payouts + 1 });
  }
  // Kept as a string across the boundary: a BigInt cannot be serialised to the
  // client, and a number loses stroops long before it loses the total.
  const tracks = [...paid]
    .sort(([aTrack, a], [bTrack, b]) => (b > a ? 1 : b < a ? -1 : aTrack.localeCompare(bTrack)))
    .slice(0, 5)
    .map(([track, amount]) => ({ track, amount: amount.toString() }));
  // The two tokens the product offers first and in their own order, so
  // switching between hackathons does not reshuffle the panel; anything else
  // follows alphabetically rather than being ranked against an amount it is
  // not comparable to.
  const rank = (code: string) => {
    const known = PRIZE_ASSETS.findIndex((asset) => asset.code === code);
    return known === -1 ? PRIZE_ASSETS.length : known;
  };
  const paidAssets = [...byAsset]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([code, { amount, payouts }]) => ({
      code, amount: amount.toString(), payouts, dollars: dollarsOf(code, amount, lumen),
    }));
  const cutoff = now.getTime() - 30 * 86_400_000;
  return {
    scope, events, selected: selected.length,
    label: scope === "all" ? "All hackathons" : scope === "current" ? "Current hackathons" : scope === "past" ? "Past hackathons" : selected[0]?.name ?? "Unknown hackathon",
    updatedAt: now.toISOString(),
    totalUsers: profiles.size,
    newUsers: rows.profiles.filter((row) => Date.parse(row.created_at) >= cutoff && Date.parse(row.created_at) <= now.getTime()).length,
    registrations: participants.length,
    wallets: new Set(participants.map((row) => row.address)).size,
    countryCount: countries.size,
    countries: [...countries].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    missingCountry, missingDate, timeline,
    projects: submissions.length,
    projectStatuses: [0, 1, 2].map((status) => submissions.filter((row) => row.status === status).length),
    tracks, paidTracks: paid.size, paidAssets,
  };
}
export type Statistics = ReturnType<typeof summarize>;

/** Supabase caps responses; keep reading ordered pages instead of silently undercounting. */
export async function readPages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await read(offset, offset + size - 1);
    if (error) throw new Error(error.message);
    if (data === null) throw new Error("Statistics returned no data");
    rows.push(...data);
    if (data.length < size) return rows;
  }
}
