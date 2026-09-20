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
 *   node --experimental-strip-types scripts/full-lifecycle.mts
 */

import { readFileSync } from "node:fs";

import {
  Address,
  Asset,
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

/*
  Which asset the prize is paid in, and the reason this is an argument.

  A prize in lumens is a prize somebody holds. A prize in the asset an anchor
  redeems is a prize somebody can spend, and that is the half of the product the
  cash out panel exists for — but the panel cannot be looked at against an event
  paying in lumens, because it does not draw for an asset the anchor has never
  heard of. So the same walk runs in either, and which one is a word on the
  command line.

  Anything other than lumens has to be sourced, and there is exactly one place
  to source it: the anchor itself, through the deposit half of its own ramp.
  Friendbot does not issue anybody else's asset.

    node --experimental-strip-types scripts/park-at-settlement.mts [XLM|USDC]
*/
const USDC = {
  contract: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  code: "USDC",
  issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
};

const ANCHOR = process.env["NEXT_PUBLIC_ANCHOR_DOMAIN"] ?? "tr-mock-anchor.fly.dev";
const wanted = (process.argv[2] ?? "XLM").toUpperCase();
const PRIZE = wanted === "USDC" ? USDC.contract : XLM;

console.log("prize in :", wanted === "USDC" ? "USDC, redeemable at " + ANCHOR : "XLM");
/** Where this deployment sends its cut, from `frontend/.env.local`. */
const COLLECTOR = "GD6VIYOQ6XZRAKQDOI2SSPD7VVJCB6U2G67NIYDMWNTFQQVVVM5RWZKF";

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
  Every window is a minute wide. `advance_phase` will not move a stage before
  its deadline has passed, so the walk below spends most of its time waiting on
  a clock rather than on the network.
*/
/*
  Both accounts accept the asset, and the organizer buys some, before the clock
  starts.

  Before, and not merely early. Two trustlines and a round trip through the
  anchor take the better part of a minute, and every window in this walk is a
  minute wide: done after the timestamps below were taken, the setup spends the
  submission window and the contract refuses the entry that was the point of
  running it.

  In that order because each depends on the last: the anchor cannot deliver to
  an account that has not accepted, and the vault cannot be funded by an
  organizer holding nothing. The builder accepts here rather than at settlement
  for the same reason it matters in the product — `settle_prize` fails for an
  unprepared winner, and the point of this walk is to reach a paid one.
*/
if (wanted === "USDC") {
  await acceptAsset(organizer);
  await acceptAsset(builder);
  console.log("trustlines ✓");

  /* Enough lira for a prize the anchor will take back: its floor is one USDC
     and the table below pays out in whole units. */
  await buyPrize(organizer, 3000);
}

const now = Math.floor(Date.now() / 1000);
const minute = 60;

const constitution = {
  version: 4,
  metadata_hash: Buffer.alloc(32),
  prize_asset: PRIZE,
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
await call(organizer, vault, "create", new Address(core).toScVal(), new Address(PRIZE).toScVal());
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

await waitFor(now + minute, "submissions to close");
await call(organizer, core, "advance_phase");
console.log("screening ✓");

await waitFor(now + 2 * minute, "screening to close");
await call(organizer, core, "advance_phase");
console.log("judging  ✓");

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

/* Encoded through the call that takes it rather than by naming the type, so the
   bytes hashed here are exactly the bytes the contract will later be handed. */
const [encodedScorecard] = spec.funcArgsToScVals("reveal_score", { scorecard, proof: [] });
const encoded = encodedScorecard!.toXDR();

/* One hash over the leaf tag, the domain and the XDR, in that order. Hashing
   the domain and body first and then tagging the digest is the obvious wrong
   version and produces a root the contract rejects as not matching. */
const domain = new TextEncoder().encode("stelhacks.v1.scorecard");
const leaf = hash(
  Buffer.concat([Buffer.from([0x00]), Buffer.from(domain), Buffer.from(encoded)]),
);

/* The root goes up after the scoring window shuts and before the phase moves.
   Publishing early is refused as a deadline not reached, which is the contract
   making sure a root cannot commit to a set that is still being added to. */
await waitFor(now + 3 * minute, "scoring to close");

await call(organizer, core, "publish_score_root", nativeToScVal(leaf, { type: "bytes" }));
console.log("sealed   ✓", Buffer.from(leaf).toString("hex").slice(0, 16));

await call(organizer, core, "advance_phase");
console.log("reveal   ✓");

const weighted = await call(
  organizer,
  core,
  "reveal_score",
  ...spec.funcArgsToScVals("reveal_score", { scorecard, proof: [] }),
);
console.log("scored   ✓", weighted);

/* Neither of these is `advance_phase`. Reveal has no closing deadline, so the
   generic move refuses it as a wrong phase; the ranking is what ends that stage
   and opening settlement is what ends the next. Both are their own calls
   because both do something besides moving a number. */
await call(organizer, core, "finalize_results");
console.log("ranked   ✓");

await call(organizer, core, "open_settlement");
console.log("settle   ✓");

const paid = await call(
  organizer,
  core,
  "settle_prize",
  nativeToScVal("payments", { type: "symbol" }),
  nativeToScVal(1, { type: "u32" }),
  new Address(builder.publicKey()).toScVal(),
);
console.log("paid     ✓", paid);

/* Parked here on purpose. The fee is unsettled and the event is therefore
   uncloseable, which is exactly the pair of buttons the organizer console
   offers at this phase, so the rest is done by hand in the browser. */
console.log("\nparked in Settlement, fee unsettled.");
console.log("  manage at: /manage/" + core);
console.log("  organizer: " + organizer.publicKey());
console.log("  secret   : " + organizer.secret());
console.log("  collector: " + COLLECTOR);
console.log("\nthe winner, whose prize is already paid:");
console.log("  address  : " + builder.publicKey());
console.log("  secret   : " + builder.secret());
console.log("core :", core);
console.log("vault:", vault);

async function waitFor(deadline: number, what: string): Promise<void> {
  const left = deadline - Math.floor(Date.now() / 1000) + 5;

  if (left > 0) {
    console.log(`  waiting ${left}s for ${what}`);
    await new Promise((wake) => setTimeout(wake, left * 1000));
  }
}

/**
 * Accept an issued asset, so an account can be paid in it.
 *
 * A classic operation, so it skips simulation: there is no footprint to work
 * out. Both the organizer and the builder need one before anything can move —
 * the organizer to hold what it funds the vault with, the builder to be paid.
 * The vault itself needs none, because a contract holds balances in its own
 * storage rather than in a trustline.
 */
async function acceptAsset(who: Keypair): Promise<void> {
  const account = await server.getAccount(who.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset: new Asset(USDC.code, USDC.issuer) }))
    .setTimeout(120)
    .build();

  tx.sign(who);

  const sent = await server.sendTransaction(tx);
  const done = await server.pollTransaction(sent.hash, { attempts: 30, sleepStrategy: () => 1000 });

  if (done.status !== "SUCCESS") {
    throw new Error(`trustline for ${who.publicKey()}: ${done.status}`);
  }
}

