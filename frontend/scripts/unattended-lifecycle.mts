/**
 * One hackathon from nothing to paid, in about four minutes.
 *
 * Every surface built for this product reads the contract, so none of the later
 * ones could be looked at: the ranking, the payments, closing an event. A real
 * hackathon's deadlines are days apart, and nothing that only happens after
 * judging can be exercised against one.
 *
 * So this makes an event whose windows are seconds long and walks the whole
 * thing: create, lock, fund, publish, apply, approve, team, submit, screen,
 * judge under seal, reveal, rank, pay, close. It generates its own keys and
 * funds them from friendbot, so it needs nothing from anybody.
 *
 * What it proves is not that the contract works, which its own suite covers.
 * It proves that the frontend's readers and encoders agree with a live contract
 * at every stage, which is the part no unit test can reach.
 *
 * This variant presses nothing it does not have to. Every mechanical step is
 * left to the two services that now do them unattended — the clock moves the
 * phases, opens settlement and closes the event, and the sealer publishes the
 * root and opens every scorecard under it — so what the script performs is only
 * what a person actually performs: creating the event, letting somebody in,
 * entering, scoring, ranking and paying.
 *
 * Which makes it the one test of the handover between the two. The root can
 * only be published while the hackathon is in Judging, and the clock is what
 * moves it out, so a clock that ran a lap too early would strand the scores in
 * a service that could no longer publish them. Nothing in the contract prevents
 * that; this run is what proves the clock holds the door.
 *
 * Both services have to be running.
 *
 *   node --experimental-strip-types scripts/unattended-lifecycle.mts
 */

import { execFileSync } from "node:child_process";
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

/* The address the rules name as allowed to publish a root, which has to be the
   service's own or the seal is refused. */
const SEALER = "GDTQSU3L2UVUEFOHEGDO5FNICW2URPWNFEQVZYK46LX6ZPNCYDUNEVGC";
const SEALER_URL = process.env["SEALER_URL"] ?? "http://localhost:8787";

const server = new Server(RPC);
const spec = new Spec(JSON.parse(readFileSync("lib/contract-spec.json", "utf8")));

const organizer = Keypair.random();
const builder = Keypair.random();

console.log("organizer:", organizer.publicKey());
console.log("builder  :", builder.publicKey());

