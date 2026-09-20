/**
 * Put a real, open hackathon on testnet, so the surfaces can be tried.
 *
 * Everything built this session reads the contract rather than our database,
 * which is the right call and also means none of it can be exercised without a
 * hackathon that is actually open. The one live event is stuck in Funding, so
 * this makes another and walks it all the way to Open.
 *
 * It uses a throwaway key it generates itself and funds from friendbot. Nothing
 * here touches anybody's real account, and the key is printed rather than saved
 * because it is worth exactly the testnet lumens friendbot gave it.
 *
 *   node --experimental-strip-types scripts/seed-testnet.mts
 */

import { readFileSync } from "node:fs";

import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk/base";
import { Api, Server, assembleTransaction } from "@stellar/stellar-sdk/rpc";
import { Spec } from "@stellar/stellar-sdk/contract";

const RPC = "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";

/** From `docs/deployments.md`. Both are already uploaded to testnet. */
const CORE_WASM = "bcea11748fa535ea311ca7d0548274f4828143b70f9f85294b3b6c32749c9c78";
const VAULT_WASM = "afc98888d9321be76160951ce072b52f08c7f3a6a0e29ee1ac9e3c0aa4783ffb";

/** The native lumen, wrapped as a Soroban token. */
const XLM = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

const server = new Server(RPC);
const spec = new Spec(JSON.parse(readFileSync("lib/contract-spec.json", "utf8")));

const organizer = Keypair.random();

console.log("organizer:", organizer.publicKey());
console.log("secret   :", organizer.secret(), "(throwaway)");

await friendbot(organizer.publicKey());

/** Run one transaction to completion and hand back what the contract returned. */
async function settle(build: (source: Account) => TransactionBuilder): Promise<unknown> {
  const source = await server.getAccount(organizer.publicKey());
  const built = build(source).setTimeout(180).build();
  const simulated = await server.simulateTransaction(built);

  if (Api.isSimulationError(simulated)) {
    throw new Error(simulated.error.slice(0, 300));
  }

  const prepared = assembleTransaction(built, simulated).build();
  prepared.sign(organizer);

  const sent = await server.sendTransaction(prepared);

  if (sent.status === "ERROR") {
    throw new Error(JSON.stringify(sent.errorResult).slice(0, 300));
  }

  const done = await server.pollTransaction(sent.hash, {
    attempts: 40,
    sleepStrategy: () => 1000,
  });

  if (done.status !== "SUCCESS") {
    throw new Error(`${done.status}`);
  }

  return done.returnValue === undefined ? null : scValToNative(done.returnValue);
}

async function deploy(wasmHash: string, args: xdr.ScVal[]): Promise<string> {
  const source = await server.getAccount(organizer.publicKey());
  const built = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(
      Operation.createCustomContract({
        address: Address.fromString(organizer.publicKey()),
        wasmHash: Buffer.from(wasmHash, "hex"),
        salt: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
        constructorArgs: args,
      }),
    )
    .setTimeout(180)
    .build();

  const simulated = await server.simulateTransaction(built);

  if (Api.isSimulationError(simulated)) {
    throw new Error(simulated.error.slice(0, 300));
  }

  const prepared = assembleTransaction(built, simulated).build();
  prepared.sign(organizer);

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

const core = await deploy(CORE_WASM, []);
console.log("core     :", core);

/*
  Registration opens now and the windows are short, so the event is usable the
  moment this finishes rather than at some point tomorrow.
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
  /* Every judge needs at least one track named. The contract refuses an
     empty assignment rather than reading it as "all of them". */
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
  /* Ten lumens, which friendbot's ten thousand covers with room for fees. */
  prize_tiers: [{ track: "payments", rank: 1, amount: BigInt(100_000_000) }],
  /* Nothing charged, and the seeder's own key named as the collector. A seeded
     event exists to be walked through, not to be billed for, and a rate above
     zero would make it deposit more than the ten lumens friendbot gave it. */
  platform_fee: { collector: organizer.publicKey(), bps: 0 },
  tie_break: [
    { tag: "JudgeScore", values: undefined },
    { tag: "Criterion", values: ["impact"] },
    { tag: "SubmissionOrder", values: undefined },
  ],
  discretion: {
    disqualification_threshold: 1,
    appeal_window: BigInt(hour),
    settlement: { tag: "SafetyWindow", values: [BigInt(hour)] },
    prize_claim_period: BigInt(24 * hour),
    unclaimed_refund: 0,
    no_award_refund: 0,
    cancellation_threshold: 1,
    cancellation_refund: 0,
  },
  schedule: {
    registration_opens_at: BigInt(now),
    registration_closes_at: BigInt(now + 24 * hour),
    submission_opens_at: BigInt(now),
    submission_closes_at: BigInt(now + 36 * hour),
    screening_closes_at: BigInt(now + 40 * hour),
    judging_closes_at: BigInt(now + 48 * hour),
    community_vote_opens_at: BigInt(now + 48 * hour),
    community_vote_closes_at: BigInt(now + 48 * hour),
  },
  extensions: { max_extensions_per_deadline: 1, max_total_seconds_per_deadline: BigInt(2 * hour) },
};

const createArgs = spec.funcArgsToScVals("create", {
  organizer: organizer.publicKey(),
  constitution,
});

await settle((source) =>
  new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE }).addOperation(
    new Contract(core).call("create", ...createArgs),
  ),
);
console.log("created  ✓");

const digest = await settle((source) =>
  new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE }).addOperation(
    new Contract(core).call("lock_rules"),
  ),
);
console.log("locked   ✓", Buffer.from(digest as Uint8Array).toString("hex"));

/* Deployed empty and then initialised, because the vault's `create` is an
   ordinary entry point rather than a constructor. Passing the arguments to the
   deployment fails inside the wasm with a missing value. */
const vault = await deploy(VAULT_WASM, []);
console.log("vault    :", vault);

await settle((source) =>
  new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE }).addOperation(
    new Contract(vault).call(
      "create",
      new Address(core).toScVal(),
      new Address(XLM).toScVal(),
    ),
  ),
);
console.log("vault set ✓");

await settle((source) =>
  new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE }).addOperation(
    new Contract(core).call("bind_vault", new Address(vault).toScVal()),
  ),
);
console.log("bound    ✓");

await settle((source) =>
  new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE }).addOperation(
    new Contract(vault).call(
      "deposit",
      new Address(organizer.publicKey()).toScVal(),
      nativeToScVal(BigInt(100_000_000), { type: "i128" }),
    ),
  ),
);
console.log("funded   ✓ 10 XLM");

await settle((source) =>
  new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE }).addOperation(
    new Contract(core).call("publish"),
  ),
);
console.log("published ✓");

console.log("\nopen at: /manage/" + core);

async function friendbot(address: string): Promise<void> {
  const answer = await fetch(`https://friendbot.stellar.org?addr=${address}`);

  if (!answer.ok) {
    throw new Error(`friendbot refused: ${answer.status}`);
  }

  console.log("funded   ✓ friendbot");
}
