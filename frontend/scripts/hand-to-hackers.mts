/**
 * An open hackathon, run by somebody else, for a person to join by hand.
 *
 * The other scripts here drive every role themselves, which is what makes them
 * useful as checks and useless as rehearsals: nothing in them ever waits for a
 * human to decide anything. This one stands the event up and stops, so the
 * signing up, the team and the project come from a real wallet in a real
 * browser.
 *
 * The organizer is a key this script generates and keeps, deliberately. A
 * participant flow tested from the organizer's own wallet is not the flow
 * anybody will use.
 *
 *   node --experimental-strip-types scripts/hand-to-hackers.mts
 */

import { readFileSync } from "node:fs";

import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  TransactionBuilder,
  hash,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk/base";
import { Api, Server, assembleTransaction } from "@stellar/stellar-sdk/rpc";
import { Spec } from "@stellar/stellar-sdk/contract";

const RPC = "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";
const CORE_WASM = "bcea11748fa535ea311ca7d0548274f4828143b70f9f85294b3b6c32749c9c78";
const VAULT_WASM = "afc98888d9321be76160951ce072b52f08c7f3a6a0e29ee1ac9e3c0aa4783ffb";
const XLM = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
/** Where this deployment sends its cut, from `frontend/.env.local`. */
const COLLECTOR = "GD6VIYOQ6XZRAKQDOI2SSPD7VVJCB6U2G67NIYDMWNTFQQVVVM5RWZKF";

/**
 * How many hours registration stays open, from the command line.
 *
 * Six is enough to walk the flow once and short enough that a forgotten event
 * closes itself. It is an argument because the length is the whole reason to
 * run this again: a window that expires halfway through a demonstration is the
 * failure this script exists to avoid.
 *
 *   node --experimental-strip-types scripts/hand-to-hackers.mts 48
 */
const OPEN_FOR = Number(process.argv[2] ?? 6);

if (!Number.isFinite(OPEN_FOR) || OPEN_FOR <= 0) {
  throw new Error("hours must be a positive number");
}

const server = new Server(RPC);
const spec = new Spec(JSON.parse(readFileSync("lib/contract-spec.json", "utf8")));

const organizer = Keypair.random();

console.log("organizer:", organizer.publicKey());

await fund(organizer);

async function fund(who: Keypair): Promise<void> {
  const answer = await fetch(`https://friendbot.stellar.org?addr=${who.publicKey()}`);

  if (!answer.ok) {
    throw new Error(`friendbot refused ${who.publicKey()}: ${answer.status}`);
  }
}

async function call(
  who: Keypair,
  contractId: string,
  method: string,
  ...args: xdr.ScVal[]
): Promise<unknown> {
  const source = await server.getAccount(who.publicKey());
  const built = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(180)
    .build();

  const simulated = await server.simulateTransaction(built);

  if (Api.isSimulationError(simulated)) {
    throw new Error(`${method}: ${simulated.error.slice(0, 200)}`);
  }

  const prepared = assembleTransaction(built, simulated).build();
  prepared.sign(who);

  const sent = await server.sendTransaction(prepared);

  /* The poll is retried because a dropped connection is not an answer. Testnet's
     RPC refuses one request now and then, and letting that throw abandons a walk
     that is minutes long and already has a submitted transaction on chain. The
     transaction is identified by hash, so asking again is safe: a resent poll
     reads the same ledger entry rather than doing anything twice. */
  let done: Awaited<ReturnType<typeof server.pollTransaction>> | null = null;

  for (let attempt = 0; attempt < 3 && done === null; attempt += 1) {
    try {
      done = await server.pollTransaction(sent.hash, {
        attempts: 40,
        sleepStrategy: () => 1000,
      });
    } catch (whatever) {
      if (attempt === 2) {
        throw whatever;
      }

      console.log(`  ${method}: poll failed, asking again`);
      await new Promise((wake) => setTimeout(wake, 3000));
    }
  }

  if (done === null || done.status !== "SUCCESS") {
    throw new Error(`${method}: ${done === null ? "no answer" : done.status}`);
  }

  return done.returnValue === undefined ? null : scValToNative(done.returnValue);
}

async function deploy(who: Keypair, wasmHash: string): Promise<string> {
  const source = await server.getAccount(who.publicKey());
  const built = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(
      Operation.createCustomContract({
        address: Address.fromString(who.publicKey()),
        wasmHash: Buffer.from(wasmHash, "hex"),
        salt: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
        constructorArgs: [],
      }),
    )
    .setTimeout(180)
    .build();

  const simulated = await server.simulateTransaction(built);

  if (Api.isSimulationError(simulated)) {
    throw new Error(simulated.error.slice(0, 200));
  }

  const prepared = assembleTransaction(built, simulated).build();
  prepared.sign(who);

  const sent = await server.sendTransaction(prepared);
  const done = await server.pollTransaction(sent.hash, {
    attempts: 40,
    sleepStrategy: () => 1000,
  });

  if (done.status !== "SUCCESS" || done.returnValue === undefined) {
    throw new Error(`deploy ${done.status}`);
  }

  return Address.fromScVal(done.returnValue as never).toString();
}

