/**
 * Prove the withdrawal path against a real anchor, before any of it is wired
 * into a page.
 *
 * The client half of SEP-24 is four exchanges and every one of them can fail in
 * a way the next one hides. Running it here, with a keypair this script owns,
 * says which one broke without a browser, a wallet extension or a person in the
 * loop.
 *
 *   node --experimental-strip-types scripts/anchor-check.mts <domain> [asset]
 */

import { Keypair, TransactionBuilder, Transaction } from "@stellar/stellar-sdk/base";

const domain = process.argv[2] ?? "testanchor.stellar.org";
const asset = process.argv[3] ?? "USDC";
const PASSPHRASE = "Test SDF Network ; September 2015";

const me = Keypair.random();
console.log("anchor  :", domain);
console.log("account :", me.publicKey());

const toml = await (await fetch(`https://${domain}/.well-known/stellar.toml`)).text();
const read = (key: string) =>
  new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, "m").exec(toml)?.[1]?.replace(/^["']|["'].*$/g, "") ?? null;

const auth = read("WEB_AUTH_ENDPOINT")!;
const transfer = read("TRANSFER_SERVER_SEP0024")!;
const signingKey = read("SIGNING_KEY")!;

console.log("\n1 toml   ✓", { auth, transfer, signingKey: signingKey.slice(0, 8) + "…" });

/* Funded, because SEP-10 checks the account exists on some anchors and the
   withdrawal needs somewhere for the asset to sit either way. */
const funded = await fetch(`https://friendbot.stellar.org?addr=${me.publicKey()}`);
console.log("2 funded ", funded.ok ? "✓" : `✗ ${funded.status}`);

const challenge = await (await fetch(`${auth}?account=${me.publicKey()}`)).json();
const tx = TransactionBuilder.fromXDR(challenge.transaction, challenge.network_passphrase ?? PASSPHRASE);

if (!(tx instanceof Transaction)) {
  throw new Error("fee bump, which SEP-10 does not use");
}

const signedBy = tx.signatures.some((entry) => {
  try {
    const encoded = Buffer.from((entry as unknown as { signature: { toXDR(): Uint8Array } }).signature.toXDR());
    const bytes = encoded.subarray(4, 4 + encoded.readUInt32BE(0));

    return Keypair.fromPublicKey(signingKey).verify(tx.hash(), bytes);
  } catch {
    return false;
  }
});

const first = tx.operations[0];
console.log("3 checked", {
  sequence: tx.sequence,
  signedByAnchor: signedBy,
  namesMe: first?.source === me.publicKey(),
  operation: first?.type,
});

if (!signedBy || tx.sequence !== "0" || first?.source !== me.publicKey()) {
  throw new Error("that challenge would not have been safe to sign");
}

tx.sign(me);

const answered = await fetch(auth, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ transaction: tx.toXDR() }),
});

const { token, error } = await answered.json();
console.log("4 token  ", token ? "✓ " + token.slice(0, 24) + "…" : `✗ ${error ?? answered.status}`);

if (!token) {
  process.exit(1);
}

const info = await (await fetch(`${transfer}/info`)).json();
console.log("5 info   ✓ withdraw:", JSON.stringify(info.withdraw?.[asset] ?? info.withdraw));

const started = await fetch(`${transfer}/transactions/withdraw/interactive`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ asset_code: asset, account: me.publicKey(), lang: "en" }),
});

const opened = await started.json();
console.log("6 started", started.ok ? "✓" : `✗ ${started.status}`, JSON.stringify(opened).slice(0, 300));

if (!opened.id) {
  process.exit(1);
}

const status = await (await fetch(`${transfer}/transaction?id=${opened.id}`, {
  headers: { Authorization: `Bearer ${token}` },
})).json();

console.log("7 status ✓", status.transaction?.status, "| kind:", status.transaction?.kind);
console.log("\ninteractive url:", opened.url);