await Promise.all([fund(organizer), fund(builder)]);

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
  const done = await server.pollTransaction(sent.hash, {
    attempts: 40,
    sleepStrategy: () => 1000,
  });

  if (done.status !== "SUCCESS") {
    throw new Error(`${method}: ${done.status}`);
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
  Every window is a minute wide. `advance_phase` will not move a stage before
  its deadline has passed, so the walk below spends most of its time waiting on
  a clock rather than on the network.
*/
const now = Math.floor(Date.now() / 1000);
const minute = 60;

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
  judging_mode: { tag: "Easy", values: [SEALER] },
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
  /* Nothing charged, and the organizer's own key named as the collector. The
     fee is taken on top of the prize table rather than out of it, so any rate
     above zero would want a larger deposit than the one below. */
  platform_fee: { collector: organizer.publicKey(), bps: 0 },
  tie_break: [
    { tag: "JudgeScore", values: undefined },
    { tag: "Criterion", values: ["impact"] },
    { tag: "SubmissionOrder", values: undefined },
  ],
  discretion: {
    disqualification_threshold: 1,
    appeal_window: BigInt(minute),
    /* Immediate rather than a safety window, because a window that has to
       elapse is another minute of waiting for no extra proof. */
    settlement: { tag: "Immediate", values: undefined },
    prize_claim_period: BigInt(60 * minute),
    unclaimed_refund: 0,
    no_award_refund: 0,
    cancellation_threshold: 1,
    cancellation_refund: 0,
  },
  schedule: {
    registration_opens_at: BigInt(now),
    registration_closes_at: BigInt(now + minute),
    submission_opens_at: BigInt(now),
    submission_closes_at: BigInt(now + minute),
    screening_closes_at: BigInt(now + 2 * minute),
    judging_closes_at: BigInt(now + 3 * minute),
    community_vote_opens_at: BigInt(now + 3 * minute),
    community_vote_closes_at: BigInt(now + 3 * minute),
  },
  extensions: { max_extensions_per_deadline: 1, max_total_seconds_per_deadline: BigInt(minute) },
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

await call(
  organizer,
  vault,
  "deposit",
  new Address(organizer.publicKey()).toScVal(),
  nativeToScVal(BigInt(100_000_000), { type: "i128" }),
);
await call(organizer, core, "publish");
console.log("publish  ✓");

await call(builder, core, "apply", new Address(builder.publicKey()).toScVal());
await call(
  organizer,
  core,
  "approve_application",
  new Address(organizer.publicKey()).toScVal(),
  new Address(builder.publicKey()).toScVal(),
);
const team = Number(
  await call(builder, core, "create_team", new Address(builder.publicKey()).toScVal()),
);

await call(
  builder,
  core,
  "submit_project",
  new Address(builder.publicKey()).toScVal(),
  nativeToScVal(team, { type: "u32" }),
  nativeToScVal("payments", { type: "symbol" }),
  nativeToScVal(Buffer.alloc(32, 7), { type: "bytes" }),
  nativeToScVal("https://github.com/example/one", { type: "string" }),
);
console.log("entry    ✓ team", team);

/*
  The service asks our database what phase a hackathon is in before it will take
  a card, so the indexer has to have seen this one. It starts at the oldest
  ledger the node still holds and scans about ten thousand per pass, so a
  contract created a minute ago is a dozen passes of empty scanning away.
*/
function catchUp(): void {
  for (let pass = 0; pass < 16; pass += 1) {
    const said = execFileSync("npm", ["start", "--silent", "--", core, "--once"], {
      cwd: "../backend/indexer",
      encoding: "utf8",
    });

    /* The comma matters. "110960 ledgers behind" contains "0 ledgers behind",
       so the loose check declared victory on the first pass and left the
       service with no hackathon to find. */
    if (said.includes(", 0 ledgers behind")) {
      console.log("indexed  ✓", said.trim().split("\n").pop());
      return;
    }
  }

  throw new Error("the indexer never caught up");
}

/* Run while the clock is running down rather than before the entries, because
   catching up takes minutes and the registration window is one. */
catchUp();

await waitFor(now + minute, "submissions to close");
await reaches(3, "screening");

await waitFor(now + 2 * minute, "screening to close");
await reaches(4, "judging");

/* Again, because the service reads the phase from our database and the move
   just made is not in it yet. The cursor is at the tip by now, so this is one
   pass rather than a dozen. */
catchUp();

/*
  One scorecard, sealed as a tree of one.

  The leaf is the scorecard's XDR under the scorecard domain tag, hashed again
  under the leaf tag, exactly as `hashing.rs` does it. With a single leaf the
  root is the leaf and the inclusion proof is empty, which is what makes this a
  usable end to end check without standing the sealer up.
*/
const scorecard = {
  judge: organizer.publicKey(),
  team,
  scores: [
    { criterion: "impact", score: 90 },
    { criterion: "technical", score: 80 },
  ],
};

const [encodedScorecard] = spec.funcArgsToScVals("reveal_score", { scorecard, proof: [] });
const domain = new TextEncoder().encode("stelhacks.v1.scorecard");
const leaf = hash(
  Buffer.concat([
    Buffer.from([0x00]),
    Buffer.from(domain),
    Buffer.from(encodedScorecard!.toXDR()),
  ]),
);

/*
  The signature covers the leaf as hexadecimal text, wrapped the way SEP-53
  wraps anything signed as a message: the prefix, then the text, hashed, and
  the digest is what is signed. That is what a wallet's message signing
  interface does, so it is what the collection service verifies.

  Signing the hex directly is the plausible wrong version and it was this
  script's, from before the SDK followed the standard. The service rejects it
  as a signature that does not cover the card, which reads as a mangled
  scorecard rather than as two sides disagreeing about the envelope.
*/
const leafHex = Buffer.from(leaf).toString("hex");
const wrapped = hash(
  Buffer.concat([
    Buffer.from(new TextEncoder().encode("Stellar Signed Message:\n")),
    Buffer.from(new TextEncoder().encode(leafHex)),
  ]),
);
/* Wrapped before stringifying. Version 17 of the SDK returns a plain
   Uint8Array from `sign`, and `Uint8Array.toString("hex")` is not hex at all:
   it is the comma separated decimals, which decode to one byte and produce a
   signature the service rejects for its length rather than its contents. */
const signature = Buffer.from(organizer.sign(Buffer.from(wrapped))).toString("hex");

const taken = await fetch(`${SEALER_URL}/scorecard`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ contract: core, scorecard, signature }),
});

