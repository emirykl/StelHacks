/**
 * Money in and money out, once, against a real anchor.
 *
 * `anchor-check.mts` proves the client can reach an anchor and open a
 * withdrawal. It stops there because a hosted anchor will not go further
 * without a person filling in a form. A programmatic one will, and that makes
 * the whole round trip testable: lira in, asset out, asset back, lira out.
 *
 * Which matters because the last leg is the one that cannot be undone. Paying
 * the anchor's account with the wrong memo is a payment nobody can match to
 * anybody, and no amount of reading the code proves the memo was right. This
 * sends one and reads back what the anchor did with it.
 *
 * It uses the product's own `balanceOf` rather than reading the ledger a second
 * way, so what passes here is the code that will run rather than a second
 * implementation that happens to agree with it.
 *
 *   node --experimental-strip-types scripts/anchor-loop.mts [domain] [asset]
 */

import {
  Asset,
  BASE_FEE,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk/base";
import { Server } from "@stellar/stellar-sdk/rpc";

import { balanceOf } from "../lib/trustline.ts";

const domain = process.argv[2] ?? "tr-mock-anchor.fly.dev";
const code = process.argv[3] ?? "USDC";

const server = new Server("https://soroban-testnet.stellar.org");
const me = Keypair.random();

console.log("anchor:", domain);
console.log("wallet:", me.publicKey());

const toml = await (await fetch(`https://${domain}/.well-known/stellar.toml`)).text();
const read = (key: string) =>
  new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, "m").exec(toml)?.[1]?.replace(/^["']|["'].*$/g, "") ?? null;

const auth = read("WEB_AUTH_ENDPOINT")!;
const transfer = read("TRANSFER_SERVER")!;
const kyc = read("KYC_SERVER")!;

/* The issuer comes out of the anchor's own file. Naming it here would be this
   script's opinion about which asset the anchor redeems. */
const issuer = new RegExp(`code\\s*=\\s*["']${code}["'][\\s\\S]{0,400}?issuer\\s*=\\s*["']([^"']+)`).exec(
  toml,
)?.[1];

if (issuer === undefined) {
  throw new Error(`${domain} does not list ${code}`);
}

const asset = new Asset(code, issuer);

async function body(answer: Response): Promise<Record<string, string>> {
  const text = await answer.text();

  try {
    return JSON.parse(text) as Record<string, string>;
  } catch {
    throw new Error(`${answer.status}: ${text.slice(0, 160)}`);
  }
}

await fetch(`https://friendbot.stellar.org?addr=${me.publicKey()}`);

async function submit(build: (account: Awaited<ReturnType<typeof server.getAccount>>) => TransactionBuilder) {
  const tx = build(await server.getAccount(me.publicKey())).setTimeout(180).build();
  tx.sign(me);

  const sent = await server.sendTransaction(tx);

  return (await server.pollTransaction(sent.hash, { attempts: 40, sleepStrategy: () => 1000 })).status;
}

console.log(
  "1 trustline :",
  await submit((account) =>
    new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).addOperation(
      Operation.changeTrust({ asset }),
    ),
  ),
);

const challenge = await body(await fetch(`${auth}?account=${me.publicKey()}`));
const signed = TransactionBuilder.fromXDR(challenge["transaction"]!, challenge["network_passphrase"]!);

if (!("sign" in signed)) {
  throw new Error("that challenge is a fee bump");
}

signed.sign(me);

const { token } = await body(
  await fetch(auth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: signed.toXDR() }),
  }),
);

console.log("2 sep-10    :", token === undefined ? "FAILED" : "ok");

const bearer = { Authorization: `Bearer ${token}` };

await fetch(`${kyc}/customer`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", ...bearer },
  body: JSON.stringify({ account: me.publicKey() }),
});

console.log("3 sep-12    : registered");

const deposit = await body(
  await fetch(`${transfer}/deposit?asset_code=${code}&account=${me.publicKey()}&amount=200`, {
    headers: bearer,
  }),
);

console.log("4 deposit   :", deposit["id"]);

await fetch(`${transfer.replace(/\/sep6$/, "")}/sep6/tx/${deposit["id"]}/simulate-bank-transfer`, {
  method: "POST",
});

console.log("5 lira sent : simulated at the anchor's own bank");

const arrived = await until(String(deposit["id"]), ["completed"]);
console.log("6 deposit   : completed,", arrived["amount_out"], code, "in the wallet");

const held = (await balanceOf(asset.contractId(Networks.TESTNET), me.publicKey())) ?? "0";
console.log("7 balance   :", held, code);

const withdraw = await body(
  await fetch(`${transfer}/withdraw?asset_code=${code}&type=bank_account`, { headers: bearer }),
);

console.log("8 withdraw  :", withdraw["account_id"], withdraw["memo_type"], withdraw["memo"]);

console.log(
  "9 paid      :",
  await submit((account) =>
    new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({ destination: withdraw["account_id"]!, asset, amount: held }))
      .addMemo(Memo.id(withdraw["memo"]!)),
  ),
  held,
  code,
);

const done = await until(String(withdraw["id"]), ["completed", "error", "refunded"]);
console.log("10 result   :", done["status"], "| out:", done["amount_out"], "| fee:", done["amount_fee"]);
console.log("11 balance  :", (await balanceOf(asset.contractId(Networks.TESTNET), me.publicKey())) ?? "0", "left");

/** Poll one transfer until it reaches somewhere worth reporting. */
async function until(id: string, endings: string[]): Promise<Record<string, string>> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { transaction } = (await (
      await fetch(`${transfer}/transaction?id=${id}`, { headers: bearer })
    ).json()) as { transaction?: Record<string, string> };

    if (transaction !== undefined && endings.includes(transaction["status"] ?? "")) {
      return transaction;
    }

    await new Promise((wake) => setTimeout(wake, 2000));
  }

  throw new Error(`${id} never settled`);
}
