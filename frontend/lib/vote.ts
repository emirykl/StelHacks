/**
 * The community vote, which happens off chain and costs a voter nothing.
 *
 * A wallet holds the points the rules hand it — ten at the default, across at
 * most three projects — and places them once. Nothing is signed as a
 * transaction and nothing is paid: the ballot is a digest, signed as a message,
 * handed to the same collection service the judges use. The contract sees it
 * only at the reveal, as a Merkle proof.
 *
 * Sub Rosa tlock keeps the choices unreadable until the judging deadline. The
 * signature then shows the ballot was this wallet's, while the receipt and
 * later inclusion proof show it was counted rather than quietly dropped.
 */

import { db } from "./chain";
import { toHex } from "./hex";
import type { Receipt } from "./judge";
import { sealUntil } from "./sealed-input";

const sealerUrl = process.env["NEXT_PUBLIC_SEALER_URL"];

/** One project and what this ballot gives it. Whole points, never zero. */
export interface Choice {
  team: number;
  weight: number;
}

/**
 * The leaf a ballot occupies, computed the way the contract computes it.
 *
 * The whole ballot under one digest: the domain, the voter's address in XDR,
 * how many choices follow, then each team and weight as four big endian bytes.
 * The count is what stops two different ballots from concatenating into the
 * same bytes, and the order has to be the ascending one the contract insists
 * on, which is why `ordered` below is not a presentation detail.
 */
export async function leafOf(voter: string, choices: readonly Choice[]): Promise<Uint8Array> {
  const { Address, hash } = await import("@stellar/stellar-sdk/base");

  const domain = new TextEncoder().encode("stelhacks.v1.ballot");
  const address = new Address(voter).toScVal().toXDR();

  const body = [u32(choices.length)];
  for (const choice of choices) {
    body.push(u32(choice.team), u32(choice.weight));
  }

  return new Uint8Array(
    hash(
      Buffer.concat([
        // The leaf tag, which is what keeps a leaf from ever colliding with an
        // interior node of the same tree.
        Buffer.from([0x00]),
        Buffer.from(domain),
        Buffer.from(address),
        ...body.map((part) => Buffer.from(part)),
      ]),
    ),
  );
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);

  return bytes;
}

/**
 * The choices in the one spelling the contract accepts.
 *
 * Ascending by team, with anything worth nothing left out. A voter moves points
 * around in whatever order they please and the page has no business sealing
 * that order: two ballots that place the same points on the same projects are
 * the same ballot, and only one of them hashes to a digest the reveal will
 * recognise.
 */
export function ordered(choices: readonly Choice[]): Choice[] {
  return choices
    .filter((choice) => choice.weight > 0)
    .slice()
    .sort((left, right) => left.team - right.team);
}

/** Hand a signed ballot to the collection service and keep what it promises. */
export async function submitBallot(
  contract: string,
  voter: string,
  choices: readonly Choice[],
  leaf: Uint8Array,
  signature: string,
  revealAt: number,
): Promise<Receipt> {
  if (sealerUrl === undefined) {
    throw new Error("no collection service is configured for this deployment");
  }

  const sealed = await sealUntil(
    { kind: "stelhacks.ballot.v1", voter, choices },
    revealAt,
  );
  const answer = await fetch(`${sealerUrl}/ballot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, voter, leaf: toHex(leaf), signature, sealed }),
  });

  const said = (await answer.json()) as Receipt & { error?: string };

  if (!answer.ok) {
    throw new Error(explain(said.error ?? "", answer.status));
  }

  return said;
}

/**
 * Whether this wallet was let into this hackathon.
 *
 * The contract decides it properly — approved, and approved before sign-ups
 * closed — and refuses a ballot from anybody else at the reveal. This is the
 * courtesy version, so somebody who was never admitted is told now rather than
 * after they have spent ten points and signed for them.
 */
export async function mayVote(contractId: string, address: string): Promise<boolean> {
  if (db === null) {
    return false;
  }

  const { data } = await db
    .from("participants")
    .select("address")
    .eq("contract_id", contractId)
    .eq("address", address)
    .maybeSingle();

  return data !== null;
}

/**
 * What went wrong, said to a voter rather than to whoever wrote the service.
 *
 * Anything unrecognised is passed through rather than replaced by a friendlier
 * guess, because a wrong explanation is worse than an unfamiliar one.
 */
function explain(said: string, status: number): string {
  if (said.includes("signature does not cover")) {
    return "Your wallet signed something other than this ballot. Check that it is on Test Net, then try again.";
  }
  if (said.includes("points to place")) {
    return said;
  }
  if (said.includes("not collecting ballots")) {
    return "This hackathon is not taking ballots at the moment.";
  }
  if (status === 404) {
    return "The collection service does not know this hackathon yet.";
  }

  return said.length > 0 ? said : "The collection service refused the ballot without saying why.";
}

/** The leaf as hexadecimal text, which is what a wallet is handed to sign. */
export function payloadFor(leaf: Uint8Array): string {
  return toHex(leaf);
}
