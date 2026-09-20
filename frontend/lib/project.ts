import { serverClient } from "./supabase/server";

/**
 * One project, as the two halves that make it up.
 *
 * The chain holds what decides an outcome: which team entered, in which track,
 * the digest of what they said and the link they pinned. Everything a reader
 * actually looks at — the title, the write up, the artwork — is ours, and none
 * of it is allowed to change the first half.
 *
 * Read together and returned as one object, because a page that showed a
 * description without the digest it belongs to would be showing a claim with
 * the evidence left off.
 */

export interface Project {
  contractId: string;
  teamId: number;
  title: string;
  summary: string | null;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  pitchDeckUrl: string | null;
  repositoryUrl: string | null;
  liveUrl: string | null;
  demoVideoUrl: string | null;
  /** A contract the team deployed, when they deployed one. Theirs, not ours. */
  contractAddress: string | null;
  /** What the team called itself, when it said. */
  teamName: string | null;
}

export interface Member {
  address: string;
  /** Whoever founded the team holds no extra claim, but the page says who did. */
  captain: boolean;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
}

const COLUMNS =
  "contract_id, team_id, title, summary, description, logo_url, banner_url, pitch_deck_url, repository_url, live_url, demo_video_url";

/*
  The newest column, asked for separately and dropped separately.

  Code and schema do not deploy at the same instant, and PostgREST fails the
  whole select over one column it does not have: a project page would lose its
  description, its artwork and its deck to prove that `contract_address` had not
  been migrated yet. So it is asked for on top, and its absence costs only
  itself. The profile page learned this first and this is the same shape.
*/
const AND_CONTRACT = `${COLUMNS}, contract_address`;

/**
 * What was written about a project, or nothing when nobody wrote anything.
 *
 * A team can enter without ever opening the description form: the contract took
 * their digest and their link and that is a complete entry. So absence here is
 * ordinary, and the page it feeds says what the chain holds rather than
 * pretending the project does not exist.
 */
export async function projectOf(contractId: string, teamId: number): Promise<Project | null> {
  const db = await serverClient();

  if (db === null) {
    return null;
  }

  const [written, team] = await Promise.all([
    db
      .from("projects")
      .select(AND_CONTRACT)
      .eq("contract_id", contractId)
      .eq("team_id", teamId)
      .maybeSingle()
      .then((answer) =>
        answer.error === null
          ? answer.data
          : db
              .from("projects")
              .select(COLUMNS)
              .eq("contract_id", contractId)
              .eq("team_id", teamId)
              .maybeSingle()
              /* Both asks failed, so this really is a row that is not there or a
                 database that cannot be reached. Read as "nothing written"
                 rather than allowed to take the page down. */
              .then((again) => (again.error === null ? again.data : null)),
      ),
    db
      .from("teams")
      .select("name")
      .eq("contract_id", contractId)
      .eq("team_id", teamId)
      .maybeSingle()
      .then((answer) => answer.data),
  ]);

  const teamName = text((team as Record<string, unknown> | null)?.["name"]);

  if (written === null || written === undefined) {
    return teamName === null
      ? null
      : {
          contractId,
          teamId,
          title: teamName,
          summary: null,
          description: null,
          logoUrl: null,
          bannerUrl: null,
          pitchDeckUrl: null,
          repositoryUrl: null,
          liveUrl: null,
          demoVideoUrl: null,
          contractAddress: null,
          teamName,
        };
  }

  const row = written as Record<string, unknown>;

  return {
    contractId,
    teamId,
    title: String(row["title"] ?? teamName ?? `Team ${teamId}`),
    summary: text(row["summary"]),
    description: text(row["description"]),
    logoUrl: text(row["logo_url"]),
    bannerUrl: text(row["banner_url"]),
    pitchDeckUrl: text(row["pitch_deck_url"]),
    repositoryUrl: text(row["repository_url"]),
    liveUrl: text(row["live_url"]),
    demoVideoUrl: text(row["demo_video_url"]),
    contractAddress: text(row["contract_address"]),
    teamName,
  };
}

/**
 * Who is on the team, with names where the addresses lead to somebody.
 *
 * The roster comes from the caller, which read it off the contract. Names are
 * looked up here and are allowed to be missing: an address that never signed
 * into this product is still a member of the team that entered.
 */
