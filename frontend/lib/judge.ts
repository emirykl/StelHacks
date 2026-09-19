/**
 * Scoring, which happens off chain and costs a judge nothing.
 *
 * A judge signs one card per project and never comes back. The contract sees
 * no signature at all: it verifies a Merkle proof at the reveal, so what lives
 * here is a convention between the judge, this site and the collection service.
 *
 * Two things bound that service, and both are in this file. The signature shows
 * the card was the judge's, so the service cannot add one. The receipt, and the
 * inclusion proof it can later be checked against, shows the card was counted,
 * so the service cannot drop one.
 */

import { toHex } from "./hex";

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
 * What the wallet is asked to sign.
 *
 * The leaf as hexadecimal text, not as its thirty two raw bytes. Every wallet's
 * message signing API takes a string, and handing arbitrary bytes to a string
 * interface is where encodings get mangled, differently in each one. The SDK
 * signs and the service verifies over exactly this, and `sdk/test/signing`
 * pins it so a change breaks there rather than at a judge's wallet.
 */
export function payloadFor(leaf: Uint8Array): string {
  return toHex(leaf);
}

/** Hand a signed card to the collection service and keep what it promises. */
export async function submitScorecard(
  contract: string,
  scorecard: Scorecard,
  signature: string,
): Promise<Receipt> {
  if (sealerUrl === undefined) {
    throw new Error("no collection service is configured for this deployment");
  }

  const answer = await fetch(`${sealerUrl}/scorecard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, scorecard, signature }),
  });

  const said = (await answer.json()) as Receipt & { error?: string };

  if (!answer.ok) {
    throw new Error(said.error ?? `the service refused with ${answer.status}`);
  }

  return said;
}

/**
 * The proof that a card was in the tree, once the root exists.
 *
 * Absent means the root has not been published yet. Present but not matching is
 * the case worth having: a judge holding a receipt and no proof has what they
 * need to say the service dropped their card.
 */
export async function proofFor(
  contract: string,
  leaf: string,
): Promise<{ root: string; proof: string[] } | null> {
  if (sealerUrl === undefined) {
    return null;
  }

  const answer = await fetch(
    `${sealerUrl}/proof?contract=${contract}&kind=scorecards&leaf=${leaf}`,
  );

  if (!answer.ok) {
    return null;
  }

  return (await answer.json()) as { root: string; proof: string[] };
}
