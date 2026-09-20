/**
 * Proving that a team can be joined by two people who never sign together.
 *
 * `lib/join.ts` is the only thing in this product that needs two signatures on
 * one transaction, and it cannot be exercised from a single browser: it wants a
 * captain in one wallet and a joiner in another. So the mechanism is checked
 * here instead, with two keypairs and the same calls the browser makes.
 *
 * What this proves is the part that would otherwise only be proved by a user:
 * that an authorization entry signed early, by somebody who is not the source
 * of the transaction, is still accepted when the captain submits it later. If
 * this passes, the remaining risk in the browser flow is the wallet handing
 * back a signature in a different shape, which is a smaller and louder failure.
 *
 *   node --experimental-strip-types scripts/two-signature-join.mts <core> <organizer secret>
 */

import { readFileSync } from "node:fs";

import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  authorizeEntry,
  checkAuthEntryReadiness,
  inspectAuthEntry,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk/base";
import { Operation } from "@stellar/stellar-sdk/base";
import { Api, Server, assembleTransaction } from "@stellar/stellar-sdk/rpc";

const RPC = "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";

const core = process.argv[2];
const organizerSecret = process.argv[3];

if (core === undefined || organizerSecret === undefined) {
  throw new Error("usage: two-signature-join.mts <core contract> <organizer secret>");
}

const server = new Server(RPC);
const organizer = Keypair.fromSecret(organizerSecret);
const captain = Keypair.random();
const joiner = Keypair.random();

console.log("captain:", captain.publicKey());
console.log("joiner :", joiner.publicKey());

await Promise.all([fund(captain), fund(joiner)]);

async function fund(who: Keypair): Promise<void> {
  const answer = await fetch(`https://friendbot.stellar.org?addr=${who.publicKey()}`);

  if (!answer.ok) {
    throw new Error(`friendbot refused: ${answer.status}`);
  }
}

/** One ordinary single signature call, the way every other script makes them. */
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

await call(captain, "apply", new Address(captain.publicKey()).toScVal());
await call(joiner, "apply", new Address(joiner.publicKey()).toScVal());
console.log("applied  ✓");

await call(
  organizer,
  "approve_application",
  new Address(organizer.publicKey()).toScVal(),
  new Address(captain.publicKey()).toScVal(),
);
await call(
  organizer,
  "approve_application",
  new Address(organizer.publicKey()).toScVal(),
  new Address(joiner.publicKey()).toScVal(),
);
console.log("approved ✓");

const teamId = Number(
  await call(captain, "create_team", new Address(captain.publicKey()).toScVal()),
);
console.log("team     ✓", teamId);

/*
  The joiner's half, signed while the captain is nowhere near.

  Simulated with the captain as source, not the joiner, and that is the whole
  lesson of this script. Soroban reports the source account's own authorization
  as source-account credentials, which carry no signature of their own and are
  covered by the envelope instead. Simulating as the joiner therefore produced
  nothing for the joiner to sign. Simulating as the captain gives the joiner an
  address credential, which is exactly the thing that can be signed early and
  carried.
*/
function addMember(): xdr.ScVal[] {
  return [
    nativeToScVal(teamId, { type: "u32" }),
    new Address(joiner.publicKey()).toScVal(),
  ];
}

const forSigning = await server.getAccount(captain.publicKey());
const joinerTx = new TransactionBuilder(forSigning, {
  fee: BASE_FEE,
  networkPassphrase: PASSPHRASE,
})
  .addOperation(new Contract(core).call("add_member", ...addMember()))
  .setTimeout(180)
  .build();

const joinerSim = await server.simulateTransaction(joinerTx);

if (Api.isSimulationError(joinerSim)) {
  throw new Error(`simulate for the joiner: ${joinerSim.error.slice(0, 200)}`);
}

const theirs = (joinerSim.result?.auth ?? []).find(
  (entry) => inspectAuthEntry(entry).address === joiner.publicKey(),
);

if (theirs === undefined) {
  throw new Error("the contract did not ask the joiner to authorize anything");
}

/* The captain's own, which came back as source-account credentials because the
   captain was the source of this simulation. It carries no signature and needs
   none; it is kept because a transaction that supplies its auth explicitly is
   enforced against exactly that list, and leaving the captain out of it is the
   contract being told nobody authorized their half. */
const captainEntry = (joinerSim.result?.auth ?? []).find(
  (entry) => inspectAuthEntry(entry).address === null,
);

if (captainEntry === undefined) {
  throw new Error("the captain's own authorization was not in the simulation");
}

const latest = await server.getLatestLedger();
const expiresAtLedger = latest.sequence + 17_280;

const signedEntry = await authorizeEntry(
  theirs,
  joiner,
  expiresAtLedger,
  PASSPHRASE,
  joiner.publicKey(),
);

const parked = signedEntry.toXDR("base64");
console.log("signed   ✓ joiner's entry, good until ledger", expiresAtLedger);

/* Everything above is what the browser stores in `team_requests`. Everything
   below is what the captain does when they press accept. */

const carried = xdr.SorobanAuthorizationEntry.fromXDR(parked, "base64");
const readiness = checkAuthEntryReadiness(carried, latest.sequence);

console.log("ready    ✓", JSON.stringify(readiness));

/*
  The signed entry goes on before the simulation, not after it.

  This is the second lesson and it cost a failed transaction to learn. A signed
  entry carries a nonce, the nonce is a ledger entry, and the ledger entry has
  to be in the footprint. Simulating a bare call and swapping the entry in
  afterwards produces a footprint built around the nonce simulation invented,
  while the transaction carries the nonce the joiner actually signed, and the
  network rejects the mismatch.

  Handing the entry to the simulation instead makes it plan for the nonce that
  is really there. The captain needs no entry of their own: they are the source,
  and the envelope signature is their authorization.
*/
const asCaptain = await server.getAccount(captain.publicKey());
const captainTx = new TransactionBuilder(asCaptain, {
  fee: BASE_FEE,
  networkPassphrase: PASSPHRASE,
})
  .addOperation(
    Operation.invokeContractFunction({
      contract: core,
      function: "add_member",
      args: addMember(),
      auth: [carried, captainEntry],
    }),
  )
  .setTimeout(180)
  .build();

const captainSim = await server.simulateTransaction(captainTx);

if (Api.isSimulationError(captainSim)) {
  throw new Error(`simulate as captain: ${captainSim.error.slice(0, 200)}`);
}

const prepared = assembleTransaction(captainTx, captainSim).build();

prepared.sign(captain);

const sent = await server.sendTransaction(prepared);
const done = await server.pollTransaction(sent.hash, { attempts: 40, sleepStrategy: () => 1000 });

if (done.status !== "SUCCESS") {
  throw new Error(`add_member: ${done.status}`);
}

console.log("joined   ✓");

const roster = (await call(captain, "team_by_id", nativeToScVal(teamId, { type: "u32" }))) as {
  members?: string[];
};

console.log("\nteam", teamId, "members:");
for (const member of roster.members ?? []) {
  console.log("  ", member, member === joiner.publicKey() ? "← joined by two signatures" : "");
}

if (!(roster.members ?? []).includes(joiner.publicKey())) {
  throw new Error("the joiner is not on the team");
}

console.log("\ntwo signatures, one transaction, neither signer present for the other.");
