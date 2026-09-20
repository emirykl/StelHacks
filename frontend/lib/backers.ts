import { db } from "./chain";

/**
 * Who is behind a contribution, for the contributions somebody agreed to name.
 *
 * The money is the contract's and is read from it. This is the other half: the
 * name the address belongs to, and whether the organizer has agreed to put it
 * on their page. A wall entry with no credit is not missing anything — it is
 * the address, which is what the chain actually knows.
 *
 * Read with the anonymous key, because a sponsor wall is the most public thing
 * on a public page. Nothing here is allowed to decide an outcome, and nothing
 * here is consulted for a total: a page that got its prize figure from this
 * file would be a page reporting our own table as the chain.
 */

/** A backer, as a wall shows one. */
export interface Backer {
  address: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  /** 'waiting' until the organizer has answered, then 'shown' or 'hidden'. */
  status: string;
  /** What they asked to be called, which is what the digest on chain covers. */
  sponsorName: string | null;
  sponsorUrl: string | null;
  sponsorNote: string | null;
}

/** What a sponsor says about themselves, as the form collects it. */
export interface Said {
  name: string;
  url: string;
  note: string;
}

/**
 * Every credit claimed against one hackathon, decided or not.
 *
 * A list rather than a map, because this is read on the server and handed to a
 * client component: a `Map` has to survive serialisation across that boundary
 * and an array has nothing to survive. The lists are the length of a sponsor
 * wall, so looking one up by scanning costs nothing worth naming.
 *
 * Two queries rather than a join, for the same reason `ownersOf` uses two:
 * PostgREST will not join a table to `profiles` without a declared
 * relationship, and a view whose only job is to save one round trip on a list
 * of five is a view somebody has to maintain.
 */
export async function backersOf(contractId: string): Promise<Backer[]> {
  if (db === null) {
    return [];
  }

  const { data: credits } = await db
    .from("sponsor_credits")
    .select("address, profile_id, status, sponsor_name, sponsor_url, sponsor_note")
    .eq("contract_id", contractId);

  const rows = (credits ?? []).map((row) => row as Record<string, unknown>);

  if (rows.length === 0) {
    return [];
  }

  const { data: people } = await db
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", [...new Set(rows.map((row) => String(row["profile_id"] ?? "")))]);

  const profiles = new Map<string, Record<string, unknown>>();

  for (const row of people ?? []) {
    const record = row as Record<string, unknown>;
    profiles.set(String(record["id"] ?? ""), record);
  }

  return rows.map((row) => {
    const profile = profiles.get(String(row["profile_id"] ?? ""));

    return {
      address: String(row["address"] ?? ""),
      displayName: text(profile?.["display_name"]),
      username: text(profile?.["username"]),
      avatarUrl: text(profile?.["avatar_url"]),
      status: String(row["status"] ?? "waiting"),
      sponsorName: text(row["sponsor_name"]),
      sponsorUrl: text(row["sponsor_url"]),
      sponsorNote: text(row["sponsor_note"]),
    };
  });
}

/** The credit against one address, whatever state it is in. */
export function creditFor(backers: Backer[], address: string): Backer | undefined {
  return backers.find((backer) => backer.address === address);
}

/**
 * What to call somebody, falling back to the only name the chain has.
 *
 * An undecided credit reads as an address, not as a name with a caveat beside
 * it. The wall is the organizer's page and a name on it is their word as much
 * as the sponsor's; until they have given it, the honest line is the one the
 * contract itself holds.
 *
 * What they typed comes first, because that is the name the digest on chain
 * was taken over. The account's own display name is the fallback for credits
 * claimed before the form asked.
 */
export function nameOf(backer: Backer | undefined, address: string): string {
  if (backer === undefined || backer.status !== "shown") {
    return short(address);
  }

  return claimedName(backer, address);
}

/**
 * The name a credit asks for, whether or not it has been agreed to.
 *
 * The counterpart of `nameOf`, and the distinction is who is reading. The wall
 * refuses to print a name nobody has agreed to; the organizer's own queue is
 * where that agreement is given, so withholding it there would hide the very
 * thing being decided and leave them answering about an address.
 */
export function claimedName(backer: Backer | undefined, address: string): string {
  if (backer === undefined) {
    return short(address);
  }

  return (
    backer.sponsorName ??
    backer.displayName ??
    (backer.username === null ? short(address) : `@${backer.username}`)
  );
}

/**
 * The digest the contract stores against a contribution.
 *
 * Domain tagged and taken over the three fields exactly as they are written to
 * the row, so anybody holding the row can recompute it and compare it with what
 * the chain recorded. That comparison is the whole point of the note: it is
 * what stops a name on a sponsor wall from being something we could change
 * afterwards without the chain disagreeing.
 *
 * Thirty two zero bytes when nothing was said. The contract takes a digest
 * either way, and committing to an empty string would claim a record exists.
 */
export async function digestOf(said: Said): Promise<Uint8Array> {
  const written = `${said.name}\n${said.url}\n${said.note}`;

  if (written.trim() === "") {
    return new Uint8Array(32);
  }

  /* Handed over as the buffer rather than the view: `subtle.digest` takes a
     `BufferSource`, and a `Uint8Array` is only assignable to one when the
     checker can prove its buffer is not shared, which it cannot here. */
  const payload = new TextEncoder().encode(`stelhacks.v1.sponsor\n${written}`);

  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", payload.buffer as ArrayBuffer),
  );
}

export function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/**
 * Asks to be named beside a contribution that has just landed.
 *
 * Fire and forget on purpose. The money is already on the chain and nothing
 * about this changes that; a sponsor whose credit request failed to reach us
 * has still funded the prize, and telling them their donation went wrong
 * because a row did not insert would be a lie about the thing that mattered.
 */
export async function claimCredit(
  contract: string,
  address: string,
  said: Said,
): Promise<void> {
  await fetch("/api/backer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, address, ...said }),
  }).catch(() => null);
}

/** The organizer's answer, which decides only whether a name is printed. */
export async function decideCredit(
  contract: string,
  address: string,
  shown: boolean,
  proof: { issuedAt: number; signature: string } | null,
): Promise<{ ok: boolean; why: string | null }> {
  const answer = await fetch("/api/backer", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, address, shown, ...proof }),
  }).catch(() => null);

  if (answer === null) {
    return { ok: false, why: "the request did not go through" };
  }

  if (answer.ok) {
    return { ok: true, why: null };
  }

  const said = (await answer.json().catch(() => ({}))) as { error?: unknown };

  return {
    ok: false,
    /* The status matters to the caller: a 403 is the one case worth answering
       with a wallet prompt rather than with a message. */
    why: answer.status === 403 ? null : String(said.error ?? "it was refused"),
  };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
