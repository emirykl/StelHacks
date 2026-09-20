"use client";

import { browserClient } from "./supabase/client";

/**
 * What a team and its captain are called, as opposed to what they are.
 *
 * The chain knows a team by a number and a captain by fifty six characters.
 * Neither is a thing anybody chooses a team by. The names live on our side —
 * the team's in `teams`, the captain's in the profile behind the address that
 * founded it — and they decide nothing, which is exactly why they are allowed
 * to be written by people rather than derived from events.
 *
 * Absence is normal here and is not an error. A team whose captain never made
 * an account has no name to show, and a hackathon can run to the end that way.
 */

export interface Owner {
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
}

/** What each team called itself, keyed by the number the chain gave it. */
export async function teamNames(contractId: string): Promise<Map<number, string>> {
  const db = browserClient();

  if (db === null) {
    return new Map();
  }

  const { data } = await db
    .from("teams")
    .select("team_id, name")
    .eq("contract_id", contractId);

  return new Map(
    (data ?? []).map((row) => [
      Number((row as Record<string, unknown>)["team_id"] ?? 0),
      String((row as Record<string, unknown>)["name"] ?? ""),
    ]),
  );
}

/**
 * Who is behind each address, for the addresses that belong to somebody here.
 *
 * Two queries rather than a join, because PostgREST will not join `wallet_links`
 * to `profiles` without a declared relationship and the alternative is a view
 * that exists only to save a round trip on a list of five.
 */
export async function ownersOf(addresses: string[]): Promise<Map<string, Owner>> {
  const db = browserClient();

  if (db === null || addresses.length === 0) {
    return new Map();
  }

  const { data: links } = await db
    .from("wallet_links")
    .select("address, profile_id")
    .in("address", addresses);

  const byAddress = new Map<string, string>();

  for (const row of links ?? []) {
    const record = row as Record<string, unknown>;
    byAddress.set(String(record["address"] ?? ""), String(record["profile_id"] ?? ""));
  }

  if (byAddress.size === 0) {
    return new Map();
  }

  const { data: people } = await db
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", [...new Set(byAddress.values())]);

  const owners = new Map<string, Owner>();
  const profiles = new Map<string, Owner>();

  for (const row of people ?? []) {
    const record = row as Record<string, unknown>;
    profiles.set(String(record["id"] ?? ""), {
      displayName: text(record["display_name"]),
      username: text(record["username"]),
      avatarUrl: text(record["avatar_url"]),
    });
  }

  for (const [address, profileId] of byAddress) {
    const profile = profiles.get(profileId);
    if (profile !== undefined) owners.set(address, profile);
  }

  return owners;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * What a team is called and what its project looks like, for the podium.
 *
 * The name comes from the team and the mark from its project, which are two
 * tables because they are two facts: a team can name itself before it has
 * entered anything. Read together here because the podium wants both and asking
 * twice would be two round trips for one row apiece.
 */
export interface Mark {
  name: string | null;
  logoUrl: string | null;
}

export async function teamMarks(contractId: string): Promise<Map<number, Mark>> {
  const db = browserClient();

  if (db === null) {
    return new Map();
  }

  const [teams, projects] = await Promise.all([
    db.from("teams").select("team_id, name").eq("contract_id", contractId),
    db.from("projects").select("team_id, logo_url").eq("contract_id", contractId),
  ]);

  const marks = new Map<number, Mark>();

  for (const row of teams.data ?? []) {
    const record = row as Record<string, unknown>;

    marks.set(Number(record["team_id"] ?? 0), {
      name: text(record["name"]),
      logoUrl: null,
    });
  }

  for (const row of projects.data ?? []) {
    const record = row as Record<string, unknown>;
    const id = Number(record["team_id"] ?? 0);
    const found = marks.get(id);

    marks.set(id, {
      name: found?.name ?? null,
      logoUrl: text(record["logo_url"]),
    });
  }

  return marks;
}
