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
  /** The prize table's total, in the smallest unit. Absent if unreadable. */
  prize: bigint | null;
  /** When submissions shut, seconds since the epoch. From the frozen rules. */
  closesAt: number | null;
  /** The token the prize is paid in, from the frozen rules. */
  asset: string | null;
  logo_url: string | null;
  banner_url: string | null;
  /** Null when the organizer has not said, which is not the same as remote. */
  location: string | null;
  tags: string[];
}

export interface HackathonDetail extends HackathonSummary {
  description: string | null;
  organizer: string | null;
  constitution_hash: string | null;
  prize_asset: string | null;
  vault_id: string | null;
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
/** What a reader has narrowed the list down to. */
export interface Filter {
  /** "open", "upcoming", "finished", or nothing for all of them. */
  stage?: string | undefined;
  tag?: string | undefined;
  /** Matched against the name and the tagline. */
  q?: string | undefined;
  /** How many to read the chain for. */
  limit?: number | undefined;
}

/**
 * How many cards a page shows, and therefore how many contracts it asks about.
 *
 * The prize and the deadline are read from the chain one call per hackathon,
 * because our tables do not carry them. That is one round trip per card, so the
 * page's cost grows with the list: thirty three took two and a half seconds and
 * two hundred would take a node's patience as well as a reader's.
 *
 * Bounding it here is the fix that is available today. The one that removes the
 * problem is for the indexer to record both numbers, and until it does this
 * page is paged rather than slow.
 */
export const PAGE = 12;

export async function listHackathons(filter: Filter = {}): Promise<HackathonSummary[]> {
  if (db === null) {
    return [];
  }

  /*
    The presentation columns arrived in a later migration, and code and schema
    do not deploy at the same instant. Asking for a column that is not there
    yet fails the whole select, and the first version of this then returned an
    empty list, so a database one migration behind reported that no hackathon
    existed. A query that failed and a world with nothing in it are not the same
    answer and must never render the same.
  */
  const columns = "contract_id, slug, name, tagline, logo_url";
  const dressed = `${columns}, banner_url, location, tags`;

  const [written, chain] = await Promise.all([
    db
      .from("hackathons")
      .select(dressed)
      .order("created_at", { ascending: false })
      .then((answer) =>
        answer.error === null
          ? answer
          : db.from("hackathons").select(columns).order("created_at", { ascending: false }),
      ),
    db.from("hackathon_state").select("contract_id, phase, visibility"),
  ]);

  if (written.error !== null) {
    throw new Error(`the hackathon list could not be read: ${written.error.message}`);
  }

  const byContract = new Map((chain.data ?? []).map((row) => [String(row.contract_id), row]));

  const all = (written.data ?? []).map((row) =>
    merge(row, byContract.get(String(row.contract_id)) ?? {}),
  );

  /*
    Narrowed and ordered before the chain is asked anything, so a filtered page
    pays for the cards it shows rather than for every hackathon that exists.
  */
  const summaries = all
    .filter((hackathon) => matches(hackathon, filter))
    .sort((a, b) => standing(a) - standing(b))
    .slice(0, filter.limit ?? PAGE);

  /*
    The prize is read from the contract rather than from our tables, because we
    do not have it: the indexer records the digest and the phase, and the
    amount lives in the constitution behind them. It is also the one number
    that decides whether somebody gives up a weekend, so a card without it is a
    card nobody can act on.

    All of them at once, and a hackathon whose prize cannot be read keeps its
    card rather than losing it. A slow node should cost a number, not a row.
  */
  const rules = await Promise.all(
    summaries.map((summary) => rulesOf(summary.contract_id).catch(() => null)),
  );

  return summaries.map((summary, index) => ({
    ...summary,
    prize: rules[index]?.prize ?? null,
    closesAt: rules[index]?.closesAt ?? null,
    asset: rules[index]?.asset ?? null,
  }));
}

/** Whether one hackathon survives what the reader asked for. */
function matches(hackathon: HackathonSummary, filter: Filter): boolean {
  if (filter.stage !== undefined && filter.stage.length > 0) {
    const where = standing(hackathon);
    const wanted = { open: 0, upcoming: 1, finished: 2 }[filter.stage];

    if (wanted !== undefined && where !== wanted) {
      return false;
    }
  }

  if (filter.tag !== undefined && filter.tag.length > 0 && !hackathon.tags.includes(filter.tag)) {
    return false;
  }

  if (filter.q !== undefined && filter.q.trim().length > 0) {
    /* Name and tagline, which is what somebody types a word from. Searching the
       description as well would match a hackathon on a word buried in a
       paragraph nobody read. */
    const looking = filter.q.trim().toLowerCase();
    const inside = `${hackathon.name} ${hackathon.tagline ?? ""}`.toLowerCase();

    if (!inside.includes(looking)) {
      return false;
    }
  }

  return true;
}

/** Every tag in use, for building the filter from what actually exists. */
export async function tagsInUse(): Promise<string[]> {
  if (db === null) {
    return [];
  }

  const { data } = await db.from("hackathons").select("tags");

  const seen = new Set<string>();

  for (const row of data ?? []) {
    for (const tag of (row.tags as string[] | null) ?? []) {
      seen.add(tag);
    }
  }

  return [...seen].sort();
}

/**
 * How many match, without asking the chain about any of them.
 *
 * The first version of this counted by listing, which read a contract per row
 * and so cost exactly what the paging was introduced to avoid. Nothing in a
 * count needs a prize or a deadline.
 */
export async function countHackathons(filter: Filter = {}): Promise<number> {
  if (db === null) {
    return 0;
  }

  const [written, chain] = await Promise.all([
    db.from("hackathons").select("contract_id, name, tagline, tags"),
    db.from("hackathon_state").select("contract_id, phase"),
  ]);

  const phases = new Map(
    (chain.data ?? []).map((row) => [String(row.contract_id), Number(row.phase)]),
  );

  return (written.data ?? []).filter((row) =>
    matches(
      {
        contract_id: String(row.contract_id),
        slug: "",
        name: String(row.name),
        tagline: (row.tagline as string | null) ?? null,
        phase: phases.get(String(row.contract_id)) ?? null,
        visibility: null,
        prize: null,
        closesAt: null,
        asset: null,
        logo_url: null,
        banner_url: null,
        location: null,
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      },
      filter,
    ),
  ).length;
}

/**
 * The order a reader wants, which is not the order they were created in.
 *
 * What is running comes first, because that is the only group anybody can still
 * join. Then what has not opened yet, which is worth watching. Finished events
 * come last and are kept rather than hidden: a platform that shows only live
 * hackathons is a platform with no record, and the record is the product.
 */
function standing(hackathon: HackathonSummary): number {
  if (hackathon.phase === null) {
    return 1;
  }

  if (hackathon.phase >= 8) {
    return 2;
  }

  return hackathon.phase >= 2 ? 0 : 1;
}

/**
 * The two things a card needs from the frozen rules, in one call.
 *
 * The prize and the deadline both live in the constitution, so asking for it
 * once and taking both is a round trip rather than two, on a page that makes
 * one of these per hackathon.
 */
async function rulesOf(
  contractId: string,
): Promise<{ prize: bigint; closesAt: number; asset: string | null } | null> {
  const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
  const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

  if (rpcUrl === undefined || passphrase === undefined) {
    return null;
  }

  const [{ Account, Contract, TransactionBuilder, BASE_FEE, scValToNative }, rpc] =
    await Promise.all([
      import("@stellar/stellar-sdk/base"),
      import("@stellar/stellar-sdk/rpc"),
    ]);

  const server = new rpc.Server(rpcUrl);

  const tx = new TransactionBuilder(
    new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
    { fee: BASE_FEE, networkPassphrase: passphrase },
  )
    .addOperation(new Contract(contractId).call("constitution"))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simulated) || simulated.result === undefined) {
    return null;
  }

  const constitution = scValToNative(simulated.result.retval) as {
    prize_tiers?: unknown;
    prize_asset?: unknown;
    schedule?: { submission_closes_at?: unknown };
  };

  const tiers = Array.isArray(constitution.prize_tiers) ? constitution.prize_tiers : [];

  return {
    prize: tiers.reduce(
      (sum: bigint, tier) => sum + BigInt((tier as { amount?: bigint }).amount ?? 0),
      BigInt(0),
    ),
    closesAt: Number(constitution.schedule?.submission_closes_at ?? 0),
    asset: typeof constitution.prize_asset === "string" ? constitution.prize_asset : null,
  };
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
    prize: null,
    closesAt: null,
    asset: null,
    logo_url: (written["logo_url"] as string | null) ?? null,
    banner_url: (written["banner_url"] as string | null) ?? null,
    location: (written["location"] as string | null) ?? null,
    tags: Array.isArray(written["tags"]) ? (written["tags"] as string[]) : [],
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
