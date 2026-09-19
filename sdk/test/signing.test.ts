import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { scorecardLeaf } from "../src/hashing.js";
import {
  signBallot,
  signScorecard,
  signedPayload,
  verifyBallot,
  verifyScorecard,
  verifySealed,
} from "../src/signing.js";
import { canonicalScorecard } from "./canonical.js";

/** A judge with a key, which the canonical fixture deliberately does not have. */
function judge(): Keypair {
  return Keypair.random();
}

function scorecardFrom(keypair: Keypair) {
  return { ...canonicalScorecard(), judge: keypair.publicKey() };
}

describe("a signed scorecard", () => {
  it("verifies against the address that signed it", () => {
    const keypair = judge();
    const signed = signScorecard(scorecardFrom(keypair), keypair);

    expect(signed.signer).toBe(keypair.publicKey());
    expect(verifySealed(signed)).toBe(true);
  });

  /**
   * The signature covers the leaf, so it covers the scorecard. Checking the
   * signature alone would let a valid signature over a different scorecard by
   * the same judge pass, which is exactly how a collection service would swap
   * one card for another it had also been given.
   */
  it("stops covering the scorecard the moment a score changes", () => {
    const keypair = judge();
    const original = scorecardFrom(keypair);
    const signed = signScorecard(original, keypair);

    expect(verifyScorecard(original, signed)).toBe(true);

    const altered = scorecardFrom(keypair);
    altered.scores[0]!.score = 99;

    expect(verifyScorecard(altered, signed)).toBe(false);
    expect(verifySealed(signed)).toBe(true);
  });

  /**
   * The signature is bound to the same bytes the tree commits to, which is what
   * lets a judge hold one receipt that answers both questions: was my card
   * included, and was the included card mine.
   */
  it("covers exactly the leaf the tree will carry", () => {
    const keypair = judge();
    const scorecard = scorecardFrom(keypair);
    const signed = signScorecard(scorecard, keypair);

    expect(signed.leaf).toEqual(scorecardLeaf(scorecard));
  });

  it("refuses to sign in another judge's name", () => {
    const keypair = judge();
    const somebodyElse = canonicalScorecard();

    expect(() => signScorecard(somebodyElse, keypair)).toThrow(/names/);
  });

  it("does not verify against a different address", () => {
    const keypair = judge();
    const signed = signScorecard(scorecardFrom(keypair), keypair);

    expect(verifySealed({ ...signed, signer: judge().publicKey() })).toBe(false);
  });

  it("does not verify once a byte of the signature moves", () => {
    const keypair = judge();
    const signed = signScorecard(scorecardFrom(keypair), keypair);
    const tampered = new Uint8Array(signed.signature);
    tampered[0] ^= 0xff;

    expect(verifySealed({ ...signed, signature: tampered })).toBe(false);
  });
});

describe("a signed ballot", () => {
  it("verifies against the voter who cast it", () => {
    const keypair = judge();
    const signed = signBallot(keypair.publicKey(), 3, keypair);

    expect(verifyBallot(keypair.publicKey(), 3, signed)).toBe(true);
  });

  /**
   * A ballot signature that still verified after the team changed would let a
   * collection service move a vote from one project to another without the
   * voter ever knowing.
   */
  it("stops covering the ballot when the project changes", () => {
    const keypair = judge();
    const signed = signBallot(keypair.publicKey(), 3, keypair);

    expect(verifyBallot(keypair.publicKey(), 4, signed)).toBe(false);
  });

  it("refuses to sign in another voter's name", () => {
    const keypair = judge();

    expect(() => signBallot(Keypair.random().publicKey(), 1, keypair)).toThrow(/names/);
  });
});

describe("addresses that cannot sign this way", () => {
  /**
   * A contract address has no ed25519 key behind it, so a smart account judge
   * cannot produce a signature this check would accept. Returning false rather
   * than throwing keeps the caller's loop simple; what it must not do is
   * quietly pass.
   */
  it("refuses a contract address instead of accepting it", () => {
    const keypair = judge();
    const signed = signScorecard(scorecardFrom(keypair), keypair);
    const contract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

    expect(verifySealed({ ...signed, signer: contract })).toBe(false);
  });
});

/**
 * What a judge's wallet has to sign, pinned.
 *
 * The signature is made in a wallet, whose message signing API takes a string,
 * so the payload is the leaf written as hexadecimal rather than its raw bytes.
 * Changing that silently would leave every wallet produced signature rejected
 * at the collection service with nothing to point at, so it fails here instead.
 */
describe("what the signature covers", () => {
  it("is the leaf as lowercase hexadecimal text", () => {
    const leaf = new Uint8Array(32).fill(0xab);

    expect(new TextDecoder().decode(signedPayload(leaf))).toBe("ab".repeat(32));
  });

  it("is text a wallet can carry, not bytes it would mangle", () => {
    const leaf = new Uint8Array(32).fill(0);

    /* Every byte in range for a string interface, which raw digest bytes are
       not: a leaf routinely contains nulls and values above 0x7f. */
    expect(signedPayload(leaf).every((byte) => byte >= 0x30 && byte <= 0x66)).toBe(true);
  });
});
