/**
 * Scoring, which happens off chain and costs a judge nothing.
 *
 * A judge signs one card per project and never comes back. The contract sees
 * no signature at all: it verifies a Merkle proof at the reveal, so what lives
 * here is a convention between the judge, this site and the collection service.
 *
 * Sub Rosa tlock keeps the scores unreadable until the judging deadline. Two
 * more things bound the service after that: the signature shows the card was
 * the judge's, and the receipt plus later inclusion proof shows it was counted.
 */

import { toHex } from "./hex";
import { rootFrom } from "./roots";
import { sealUntil } from "./sealed-input";

const sealerUrl = process.env["NEXT_PUBLIC_SEALER_URL"];

export interface Criterion {
  id: string;
  weightBps: number;
}

export interface Scorecard {
  judge: string;
  team: number;
  scores: { criterion: string; score: number }[];
}

/** What the service promises about a card it has taken. */
export interface Receipt {
  leaf: string;
  received_at: number;
  sealer: string;
  signature: string;
}

export function sealingConfigured(): boolean {
  return sealerUrl !== undefined;
}

/**
 * The leaf a scorecard occupies, computed the way the contract computes it.
 *
 * One hash over the leaf tag, the domain and the card's XDR, in that order.
 * Hashing the domain and body first and tagging the digest afterwards is the
 * plausible wrong version, and it produces a root the contract rejects at the
 * reveal rather than anything that fails here.
 */
export async function leafOf(scorecard: Scorecard): Promise<Uint8Array> {
  const [{ hash }, { Spec }] = await Promise.all([
    import("@stellar/stellar-sdk/base"),
    import("@stellar/stellar-sdk/contract"),
  ]);

  const entries = (await import("./contract-spec.json")).default as string[];
  const spec = new Spec(entries);

  /* Encoded through the call that will later carry it, so the bytes signed
     here are the bytes the contract is eventually handed. */
  const [encoded] = spec.funcArgsToScVals("reveal_score", { scorecard, proof: [] });
  const domain = new TextEncoder().encode("stelhacks.v1.scorecard");

  return new Uint8Array(
    hash(
      Buffer.concat([
        Buffer.from([0x00]),
        Buffer.from(domain),
        Buffer.from(encoded!.toXDR()),
      ]),
    ),
  );
}

/**
 * The message handed to the wallet, which is the leaf as hexadecimal text.
 *
 * Not the thirty two raw bytes: a wallet's message signing interface takes a
 * string, and arbitrary bytes through a string interface get mangled
 * differently in each one. Hex is unambiguous everywhere.
 *
 * What the wallet then signs is not this either. Under SEP-53 it prefixes the
 * message with "Stellar Signed Message:\n", hashes that, and signs the digest,
 * so a message signature can never be replayed as a transaction. The SDK builds
 * the same payload when it verifies, and `sdk/test/signing` pins it, because
 * getting it wrong fails at a judge's wallet with nothing to read rather than
 * anywhere a test would catch.
 */
export function payloadFor(leaf: Uint8Array): string {
  return toHex(leaf);
}

