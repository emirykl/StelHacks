/**
 * One team with a finished project, so the surfaces can be looked at.
 *
 * `hand-to-hackers.mts` stands an event up and stops, which is right when a
 * person is going to walk it. This is for the other case: seeing what a project
 * page, a listing row and a judge's queue look like with something real in
 * them, without waiting for a human to type a description.
 *
 * It only does the chain half. The title, the write up and the artwork are ours
 * rather than the contract's, and are written separately with the service key,
 * because this runs from a terminal with no session to sign a request with.
 *
 *   node --experimental-strip-types scripts/seed-project.mts <core> <organizer secret> <repo url> <digest hex>
 */

import { readFileSync } from "node:fs";

import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk/base";
import { Api, Server, assembleTransaction } from "@stellar/stellar-sdk/rpc";

const RPC = "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";

const core = process.argv[2];
const organizerSecret = process.argv[3];
const repo = process.argv[4];
const digest = process.argv[5];

if (
  core === undefined ||
  organizerSecret === undefined ||
  repo === undefined ||
  digest === undefined
) {
  throw new Error("usage: seed-project.mts <core> <organizer secret> <repo url> <digest hex>");
}

const server = new Server(RPC);
const organizer = Keypair.fromSecret(organizerSecret);
const builder = Keypair.random();

console.log("builder :", builder.publicKey());
console.log("secret  :", builder.secret());

const answer = await fetch(`https://friendbot.stellar.org?addr=${builder.publicKey()}`);

if (!answer.ok) {
  throw new Error(`friendbot refused: ${answer.status}`);
}

async function call(who: Keypair, method: string, ...args: xdr.ScVal[]): Promise<unknown> {
  const source = await server.getAccount(who.publicKey());
  const built = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(new Contract(core!).call(method, ...args))
    .setTimeout(180)
    .build();

  const simulated = await server.simulateTransaction(built);

  if (Api.isSimulationError(simulated)) {
    throw new Error(`${method}: ${simulated.error.slice(0, 200)}`);
  }

  const prepared = assembleTransaction(built, simulated).build();
  prepared.sign(who);

  const sent = await server.sendTransaction(prepared);
  const done = await server.pollTransaction(sent.hash, { attempts: 40, sleepStrategy: () => 1000 });

  if (done.status !== "SUCCESS") {
    throw new Error(`${method}: ${done.status}`);
  }

  return done.returnValue === undefined ? null : scValToNative(done.returnValue);
}

await call(builder, "apply", new Address(builder.publicKey()).toScVal());
console.log("applied  ✓");

await call(
  organizer,
  "approve_application",
  new Address(organizer.publicKey()).toScVal(),
  new Address(builder.publicKey()).toScVal(),
);
console.log("approved ✓");

const team = Number(await call(builder, "create_team", new Address(builder.publicKey()).toScVal()));
console.log("team     ✓", team);

/* The track comes from the frozen rules rather than being named here, so this
   keeps working against an event whose categories were written by somebody
   else. */
const constitution = (await read("constitution")) as { tracks?: { id?: string }[] };
const track = constitution.tracks?.[0]?.id;

if (track === undefined) {
  throw new Error("the rules name no track to submit into");
}

async function read(method: string): Promise<unknown> {
  const { Account } = await import("@stellar/stellar-sdk/base");
  const nobody = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");

  const tx = new TransactionBuilder(nobody, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(new Contract(core!).call(method))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);

  if (Api.isSimulationError(simulated) || simulated.result === undefined) {
    throw new Error(`${method}: unreadable`);
  }

  return scValToNative(simulated.result.retval);
}

await call(
  builder,
  "submit_project",
  new Address(builder.publicKey()).toScVal(),
  nativeToScVal(team, { type: "u32" }),
  nativeToScVal(track, { type: "symbol" }),
  nativeToScVal(Buffer.from(digest, "hex"), { type: "bytes" }),
  nativeToScVal(repo, { type: "string" }),
);

console.log("submitted ✓ in", track);
console.log("\nteam:", team);
console.log("builder:", builder.publicKey());
