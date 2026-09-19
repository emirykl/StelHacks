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
   * The key that signs receipts and publishes the root.
   *
   * One key for both on purpose. The constitution names the address allowed to
   * publish a root, so a receipt signed by that same address is a promise made
   * by exactly the party the rules already identified, rather than by some
   * service nobody agreed to.
   */
  sealerSecret: required("SEALER_SECRET_KEY"),
  port: Number(process.env["SEALER_PORT"] ?? 8787),
  /**
   * The one page allowed to reach this service from a browser.
   *
   * A judge scores in a browser, so the service has to answer a cross origin
   * request or the card never leaves the page. Named rather than opened to
   * everything: `/seal` takes no signature and publishes a root, and while
   * anybody with a terminal can already call it, there is no reason to let an
   * unrelated site do it through a visitor's browser as well.
   */
  allowedOrigin: process.env["SEALER_ALLOWED_ORIGIN"] ?? "http://localhost:3000",
} as const;