/** Hand a signed card to the collection service and keep what it promises. */
export async function submitScorecard(
  contract: string,
  scorecard: Scorecard,
  leaf: Uint8Array,
  signature: string,
  revealAt: number,
): Promise<Receipt> {
  if (sealerUrl === undefined) {
    throw new Error("no collection service is configured for this deployment");
  }

  const sealed = await sealUntil(
    { kind: "stelhacks.scorecard.v1", scorecard },
    revealAt,
  );
  const answer = await fetch(`${sealerUrl}/scorecard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contract,
      team: scorecard.team,
      judge: scorecard.judge,
      leaf: toHex(leaf),
      signature,
      sealed,
    }),
  });

  const said = (await answer.json()) as Receipt & { error?: string };

  if (!answer.ok) {
    throw new Error(explain(said.error ?? "", answer.status));
  }

  return said;
}

/**
 * What went wrong, said to a judge rather than to whoever wrote the service.
 *
 * The service answers in its own terms, which are precise and mean nothing to
 * somebody who has just filled in two numbers. Each one below is turned into
 * what the person can actually do about it; anything unrecognised is passed
 * through rather than replaced by a friendlier guess, because a wrong
 * explanation is worse than an unfamiliar one.
 */
function explain(said: string, status: number): string {
  if (said.includes("signature does not cover")) {
    return "Your wallet signed something other than this card. Check that it is on Test Net, then try again.";
  }

  if (said.includes("not collecting scorecards")) {
    return "Judging is not open for this hackathon right now.";
  }

  if (said.includes("no such hackathon")) {
    return "This hackathon has not been indexed yet, so there is nowhere to file the card. Try again shortly.";
  }

  if (said.includes("already")) {
    return "You have already scored this project. A card cannot be replaced once it is sealed.";
  }

  if (status === 0 || said.length === 0) {
    return "The collection service did not answer. It may not be running.";
  }

  return said;
}

/**
 * The root the service would publish, for whoever the rules say may publish it.
 *
 * Normally nobody asks: the service holds the cards, the constitution names the
 * service, and it puts the root on chain itself. This is for the events frozen
 * before that was true, whose rules name the organizer instead — the service
 * cannot sign for them and the organizer cannot compute the root, so one of
 * them has to hand the other half over.
 *
 * Null rather than an error when there is nothing held. A hackathon whose
 * judges never handed a card in has no root to publish and is not in trouble;
 * it is waiting.
 */
export async function rootHeldFor(contract: string): Promise<string | null> {
  if (sealerUrl === undefined) {
    return null;
  }

  try {
    const answer = await fetch(`${sealerUrl}/root?contract=${contract}&kind=scorecards`);

    if (!answer.ok) {
      return null;
    }

    const { root } = (await answer.json()) as { root?: string };

    return typeof root === "string" && /^[0-9a-f]{64}$/.test(root) ? root : null;
  } catch {
    return null;
  }
}

/**
 * Whether a card is in the tree the contract committed to.
 *
 * Three outcomes and they are not interchangeable. `waiting` is nothing
 * collected yet. `omitted` is the alarm: the service holds cards and this one
 * is not among them, which is what a receipt exists to be able to say.
 * `included` means a proof came back and the root it belongs to is the root on
 * chain.
 *
 * That last part is the difference between a check worth running and a
 * reassurance. A service asked to prove its own honesty can always build a tree
 * that contains the card and return a proof against it; what it cannot do is
 * make that tree's root match the one it already published on chain.
 */
export type Inclusion =
  | { at: "waiting" }
  | { at: "omitted" }
  | { at: "included"; root: string }
  | { at: "disagrees"; serviceRoot: string; chainRoot: string }
  | { at: "unreachable"; why: string };

export async function inclusionOf(contract: string, leaf: string): Promise<Inclusion> {
  if (sealerUrl === undefined) {
    return { at: "unreachable", why: "no collection service is configured" };
  }

  let answer: Response;

  try {
    answer = await fetch(
      `${sealerUrl}/proof?contract=${contract}&kind=scorecards&leaf=${leaf}`,
    );
  } catch {
    return { at: "unreachable", why: "the collection service did not answer" };
  }

  if (!answer.ok) {
    const said = ((await answer.json()) as { error?: string }).error ?? "";

    /* The two refusals mean opposite things and the service says which. */
    return said.includes("not in the tree") ? { at: "omitted" } : { at: "waiting" };
  }

  const { root } = (await answer.json()) as { root: string; proof: string[] };
  const onChain = await rootFrom(contract, "score_root");

  if (onChain === null) {
    /* The tree exists but nothing has been committed to it yet, so there is
       nothing to compare against and no claim to make. */
    return { at: "included", root };
  }

  return onChain === root
    ? { at: "included", root }
    : { at: "disagrees", serviceRoot: root, chainRoot: onChain };
}