const receipt = await taken.json();

if (!taken.ok) {
  throw new Error(`service refused the card: ${JSON.stringify(receipt).slice(0, 200)}`);
}

console.log("receipt  ✓ from", receipt.sealer);

await waitFor(now + 3 * minute, "scoring to close");

/*
  Nothing is pressed here, and that is the whole point of this script.

  The sealer publishes the root while the event is still in Judging, the clock
  waits for that root before moving on, and the sealer opens the card once the
  reveal is entered. Three steps, two services, no person — and if the order
  ever slips, `reaches` gives up here rather than somewhere further down where
  the cause would be harder to see.
*/
await sealedOnChain();
await reaches(5, "reveal");
await scoreOnChain();

await ranked();

await reaches(7, "settlement");

const paid = await call(
  organizer,
  core,
  "settle_prize",
  nativeToScVal("payments", { type: "symbol" }),
  nativeToScVal(1, { type: "u32" }),
  new Address(builder.publicKey()).toScVal(),
);
console.log("paid     ✓", paid);

/* Zero at this rate, and still a call that has to happen: `complete` refuses an
   event whose fee has not been settled, so owing nothing is something the
   contract wants said rather than skipped. It goes out with the prizes on the
   results page, so the script sends it the same way. */
const fee = await call(organizer, core, "settle_platform_fee");
console.log("fee      ✓", fee);

await reaches(8, "closed");

console.log("\ncore :", core);
console.log("vault:", vault);

/**
 * Reads one value off the contract without sending anything.
 *
 * The getters take no arguments and change nothing, so a simulation is the
 * whole answer and no account has to pay for asking.
 */
async function read(method: string, ...args: xdr.ScVal[]): Promise<unknown> {
  const source = await server.getAccount(organizer.publicKey());
  const built = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(new Contract(core).call(method, ...args))
    .setTimeout(60)
    .build();

  const simulated = await server.simulateTransaction(built);

  if (Api.isSimulationError(simulated) || simulated.result === undefined) {
    return null;
  }

  return scValToNative(simulated.result.retval);
}

/**
 * Waits for somebody else to do something, and says who it is waiting on.
 *
 * Every use of this is a step no person performs any more, so a run that stops
 * here has found the services disagreeing about an order rather than a contract
 * refusing a call. Three minutes is six of the clock's laps: long enough that a
 * slow testnet is not mistaken for a service that is down.
 */
async function until(what: string, done: () => Promise<boolean>): Promise<void> {
  const giveUp = Date.now() + 180_000;

  console.log(`  waiting on the services for ${what}`);

  for (;;) {
    if (await done()) {
      console.log(`${what.padEnd(9)}✓ by itself`);

      return;
    }

    if (Date.now() > giveUp) {
      throw new Error(`nothing ${what} it in three minutes`);
    }

    await new Promise((wake) => setTimeout(wake, 5000));
  }
}

async function reaches(phase: number, what: string): Promise<void> {
  await until(what, async () => Number(await read("phase")) >= phase);
}

async function sealedOnChain(): Promise<void> {
  await until("sealed", async () => (await read("score_root")) !== null);
}

async function ranked(): Promise<void> {
  await until("ranked", async () => Number(await read("phase")) >= 6);
}

async function scoreOnChain(): Promise<void> {
  await until("scored", async () => {
    const tally = (await read("score_tally", nativeToScVal(team, { type: "u32" }))) as {
      count?: number;
    } | null;

    return (tally?.count ?? 0) > 0;
  });
}

async function waitFor(deadline: number, what: string): Promise<void> {
  const left = deadline - Math.floor(Date.now() / 1000) + 5;

  if (left > 0) {
    console.log(`  waiting ${left}s for ${what}`);
    await new Promise((wake) => setTimeout(wake, left * 1000));
  }
}
