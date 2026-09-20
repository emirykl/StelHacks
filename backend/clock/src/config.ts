import { config } from "dotenv";

config({ path: new URL("../../.env.local", import.meta.url).pathname, quiet: true });

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
  /**
   * The key that pays for the transaction, and that is all it is.
   *
   * `advance_phase` asks for no signature, so this address has no authority the
   * public does not have: it is the fee payer, not a permission. Anybody with a
   * funded account could send the same call and the contract would not be able
   * to tell the difference, which is the property that makes running this
   * service safe in the first place.
   *
   * Its own key rather than the sealer's. The sealer's address is named in the
   * constitution as the one allowed to publish a root, so it means something,
   * and an address that means something should not also be the one doing
   * errands anybody could do.
   */
  clockSecret: required("CLOCK_SECRET_KEY"),
  /**
   * How long between laps.
   *
   * This is the worst case a deadline can be late by, so it is the number that
   * decides whether the product feels automatic. It was thirty seconds, which
   * was chosen against RPC and without counting what each lap also reads from
   * Postgres: two queries, every lap, for as long as the process is up. Three
   * services lapping on that reasoning spent a free tier's whole monthly egress
   * on asking a thirty megabyte database whether anything had happened.
   *
   * Two minutes. A countdown that reaches zero can show a stale phase for that
   * long, which is the honest cost and a small one: the contract enforces the
   * deadline whatever this process does, and the manage page still offers the
   * call to anybody who does not want to wait.
   */
  everyMs: every(),
} as const;

/**
 * An empty setting is an absent one, which matters more here than it looks.
 * `CLOCK_EVERY_MS=""` is what an environment file copied from the example
 * contains, and read literally it is a zero: a loop with no wait in it,
 * hammering RPC for as long as nobody notices.
 */
function every(): number {
  const written = process.env["CLOCK_EVERY_MS"];
  const asked = written === undefined || written === "" ? Number.NaN : Number(written);

  return Number.isFinite(asked) && asked > 0 ? asked : 120_000;
}
