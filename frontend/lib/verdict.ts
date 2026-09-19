import { phaseName } from "./phase";
import type { Claim, Proof } from "../app/components/proof-strip";

/**
 * Deciding what a check found, with no network in sight.
 *
 * This is separated from `verify.ts` on purpose. Everything here turns an
 * answer into a verdict, and a verdict on this product is not a cosmetic
 * state: `does not match` on a rules digest is the page telling a reader that
 * the site they are looking at is misrepresenting a contract. That is an
 * accusation, and the rules for making one should be readable and testable
 * without a testnet, a wallet or a running RPC node.
 *
 * Two distinctions carry most of the weight:
 *
 *   A refusal is not silence. The contract declining to name a vault is an
 *   answer; the network never replying is not.
 *
 *   Not knowing is not the same as finding nothing wrong. A check that could
 *   not be made leaves a claim unchecked, never verified.
 */

/** What the contract answered, or why we could not ask it. */
export type Check = { found: string; matches: boolean } | { failed: string };

export interface Claims {
  /** The digest the page is showing, hex, no prefix. Absent before the lock. */
  digest: string | null;
  /** The phase number the page is showing. Absent before the indexer arrives. */
  phase: number | null;
  /** The vault the page says is bound, or null if it says none is. */
  vault: string | null;
}

export interface Findings {
  digest?: Check;
  phase?: Check;
  vault?: Check;
  /**
   * Whether the contract answered anything at all.
   *
   * Tracked separately because a refusal is not silence. `vault` throws when no
   * vault is bound, which is the contract running correctly and telling us so;
   * reading reachability off the findings would let that count as an answer
   * even when the network never replied.
   */
  reached: boolean;
}

/** A claim the contract answered, compared against what the page showed. */
export function read(
  answer: PromiseSettledResult<unknown>,
  claimed: string | null,
  decode: (value: unknown) => string,
): Check {
  if (answer.status === "rejected") {
    return { failed: reason(answer.reason) };
  }

  try {
    const found = decode(answer.value);
    return { found, matches: claimed !== null && found === claimed };
  } catch {
    return { failed: "the contract answered in a shape this page did not expect" };
  }
}

/**
 * The vault, where the contract refusing to answer is itself the answer.
 *
 * A refusal only means something if the contract was talking. If the other
 * calls came back, this one was refused by the contract, and "there is no
 * vault" agrees with a page saying none is bound and contradicts a page naming
 * one. If nothing came back, the network is down and this says nothing either
 * way, which is the distinction that keeps an outage from reading as tampering.
 */
export function bound(
  answer: PromiseSettledResult<unknown>,
  claimed: string | null,
  reached: boolean,
  decode: (value: unknown) => string,
): Check {
  if (answer.status !== "rejected") {
    return read(answer, claimed, decode);
  }

  if (!reached) {
    return { failed: reason(answer.reason) };
  }

  return claimed === null
    ? { found: "not bound yet", matches: true }
    : { found: "no vault is bound", matches: false };
}

/**
 * The findings, folded back into the strip.
 *
 * A claim the check could not reach keeps whatever standing it arrived with,
 * which is unchecked. A digest we failed to ask about is not a digest that
 * failed, and a strip that could not tell the two apart would turn every
 * outage into an accusation.
 */
export function settle(proofs: Proof[], findings: Findings): Proof[] {
  const checks: Partial<Record<Claim, Check>> = {
    digest: findings.digest,
    phase: findings.phase,
    vault: findings.vault,
  };

  return proofs.map((proof) => {
    /* The address needs no separate call. If the contract answered at all, a
       contract exists at this address and it is the one the page named; that
       is the entire claim the row makes. */
    if (proof.key === "contract") {
      return { ...proof, standing: findings.reached ? ("verified" as const) : proof.standing };
    }

    const result = checks[proof.key];

    if (result === undefined || "failed" in result) {
      return proof;
    }

    return result.matches
      ? { ...proof, standing: "verified" as const }
      : { ...proof, standing: "broken" as const, found: legible(proof.key, result.found) };
  });
}

/**
 * What the contract said, in the same words the page used to say it.
 *
 * The phase comes back as a number and the page shows a name. Printing "4"
 * under a row that reads "Judging" would leave a reader comparing two things
 * that are not written in the same language.
 */
function legible(key: Claim, found: string): string {
  return key === "phase" ? phaseName(Number(found)) : found;
}

/**
 * Why the check could not be made, in words a reader can act on.
 *
 * An RPC node being unreachable is not the same as a digest not matching, and
 * collapsing the two would let a network problem read as tampering.
 */
function reason(error: unknown): string {
  const said = error instanceof Error ? error.message : String(error);
  return said.length > 120 ? `${said.slice(0, 117)}…` : said;
}