const core = await deploy(organizer, CORE_WASM);
console.log("core     :", core);

/*
  Windows measured in hours, because a person is going to walk this one.

  The lifecycle scripts use minutes so a machine can run the whole thing in four
  of them. Here the point is the opposite: somebody signs up, forms a team and
  submits a project at human speed, and a registration window that shuts while
  they are reading the page would be the script testing its own impatience.
*/
const now = Math.floor(Date.now() / 1000);
const hour = 3_600;

const constitution = {
  version: 4,
  metadata_hash: Buffer.alloc(32),
  prize_asset: XLM,
  tracks: [
    {
      id: "payments",
      criteria: [
        { id: "impact", weight_bps: 6_000 },
        { id: "technical", weight_bps: 4_000 },
      ],
      no_award_allowed: false,
    },
  ],
  judges: [{ judge: organizer.publicKey(), tracks: ["payments"] }],
  judge_quorum: 1,
  judging_mode: { tag: "Easy", values: [organizer.publicKey()] },
  vote: { judge_bps: 10_000, community_bps: 0 },
  visibility: 0,
  submission_requirements: {
    repository: 2,
    demo_video: 1,
    live_url: 1,
    pitch_deck: 1,
    deployed_contract: 1,
  },
  /* Reviewed, which is what these scripts drive: they approve their own
     applicant a line later and that is the path worth exercising. */
  registration: 0,
  teams: { max_size: 5, multi_team_allowed: false },
  prize_tiers: [{ track: "payments", rank: 1, amount: BigInt(100_000_000) }],
  /* Five percent, to the collector this deployment is configured with, so the
     fee is a payment somebody can watch land rather than a zero that proves
     only that the call succeeded. */
  platform_fee: { collector: COLLECTOR, bps: 500 },
  tie_break: [
    { tag: "JudgeScore", values: undefined },
    { tag: "Criterion", values: ["impact"] },
    { tag: "SubmissionOrder", values: undefined },
  ],
  discretion: {
    disqualification_threshold: 1,
    appeal_window: BigInt(hour),
    /* Immediate rather than a safety window, because a window that has to
       elapse is another minute of waiting for no extra proof. */
    settlement: { tag: "Immediate", values: undefined },
    prize_claim_period: BigInt(720 * hour),
    unclaimed_refund: 0,
    no_award_refund: 0,
    cancellation_threshold: 1,
    cancellation_refund: 0,
  },
  schedule: {
    registration_opens_at: BigInt(now),
    registration_closes_at: BigInt(now + OPEN_FOR * hour),
    submission_opens_at: BigInt(now),
    submission_closes_at: BigInt(now + (OPEN_FOR + 2) * hour),
    screening_closes_at: BigInt(now + (OPEN_FOR + 3) * hour),
    judging_closes_at: BigInt(now + (OPEN_FOR + 4) * hour),
    community_vote_opens_at: BigInt(now + (OPEN_FOR + 4) * hour),
    community_vote_closes_at: BigInt(now + (OPEN_FOR + 4) * hour),
  },
  extensions: { max_extensions_per_deadline: 1, max_total_seconds_per_deadline: BigInt(hour) },
};

await call(
  organizer,
  core,
  "create",
  ...spec.funcArgsToScVals("create", { organizer: organizer.publicKey(), constitution }),
);
console.log("create   ✓");

await call(organizer, core, "lock_rules");
console.log("lock     ✓");

const vault = await deploy(organizer, VAULT_WASM);
await call(organizer, vault, "create", new Address(core).toScVal(), new Address(XLM).toScVal());
await call(organizer, core, "bind_vault", new Address(vault).toScVal());
console.log("vault    ✓", vault);

/* The fee rides on top of the prize table, so the deposit is no longer the
   table's total. Asking the contract rather than adding it up here keeps the
   two from disagreeing about rounding. */
const owed = (await call(organizer, core, "required_funding")) as bigint;
console.log("owed     :", owed);

await call(
  organizer,
  vault,
  "deposit",
  new Address(organizer.publicKey()).toScVal(),
  nativeToScVal(owed, { type: "i128" }),
);
await call(organizer, core, "publish");
console.log("publish  ✓");


console.log("\nopen, and waiting for people.");
console.log("  core     : " + core);
console.log("  vault    : " + vault);
console.log("  organizer: " + organizer.publicKey());
console.log("  secret   : " + organizer.secret());
