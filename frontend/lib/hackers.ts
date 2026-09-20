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
  /** The places they said they can be found, absent unless they filled them in. */
  github: string | null;
  linkedin: string | null;
  x: string | null;
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

  const { data: people } = ids.length === 0 ? { data: [] } : await profilesOf(ids);

  const person = new Map((people ?? []).map((row) => [String(row["id"]), row]));

  return approved.map((row) => {
    const found = person.get(owner.get(String(row.address)) ?? "");

    return {
      address: String(row.address),
      username: found === undefined ? null : String(found["username"]),
      displayName: (found?.["display_name"] as string | null) ?? null,
      avatarUrl: (found?.["avatar_url"] as string | null) ?? null,
      github: (found?.["github_username"] as string | null) ?? null,
      linkedin: (found?.["linkedin_url"] as string | null) ?? null,
      x: (found?.["x_username"] as string | null) ?? null,
      approvedAtLedger: Number(row.approved_at_ledger),
    };
  });
}

/**
 * The places somebody said they can be found, in the order the profile page
 * lists them.
 *
 * Typed over the three fields rather than over a `Hacker` or a `Person`, so
 * the guest list and the applications queue build the same links from the
 * same rules. Two copies of "GitHub usernames become a github.com URL and a
 * LinkedIn is already one" is how one surface ends up linking to nothing.
 */
export function linksOf(who: Pick<Hacker, "github" | "linkedin" | "x">) {
  return [
    who.github === null
      ? null
      : { key: "github" as const, title: "GitHub", href: `https://github.com/${who.github}` },
    who.x === null ? null : { key: "x" as const, title: "X", href: `https://x.com/${who.x}` },
    /* Already a URL, because LinkedIn's own handles are not stable enough to
       build one from. Whatever the profile stored is what is followed. */
    who.linkedin === null
      ? null
      : { key: "linkedin" as const, title: "LinkedIn", href: who.linkedin },
  ].filter((link) => link !== null);
}

/** Who an address belongs to, when it belongs to anybody. */
export interface Person {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  /**
   * The places they said they can be found, absent unless they filled them in.
   *
   * Carried because the one surface reading this is an organizer deciding
   * whether to let somebody into their hackathon, and a name with nothing
   * behind it is not much to decide on. The columns were already being read —
   * `profilesOf` selects them for the guest list — and were being thrown away
   * here.
   */
  github: string | null;
  linkedin: string | null;
  x: string | null;
}

/**
 * The people behind a set of addresses, keyed by address.
 *
 * The same two reads `hackersOf` makes, lifted out so a surface holding
 * addresses from the chain rather than from `participants` can use them. The
 * applications queue is one: it reads who applied out of the contract's own
 * events, because a pending application is not a participant yet and has no row
 * anywhere on our side.
 *
 * An address with nobody behind it is simply absent from the map. That is the
 * ordinary case and not a failure: the contract approves keys, and a key is
 * allowed to belong to somebody who never made an account here.
 */
export async function peopleFor(addresses: string[]): Promise<Record<string, Person>> {
  if (db === null || addresses.length === 0) {
    return {};
  }

  const { data: links } = await db
    .from("wallet_links")
    .select("address, profile_id")
    .in("address", addresses);

  const owner = new Map((links ?? []).map((row) => [String(row.address), String(row.profile_id)]));
  const ids = [...new Set(owner.values())];

  if (ids.length === 0) {
    return {};
  }

  const { data: people } = await profilesOf(ids);
  const person = new Map((people ?? []).map((row) => [String(row["id"]), row]));

  const found: Record<string, Person> = {};

  for (const [address, id] of owner) {
    const row = person.get(id);

    if (row !== undefined) {
      found[address] = {
        username: String(row["username"]),
        displayName: (row["display_name"] as string | null) ?? null,
        avatarUrl: (row["avatar_url"] as string | null) ?? null,
        github: (row["github_username"] as string | null) ?? null,
        linkedin: (row["linkedin_url"] as string | null) ?? null,
        /* Absent on the older schema, which `profilesOf` falls back to. A
           missing column reads as a link nobody gave, which is the truth. */
        x: (row["x_username"] as string | null) ?? null,
      };
    }
  }

  return found;
}

/**
 * The profiles behind those addresses, links included where the schema has
 * caught up.
 *
 * `x_username` arrived in a later migration than the rest, and asking for a
 * column that is not there yet fails the whole select rather than that one
 * field: the guest list would lose every name to prove one link column is
 * missing. The profile page learned this first; this is the same fallback.
 */
async function profilesOf(ids: string[]): Promise<{ data: Record<string, unknown>[] | null }> {
  const withLinks = await db!
    .from("profiles")
    .select("id, username, display_name, avatar_url, github_username, linkedin_url, x_username")
    .in("id", ids);

  if (withLinks.error === null) {
    return withLinks;
  }

  return db!
    .from("profiles")
    .select("id, username, display_name, avatar_url, github_username, linkedin_url")
    .in("id", ids);
}
