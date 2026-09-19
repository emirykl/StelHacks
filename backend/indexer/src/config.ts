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
  /** How long to wait when there was nothing new. */
  idleMs: 5_000,
} as const;