/**
 * Buy the prize from the anchor with imaginary lira.
 *
 * The deposit half of the same ramp the winner will use to go the other way, so
 * the asset in the vault is the asset that anchor redeems rather than one that
 * merely shares its code. Nothing real is spent: the anchor's sandbox has an
 * endpoint that says the bank transfer arrived, and that is the whole of it.
 */
async function buyPrize(who: Keypair, lira: number): Promise<void> {
  const toml = await (await fetch(`https://${ANCHOR}/.well-known/stellar.toml`)).text();
  const read = (key: string) =>
    new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, "m").exec(toml)?.[1]?.replace(/^["']|["'].*$/g, "") ?? "";

  const auth = read("WEB_AUTH_ENDPOINT");
  const transfer = read("TRANSFER_SERVER");
  const kyc = read("KYC_SERVER");

  const challenge = await (await fetch(`${auth}?account=${who.publicKey()}`)).json();
  const signed = TransactionBuilder.fromXDR(challenge.transaction, challenge.network_passphrase);

  if (!("sign" in signed)) {
    throw new Error("the anchor sent a fee bump");
  }

  signed.sign(who);

  const { token } = await (
    await fetch(auth, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: signed.toXDR() }),
    })
  ).json();

  await fetch(`${kyc}/customer`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ account: who.publicKey() }),
  });

  const opened = await (
    await fetch(`${transfer}/deposit?asset_code=USDC&account=${who.publicKey()}&amount=${lira}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();

  await fetch(`${transfer.replace(/\/sep6$/, "")}/sep6/tx/${opened.id}/simulate-bank-transfer`, {
    method: "POST",
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { transaction } = await (
      await fetch(`${transfer}/transaction?id=${opened.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();

    if (transaction?.status === "completed") {
      console.log("bought   ✓", transaction.amount_out, "USDC for", lira, "TRY");

      return;
    }

    await new Promise((wake) => setTimeout(wake, 2000));
  }

  throw new Error("the anchor never delivered");
}
