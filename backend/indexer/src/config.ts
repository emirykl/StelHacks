import { config } from "dotenv";

config({ path: new URL("../../.env.local", import.meta.url).pathname, quiet: true });

/**
 * Everything the indexer needs from its environment, checked once at startup.
 *
 * A background job that discovers a missing variable an hour in, halfway
 * through a ledger range, is a job that leaves the database in a state nobody
 * asked for. Failing at the first line is the cheaper failure.
 */
function required(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === "") {
    throw new Error(`${name} is not set. See backend/.env.example.`);
  }

  return value;
}

export const settings = {
  supabaseUrl: required("SUPABASE_URL"),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  rpcUrl: required("STELLAR_RPC_URL"),
  networkPassphrase: required("STELLAR_NETWORK_PASSPHRASE"),
  /** How many ledgers to ask for at once. */
  pageSize: 100,
  /**
   * How long to wait when there was nothing new.
   *
   * This is the single largest thing this service costs. Every lap is at least
   * two round trips to Supabase — the hackathons to follow, then a cursor each
   * — and none of them carry more than a few hundred bytes, so what the bill
   * measures is the number of laps rather than anything that was read. At five
   * seconds that is seventeen thousand laps a day against a database holding
   * thirty megabytes, which spent a free tier's whole monthly egress on
   * answering "anything yet?".
   *
   * A minute instead. What it costs is that a page can be a minute behind the
   * chain, and nothing depends on it being closer: the deadlines are enforced
   * by the contract, and the clock reads the same phase this writes.
   */
  idleMs: number(process.env["INDEXER_IDLE_MS"], 60_000),
  /**
   * How long the list of hackathons to follow is trusted before re-reading it.
   *
   * It used to be read every lap, so a new hackathon was picked up within one.
   * At a minute a lap that is no longer worth a round trip each time: five
   * minutes late to notice an event created while this is running is invisible
   * to everybody, because the indexer then walks its whole history anyway.
   */
  watchedForMs: number(process.env["INDEXER_WATCHED_FOR_MS"], 300_000),
} as const;

/** A positive whole number of milliseconds, or the default when unset. */
function number(written: string | undefined, fallback: number): number {
  const asked = written === undefined || written === "" ? Number.NaN : Number(written);

  return Number.isFinite(asked) && asked > 0 ? asked : fallback;
}
