import { Keypair, StrKey, hash } from "@stellar/stellar-sdk";
import type { Scorecard } from "hackathon-core";

import { ballotLeaf, scorecardLeaf } from "./hashing.js";
import { toHex } from "./hex.js";
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
 *
 * The leaf is signed as its hexadecimal text under SEP-53, not as its thirty
 * two raw bytes. That is where the signing actually happens: a judge signs in a
 * wallet, and a wallet's message signing interface takes a string and wraps it
 * the way SEP-53 says. Handing arbitrary bytes to a string interface is where
 * encodings get mangled, differently in each wallet; hex is unambiguous in all
 * of them, and what is signed is still the leaf, only written down.
 *
 * Following the standard rather than inventing a wrapper is what makes a
 * signature made in any Stellar wallet verifiable here, and one made here
 * verifiable by anything else that knows SEP-53.
 *
 * Nothing on chain depends on it. The contract verifies a Merkle proof and
 * never sees a signature, so this is a convention between the judge, this SDK
 * and the collection service, and `signedPayload` below is the whole of it.
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
    Buffer.from(signedPayload(entry.leaf)),
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

/**
 * The exact bytes an ed25519 signature covers.
 *
 * Exported because a judge signing in a wallet has to produce a signature over
 * this and nothing else, and because anybody rechecking a sealed entry needs to
 * know what was signed without reading this file.
 */
export function signedPayload(leaf: Digest): Uint8Array {
  const message = new TextEncoder().encode(toHex(leaf));
  const prefix = new TextEncoder().encode(SEP53_PREFIX);

  const joined = new Uint8Array(prefix.length + message.length);
  joined.set(prefix);
  joined.set(message, prefix.length);

  /* SEP-53 signs the digest of the prefixed message, not the message. Signing
     the bytes directly produces something no wallet will ever agree with. */
  return new Uint8Array(hash(Buffer.from(joined)));
}

/**
 * The prefix SEP-53 puts in front of anything signed as a message.
 *
 * It exists so a signature over a message can never be replayed as a signature
 * over a transaction, which is why it is fixed and why nothing may be inserted
 * before it.
 */
const SEP53_PREFIX = "Stellar Signed Message:\n";

function sign(leaf: Digest, keypair: Keypair): SealedSignature {
  return {
    signer: keypair.publicKey(),
    leaf,
    signature: new Uint8Array(keypair.sign(Buffer.from(signedPayload(leaf)))),
  };
}

function matches(leaf: Digest, entry: SealedSignature): boolean {
  return (
    leaf.length === entry.leaf.length &&
    leaf.every((byte, index) => byte === entry.leaf[index]) &&
    verifySealed(entry)
  );
}
