import { db } from "./chain";
import { lumenPrice } from "./money";
import { readPages, summarize, type AnalyticsRows } from "./statistics";

export async function loadStatistics(scope: string) {
  const client = db;
  if (client === null) throw new Error("Statistics database is not configured");
  async function read<K extends keyof AnalyticsRows>(key: K, table: string, columns: string, order: string[]) {
    void key;
    return readPages<AnalyticsRows[K][number]>((from, to) => {
      let query = client!.from(table).select(columns);
      // Payloads are raw XDR. Approval is established by participants; the
      // matching ledger supplies its timestamp without decoding private fields.
      if (table === "chain_events") query = query.in("name", ["application_decided", "ApplicationDecided"]);
      for (const column of order) query = query.order(column);
      return query.range(from, to) as unknown as PromiseLike<{ data: AnalyticsRows[K]; error: { message: string } | null }>;
    });
  }
  // Only public columns under the anonymous role; private applications and ballots never enter this page.
  // The quote rides along with the rows. It is the only value on this page that
  // is not on chain, it is allowed to be missing, and asking for it after the
  // rows had landed would add a round trip to a page that already waited once.
  const [lumen, hackathons, states, participants, profiles, links, approvals, submissions, payments] = await Promise.all([
    lumenPrice(),
    read("hackathons", "hackathons", "contract_id,name,slug", ["contract_id"]),
    read("states", "hackathon_state", "contract_id,phase,prize_asset", ["contract_id"]),
    read("participants", "participants", "contract_id,address,approved_at_ledger", ["contract_id", "address"]),
    read("profiles", "profiles", "id,country,created_at", ["id"]),
    read("links", "wallet_links", "address,profile_id", ["address"]),
    read("approvals", "chain_events", "contract_id,ledger,occurred_at", ["contract_id", "ledger", "event_index"]),
    read("submissions", "submissions", "contract_id,team_id,status", ["contract_id", "team_id"]),
    read("payments", "payments", "contract_id,track,amount,kind", ["contract_id", "track", "rank"]),
  ]);
  return summarize({ hackathons, states, participants, profiles, links, approvals, submissions, payments }, scope, new Date(), lumen);
}