export async function membersOf(addresses: string[], captain: string): Promise<Member[]> {
  const db = await serverClient();
  const blank = addresses.map((address) => ({
    address,
    captain: address === captain,
    displayName: null,
    username: null,
    avatarUrl: null,
  }));

  if (db === null || addresses.length === 0) {
    return blank;
  }

  const { data: links } = await db
    .from("wallet_links")
    .select("address, profile_id")
    .in("address", addresses);

  const byProfile = new Map<string, string>();

  for (const row of links ?? []) {
    const record = row as Record<string, unknown>;
    byProfile.set(String(record["profile_id"] ?? ""), String(record["address"] ?? ""));
  }

  if (byProfile.size === 0) {
    return blank;
  }

  const { data: people } = await db
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", [...byProfile.keys()]);

  const named = new Map<string, Omit<Member, "address" | "captain">>();

  for (const row of people ?? []) {
    const record = row as Record<string, unknown>;
    const address = byProfile.get(String(record["id"] ?? ""));

    if (address !== undefined) {
      named.set(address, {
        displayName: text(record["display_name"]),
        username: text(record["username"]),
        avatarUrl: text(record["avatar_url"]),
      });
    }
  }

  return addresses.map((address) => ({
    address,
    captain: address === captain,
    displayName: named.get(address)?.displayName ?? null,
    username: named.get(address)?.username ?? null,
    avatarUrl: named.get(address)?.avatarUrl ?? null,
  }));
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Everything written about every project in one event, for the gallery.
 *
 * `projectOf` answers about one team and the listing needs all of them, so
 * asking it in a loop would be one round trip per card and two selects inside
 * each. This is the same two selects for the whole event.
 *
 * A team with no row is not in the map. The caller draws it from what the chain
 * pinned, which is a complete entry on its own: entering does not require ever
 * opening the description form.
 */
export type Card = Pick<
  Project,
  | "teamId"
  | "teamName"
  | "title"
  | "summary"
  | "logoUrl"
  | "bannerUrl"
  | "repositoryUrl"
  | "liveUrl"
  | "demoVideoUrl"
  | "contractAddress"
>;

export async function cardsOf(contractId: string): Promise<Record<number, Card>> {
  const db = await serverClient();

  if (db === null) {
    return {};
  }

  const [written, teams] = await Promise.all([
    db
      .from("projects")
      .select(AND_CONTRACT)
      .eq("contract_id", contractId)
      .then((answer) =>
        answer.error === null
          ? (answer.data ?? [])
          : db
              .from("projects")
              .select(COLUMNS)
              .eq("contract_id", contractId)
              /* Read as "nothing written" rather than allowed to take the
                 gallery down, for the reason `projectOf` gives. */
              .then((again) => (again.error === null ? (again.data ?? []) : [])),
      ),
    db
      .from("teams")
      .select("team_id, name")
      .eq("contract_id", contractId)
      .then((answer) => answer.data ?? []),
  ]);

  const named = new Map<number, string>();

  for (const row of teams as Record<string, unknown>[]) {
    const name = text(row["name"]);

    if (name !== null) {
      named.set(Number(row["team_id"]), name);
    }
  }

  const cards: Record<number, Card> = {};

  /* Teams first, so a team that named itself and wrote nothing else still gets
     a card with its name on it. The project row overwrites where it has one. */
  for (const [teamId, name] of named) {
    cards[teamId] = {
      teamId,
      teamName: name,
      title: name,
      summary: null,
      logoUrl: null,
      bannerUrl: null,
      repositoryUrl: null,
      liveUrl: null,
      demoVideoUrl: null,
      contractAddress: null,
    };
  }

  for (const row of written as Record<string, unknown>[]) {
    const teamId = Number(row["team_id"]);

    cards[teamId] = {
      teamId,
      teamName: named.get(teamId) ?? null,
      title: String(row["title"] ?? named.get(teamId) ?? `Team ${teamId}`),
      summary: text(row["summary"]),
      logoUrl: text(row["logo_url"]),
      bannerUrl: text(row["banner_url"]),
      repositoryUrl: text(row["repository_url"]),
      liveUrl: text(row["live_url"]),
      demoVideoUrl: text(row["demo_video_url"]),
      contractAddress: text(row["contract_address"]),
    };
  }

  return cards;
}
