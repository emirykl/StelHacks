import { db } from "./chain";

/**
 * Who was let into a hackathon, as the chain recorded it.
 *
 * The guest list is derived: the indexer writes one row per approval event, so
 * this is a replayable view of what the contract did rather than a sign up
 * form's own memory. That is why an address is always present and a name is
 * sometimes not. An address got in; a person only has a name here if they
 * signed in and proved they hold it.
 *
 * Three reads rather than one join. `participants` has no foreign key to
 * `wallet_links`, and it must not: the contract approves an address, and an
 * address is allowed to belong to nobody. A join would make the guest list
 * depend on somebody having made an account, which is exactly the dependency
 * this product refuses everywhere else.
 */

export interface Hacker {
  address: string;
  /** Absent when nobody has proved they hold this address. */
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** Where in the ledger they were approved, which is the order they arrived. */
  approvedAtLedger: number;
}

export async function countHackers(contractId: string): Promise<number> {
  if (db === null) {
    return 0;
  }

  const { count } = await db
    .from("participants")
    .select("address", { count: "exact", head: true })
    .eq("contract_id", contractId);

  return count ?? 0;
}

export async function hackersOf(contractId: string, limit = 60): Promise<Hacker[]> {
  if (db === null) {
    return [];
  }

  const { data: approved } = await db
    .from("participants")
    .select("address, approved_at_ledger")
    .eq("contract_id", contractId)
    /* Earliest first. The order somebody joined in is a fact about the event;
       any other order would be one this page invented. */
    .order("approved_at_ledger", { ascending: true })
    .limit(limit);

  if (approved === null || approved.length === 0) {
    return [];
  }

  const addresses = approved.map((row) => String(row.address));

  const { data: links } = await db
    .from("wallet_links")
    .select("address, profile_id")
    .in("address", addresses);

  const owner = new Map((links ?? []).map((row) => [String(row.address), String(row.profile_id)]));

  /* Only for the addresses that turned out to belong to somebody. Asking for
     every profile and filtering here would read a table that grows with the
     whole site to answer a question about one event. */
  const ids = [...new Set(owner.values())];

  const { data: people } =
    ids.length === 0
      ? { data: [] }
      : await db.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);

  const person = new Map((people ?? []).map((row) => [String(row.id), row]));

  return approved.map((row) => {
    const found = person.get(owner.get(String(row.address)) ?? "");

    return {
      address: String(row.address),
      username: found === undefined ? null : String(found.username),
      displayName: (found?.display_name as string | null) ?? null,
      avatarUrl: (found?.avatar_url as string | null) ?? null,
      approvedAtLedger: Number(row.approved_at_ledger),
    };
  });
}
