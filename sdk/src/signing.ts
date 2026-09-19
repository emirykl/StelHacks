import { Keypair, StrKey } from "@stellar/stellar-sdk";
import type { Scorecard } from "hackathon-core";

import { ballotLeaf, scorecardLeaf } from "./hashing.js";
import type { Digest } from "./merkle.js";

/**
 * Signing a sealed entry, so the collection service cannot invent one.
 *
 * In the easy judging mode the scorecards sit off chain with a collection
 * service until the deadline, and only their Merkle root is published. That
 * service is the one place in the product carrying real trust, and this is one
 * of the two things that bounds it. The Merkle proof shows a judge their
 * scorecard was *included*; the signature shows everyone else it was *theirs*.
 * Neither alone is enough: without the proof the service could drop a card,
 * and without the signature it could add one.
 *
 * What gets signed is the leaf, not the scorecard. That ties the signature to
 * the exact bytes the tree commits to, so a signature cannot be lifted off one
 * encoding and presented against another.
 */

/** A signature over a sealed entry, alongside the address that made it. */
export interface SealedSignature {
  /** The address that signed, as a strkey. */
  signer: string;
  /** The leaf the signature covers, which is also what the tree commits to. */
  leaf: Digest;
  signature: Uint8Array;
}

/**
 * Signs a scorecard as the judge it names.
 *
 * The keypair has to be the judge's own. Signing on somebody else's behalf
 * produces a signature that verifies against the wrong address, which
 * [`verifySealed`] refuses, so the mistake surfaces at the collection service
 * rather than at the reveal.
 */
export function signScorecard(scorecard: Scorecard, keypair: Keypair): SealedSignature {
  if (keypair.publicKey() !== scorecard.judge) {
    throw new Error(
      `this keypair is ${keypair.publicKey()}, but the scorecard names ${scorecard.judge}`,
    );
  }

  return sign(scorecardLeaf(scorecard), keypair);
}

/** Signs a community ballot as the voter it names. */
export function signBallot(voter: string, team: number, keypair: Keypair): SealedSignature {
  if (keypair.publicKey() !== voter) {
    throw new Error(`this keypair is ${keypair.publicKey()}, but the ballot names ${voter}`);
  }

  return sign(ballotLeaf(voter, team), keypair);
}

/**
 * Whether a signature really was made by the address it claims.
 *
 * This is what a collection service runs on intake and what anybody can rerun
 * afterwards from the published data, which is the point: the check does not
 * depend on trusting whoever performed it the first time.
 */
export function verifySealed(entry: SealedSignature): boolean {
  if (!StrKey.isValidEd25519PublicKey(entry.signer)) {
    return false;
  }

  return Keypair.fromPublicKey(entry.signer).verify(
    Buffer.from(entry.leaf),
    Buffer.from(entry.signature),
  );
}

/**
 * Whether a signature covers this exact scorecard.
 *
 * Checking the signature alone would leave a gap: a valid signature over some
 * other scorecard by the same judge would pass. Recomputing the leaf closes it.
 */
export function verifyScorecard(scorecard: Scorecard, entry: SealedSignature): boolean {
  return matches(scorecardLeaf(scorecard), entry) && entry.signer === scorecard.judge;
}

/** The same check for a ballot. */
export function verifyBallot(voter: string, team: number, entry: SealedSignature): boolean {
  return matches(ballotLeaf(voter, team), entry) && entry.signer === voter;
}

function sign(leaf: Digest, keypair: Keypair): SealedSignature {
  return {
    signer: keypair.publicKey(),
    leaf,
    signature: new Uint8Array(keypair.sign(Buffer.from(leaf))),
  };
}

function matches(leaf: Digest, entry: SealedSignature): boolean {
  return (
    leaf.length === entry.leaf.length &&
    leaf.every((byte, index) => byte === entry.leaf[index]) &&
    verifySealed(entry)
  );
}
