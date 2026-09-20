import { db } from "./chain";

/**
 * The hackathons an address was let into.
 *
 * Keyed by address rather than by account, because that is what the chain
 * recorded. The contract approves an address; it has never heard of a profile,
 * and a list built from our own sign up table would be this product keeping a
 * second story about who took part. If somebody swaps wallets, the list changes
 * with them, and that is correct rather than a bug: it is the record of what
 * that key did.
 *
 * Approved, not applied. `participants` is written from the approval event, so
 * an application still sitting with an organizer does not appear here. A page
 * that showed it would be telling somebody they are in an event they are not.
 */

export interface Joined {
  contractId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  phase: number | null;
  /** Where in the ledger they were approved, which is the order they arrived. */
  approvedAtLedger: number;
}

export async function hackathonsJoined(address: string): Promise<Joined[]> {
  if (db === null) {
    return [];
  }

  const { data: rows } = await db
    .from("participants")
    .select("contract_id, approved_at_ledger")
    .eq("address", address)
    /* Most recent first. This is somebody's own record and the thing they are
       looking for is almost always the one they did last. */
    .order("approved_at_ledger", { ascending: false });

  if (rows === null || rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => String(row.contract_id));

  const [written, chain] = await Promise.all([
    db.from("hackathons").select("contract_id, slug, name, logo_url").in("contract_id", ids),
    db.from("hackathon_state").select("contract_id, phase").in("contract_id", ids),
  ]);

  const named = new Map((written.data ?? []).map((row) => [String(row.contract_id), row]));
  const staged = new Map((chain.data ?? []).map((row) => [String(row.contract_id), row]));

  /*
    An approval with no hackathon row is dropped rather than shown as a blank.
    The indexer can see a contract before anybody has typed a name for it, and a
    row in somebody's own record reading "untitled" tells them nothing they can
    act on.
  */
  return rows.flatMap((row) => {
    const id = String(row.contract_id);
    const hackathon = named.get(id);

    if (hackathon === undefined) {
      return [];
    }

    return [
      {
        contractId: id,
        slug: String(hackathon.slug),
        name: String(hackathon.name),
        logoUrl: typeof hackathon.logo_url === "string" ? hackathon.logo_url : null,
        phase: typeof staged.get(id)?.phase === "number" ? Number(staged.get(id)?.phase) : null,
        approvedAtLedger: Number(row.approved_at_ledger),
      },
    ];
  });
}
