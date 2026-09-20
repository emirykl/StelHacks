/**
 * Set a hackathon up on chain, from a constitution built here rather than by
 * hand.
 *
 * This is the organizer's side of the setup path, and it is the reason the SDK
 * exists as much as verification is. A constitution is sixteen fields deep with
 * nested tracks, criteria, prize tiers and a discretion policy; writing that as
 * command line JSON is possible and is not something anybody should do twice.
 *
 *     STELLAR_SECRET_KEY=S... npx tsx examples/create-hackathon.ts C<contract id>
 *
 * The key signs two transactions and is never stored. It has to be the address
 * that will be the organizer, because `create` records whoever signed it and
 * the contract never lets that change.
 */

import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";

import { HackathonCore, hashConstitution, toHex, type Constitution } from "../src/index.js";
import { RegistrationPolicy } from "hackathon-core";

const NETWORK = "Test SDF Network ; September 2015";
const RPC = "https://soroban-testnet.stellar.org";

const HOUR = 3_600;
const DAY = 24 * HOUR;

const [contractId] = process.argv.slice(2);
const secret = process.env["STELLAR_SECRET_KEY"];

if (contractId === undefined || secret === undefined) {
  throw new Error("usage: STELLAR_SECRET_KEY=S... create-hackathon.ts <contract id>");
}

const keypair = Keypair.fromSecret(secret);
const organizer = keypair.publicKey();

/**
 * The schedule is built from now rather than from fixed timestamps.
 *
 * Every deadline the contract validates has to run in order and none of them
 * may already have passed, so a constitution written with last week's dates is
 * refused at `create` rather than at the lock. Anchoring on the current ledger
 * time is what makes this runnable more than once.
 */
const now = Math.floor(Date.now() / 1000);
const schedule = {
  registration_opens_at: BigInt(now),
  registration_closes_at: BigInt(now + 7 * DAY),
  submission_opens_at: BigInt(now),
  submission_closes_at: BigInt(now + 9 * DAY),
  screening_closes_at: BigInt(now + 11 * DAY),
  judging_closes_at: BigInt(now + 14 * DAY),
  community_vote_opens_at: BigInt(now + 11 * DAY + 2 * HOUR),
  community_vote_closes_at: BigInt(now + 13 * DAY),
};

const criteria = () => [
  { id: "technical", weight_bps: 6_000 },
  { id: "novelty", weight_bps: 4_000 },
];

const judges = [Keypair.random(), Keypair.random(), Keypair.random()].map((judge) => ({
  judge: judge.publicKey(),
  tracks: ["payments", "defi"],
}));

const constitution: Constitution = {
  version: 4,
  metadata_hash: Buffer.alloc(32, 7),
  // The native lumen wrapped as a contract token, so the vault holds something
  // real without an issuer to set up first.
  prize_asset: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  tracks: [
    { id: "payments", criteria: criteria(), no_award_allowed: false },
    { id: "defi", criteria: criteria(), no_award_allowed: true },
  ],
  judges,
  judge_quorum: 3,
  judging_mode: { tag: "Easy", values: [organizer] },
  vote: { judge_bps: 8_000, community_bps: 2_000 },
  visibility: 0,
  // Two demanded, one offered, and the deck and the contract never asked for.
  // The three way rule is what lets an event leave a field off the form
  // altogether rather than only leave it blank.
  submission_requirements: {
    repository: 2,
    demo_video: 2,
    live_url: 1,
    pitch_deck: 0,
    deployed_contract: 0,
  },
  /* Reviewed, which is what an example should show: the open policy needs no
     explanation and the queue is the part somebody has to plan for. */
  registration: RegistrationPolicy.Reviewed,
  teams: { max_size: 4, multi_team_allowed: false },
  prize_tiers: [
    { track: "payments", rank: 1, amount: 5_000n },
    { track: "payments", rank: 2, amount: 3_000n },
    { track: "defi", rank: 1, amount: 2_000n },
  ],
  // A community event, so nothing is charged. The collector is still named,
  // because the field is unconditional: a rate of zero is a rate, and a reader
  // should not have to check one field to know whether another one means
  // anything.
  platform_fee: { collector: organizer, bps: 0 },
  tie_break: [
    { tag: "JudgeScore", values: undefined },
    { tag: "SubmissionOrder", values: undefined },
  ],
  discretion: {
    disqualification_threshold: 2,
    appeal_window: BigInt(48 * HOUR),
    settlement: { tag: "SafetyWindow", values: [BigInt(24 * HOUR)] },
    prize_claim_period: BigInt(90 * DAY),
    unclaimed_refund: 0,
    no_award_refund: 0,
    cancellation_threshold: 2,
    cancellation_refund: 0,
  },
  schedule,
  extensions: { max_extensions_per_deadline: 2, max_total_seconds_per_deadline: BigInt(2 * DAY) },
};

const core = new HackathonCore({
  contractId,
  networkPassphrase: NETWORK,
  rpcUrl: RPC,
  publicKey: organizer,
  ...basicNodeSigner(keypair, NETWORK),
});

// The digest is computed here, before anything is signed, so the organizer can
// compare it against what the contract stores afterwards. If the two ever
// differed, the rules being enforced would not be the rules that were read.
const expected = toHex(hashConstitution(constitution));
console.log(`constitution digest: ${expected}`);

const created = await core.create({ organizer, constitution });
await created.signAndSend();
console.log("created");

const locked = await core.lock_rules();
const { result } = await locked.signAndSend();
const stored = result.unwrap().toString("hex");

console.log(`locked, stored digest: ${stored}`);
console.log(stored === expected ? "the chain stored what was signed" : "THE DIGESTS DISAGREE");

process.exitCode = stored === expected ? 0 : 1;
