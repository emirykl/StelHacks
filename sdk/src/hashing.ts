import { Address, hash, xdr } from "@stellar/stellar-sdk";
import type { Constitution, SubmissionMetadata, Scorecard, VoteChoice } from "hackathon-core";

import { leaf, type Digest } from "./merkle.js";
import { spec } from "./spec.js";

/**
 * Domain separators, matching `hashing.rs` byte for byte.
 *
 * Every digest in this system is taken over a tagged payload, so a value that
 * happens to serialize identically in two different roles can never produce the
 * same digest. Without this, a carefully shaped submission could in principle
 * carry the digest of a constitution, and a reader comparing hashes would have
 * no way to tell which one they were looking at.
 */
const CONSTITUTION_DOMAIN = "stelhacks.v1.constitution";
const SUBMISSION_DOMAIN = "stelhacks.v1.submission";
const SCORECARD_DOMAIN = "stelhacks.v1.scorecard";
const BALLOT_DOMAIN = "stelhacks.v1.ballot";

/**
 * The XDR encoding of a value, as the contract would produce it.
 *
 * Exposed because comparing bytes is a far better failure signal than comparing
 * digests. Two digests differing tells you something moved; two byte strings
 * differing tells you where.
 */
export function encode(value: unknown, type: string): Uint8Array {
  const named = xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({ name: type }));

  return new Uint8Array(spec.nativeToScVal(value, named).toXDR());
}

/**
 * The digest that locks the rules of a hackathon.
 *
 * A participant can rebuild the constitution from the public page, hash it
 * here, and compare against the value stored on chain. If the two differ, the
 * competition being run is not the one that was announced.
 */
export function hashConstitution(constitution: Constitution): Digest {
  return digest(CONSTITUTION_DOMAIN, encode(constitution, "Constitution"));
}

/**
 * The digest that pins a project at the submission deadline.
 *
 * Only this value goes on chain. The description, the links and the logo stay
 * off chain, and anyone can fetch them later, hash them the same way, and see
 * that the project a judge scored is the project that was submitted.
 */
export function hashSubmissionMetadata(metadata: SubmissionMetadata): Digest {
  return digest(SUBMISSION_DOMAIN, encode(metadata, "SubmissionMetadata"));
}

/**
 * The leaf a scorecard occupies in the sealed tree.
 *
 * The judge's address is part of the payload, so one judge's scorecard cannot
 * be counted as another's, and the team is part of it so a scorecard cannot be
 * moved between projects after the fact.
 */
export function scorecardLeaf(scorecard: Scorecard): Digest {
  return leaf(tagged(SCORECARD_DOMAIN, encode(scorecard, "Scorecard")));
}

/**
 * The leaf a community ballot occupies.
 *
 * The whole ballot rather than one choice of it: the address in XDR, then how
 * many choices follow as four big endian bytes, then each team and weight as
 * four more. The count is what stops two different ballots from concatenating
 * into the same bytes, and the order is the ascending one the contract insists
 * on, so a page that sorted its choices differently would seal a digest the
 * contract will not recognise.
 *
 * Nothing about the voter is hidden here; the tally is sealed until the reveal,
 * and after it every ballot is open for anyone to recount.
 */
export function ballotLeaf(voter: string, choices: readonly VoteChoice[]): Digest {
  // An address is a built in value rather than one of the contract's own types,
  // so it does not go through the spec; the SDK already knows its encoding.
  const address = new Uint8Array(new Address(voter).toScVal().toXDR());

  const body = [u32(choices.length)];
  for (const choice of choices) {
    body.push(u32(choice.team), u32(choice.weight));
  }

  return leaf(concat(text(BALLOT_DOMAIN), address, ...body));
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);

  return bytes;
}

function digest(domain: string, body: Uint8Array): Digest {
  return sha256(tagged(domain, body));
}

function tagged(domain: string, body: Uint8Array): Uint8Array {
  return concat(text(domain), body);
}

function sha256(payload: Uint8Array): Digest {
  return new Uint8Array(hash(Buffer.from(payload)));
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);

  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }

  return out;
}
