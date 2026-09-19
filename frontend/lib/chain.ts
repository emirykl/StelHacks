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
export async function listHackathons(): Promise<HackathonSummary[]> {
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

  const summaries = (written.data ?? []).map((row) =>
    merge(row, byContract.get(String(row.contract_id)) ?? {}),
  );

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

  return summaries
    .map((summary, index) => ({
      ...summary,
      prize: rules[index]?.prize ?? null,
      closesAt: rules[index]?.closesAt ?? null,
    }))
    .sort((a, b) => standing(a) - standing(b));
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
): Promise<{ prize: bigint; closesAt: number } | null> {
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
    schedule?: { submission_closes_at?: unknown };
  };

  const tiers = Array.isArray(constitution.prize_tiers) ? constitution.prize_tiers : [];

  return {
    prize: tiers.reduce(
      (sum: bigint, tier) => sum + BigInt((tier as { amount?: bigint }).amount ?? 0),
      BigInt(0),
    ),
    closesAt: Number(constitution.schedule?.submission_closes_at ?? 0),
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
