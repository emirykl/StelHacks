import { createClient } from "@supabase/supabase-js";

/**
 * Reading a hackathon, the way an observer reads one.
 *
 * Everything here uses the anonymous key and nothing else, because every page
 * built on it has to work for somebody with no account. If a query needs a
 * session to return a row, that row does not belong on an observer surface.
 *
 * What comes back is what the indexer wrote from the chain. The page never
 * treats it as the authority: a digest shown here is shown so a reader can
 * compare it against the contract themselves, which is what the proof strip is
 * for.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * The database, or nothing.
 *
 * A missing key is not a crash. The frontend is built and previewed long before
 * a project is wired up, and a landing page that will not render because an
 * environment variable is absent is a worse failure than a listing that says it
 * has nothing to show.
 */
export const db =
  url === undefined || key === undefined
    ? null
    : createClient(url, key, { auth: { persistSession: false } });

export interface HackathonSummary {
  contract_id: string;
  slug: string;
  name: string;
  tagline: string | null;
  phase: number | null;
  visibility: number | null;
}

export interface HackathonDetail extends HackathonSummary {
  description: string | null;
  organizer: string | null;
  constitution_hash: string | null;
  prize_asset: string | null;
  vault_id: string | null;
}

/** The phases, numbered as the contract numbers them. */
export const PHASES = [
  "Draft",
  "Funding",
  "Open",
  "Screening",
  "Judging",
  "Reveal",
  "Finalization",
  "Settlement",
  "Completed",
  "Cancelled",
] as const;

export function phaseName(phase: number | null): string {
  return phase === null ? "Not published yet" : (PHASES[phase] ?? "Unknown");
}

/**
 * The two halves of a hackathon, fetched separately and joined here.
 *
 * There is no foreign key between `hackathons` and `hackathon_state`, and there
 * must not be. The indexer has to be able to record what the chain says about
 * an event nobody has typed a name for yet: the contract comes first and
 * acquires a description second. A foreign key would invert that and make the
 * chain wait for the copy.
 *
 * The cost is this: PostgREST will not join tables it has no relationship for,
 * so the join happens in code. Two round trips rather than one, in exchange for
 * a schema that does not lie about which side is the authority.
 */
export async function listHackathons(): Promise<HackathonSummary[]> {
  if (db === null) {
    return [];
  }

  const [written, chain] = await Promise.all([
    db.from("hackathons").select("contract_id, slug, name, tagline").order("created_at", {
      ascending: false,
    }),
    db.from("hackathon_state").select("contract_id, phase, visibility"),
  ]);

  const byContract = new Map((chain.data ?? []).map((row) => [String(row.contract_id), row]));

  return (written.data ?? []).map((row) =>
    merge(row, byContract.get(String(row.contract_id)) ?? {}),
  );
}

export async function findHackathon(slug: string): Promise<HackathonDetail | null> {
  if (db === null) {
    return null;
  }

  const { data } = await db
    .from("hackathons")
    .select("contract_id, slug, name, tagline, description")
    .eq("slug", slug)
    .maybeSingle();

  if (data === null) {
    return null;
  }

  const { data: chain } = await db
    .from("hackathon_state")
    .select("phase, visibility, organizer, constitution_hash, prize_asset, vault_id")
    .eq("contract_id", data.contract_id)
    .maybeSingle();

  return merge(data, chain ?? {});
}

/**
 * What somebody wrote, and what the chain says, as one object.
 *
 * A hackathon the indexer has not reached has no chain half at all, and every
 * field from it reads as absent rather than as a default. A page showing a
 * phase nobody published would be inventing one.
 */
function merge(
  written: Record<string, unknown>,
  chain: Record<string, unknown>,
): HackathonDetail {
  return {
    contract_id: String(written["contract_id"]),
    slug: String(written["slug"]),
    name: String(written["name"]),
    tagline: (written["tagline"] as string | null) ?? null,
    description: (written["description"] as string | null) ?? null,
    phase: chain["phase"] === undefined ? null : Number(chain["phase"]),
    visibility: chain["visibility"] === undefined ? null : Number(chain["visibility"]),
    organizer: (chain["organizer"] as string | null) ?? null,
    constitution_hash: hex(chain["constitution_hash"]),
    prize_asset: (chain["prize_asset"] as string | null) ?? null,
    vault_id: (chain["vault_id"] as string | null) ?? null,
  };
}

/** Postgres hands back `\x…`; a reader comparing a digest wants the digits. */
function hex(value: unknown): string | null {
  return typeof value === "string" ? value.replace(/^\\x/, "") : null;
}
