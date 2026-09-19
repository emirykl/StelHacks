"use client";

import { useState } from "react";

import { ProofStrip, type Proof } from "./proof-strip";
import { phaseName } from "../../lib/chain";
import { canCheck, check, type Check, type Claims, type Findings } from "../../lib/verify";

/**
 * The proof strip, with the button that makes it worth having.
 *
 * The strip on its own says four things a reader has to take our word for.
 * This wraps it in the one control that removes us from the arrangement: press
 * it and the browser asks the contract directly, then the strip says what the
 * contract answered.
 *
 * Nothing is checked before the press. Verifying on load would be faster and
 * would also be the product quietly doing the reader's job for them, which is
 * the one job it must not do.
 */

type Stage =
  | { at: "idle" }
  | { at: "asking" }
  | { at: "answered"; findings: Findings }
  | { at: "unreachable"; why: string };

export function CheckableProofStrip({
  contractId,
  claims,
  proofs,
}: {
  contractId: string;
  claims: Claims;
  proofs: Proof[];
}) {
  const [stage, setStage] = useState<Stage>({ at: "idle" });

  async function run() {
    setStage({ at: "asking" });

    try {
      const findings = await check(contractId, claims);

      /* Reaching nothing is not a result. Rendering the strip as if it had been
         checked, with every row still unchecked, would look like a check that
         found nothing wrong. */
      setStage(
        findings.reached
          ? { at: "answered", findings }
          : { at: "unreachable", why: "the contract did not answer" },
      );
    } catch (error) {
      setStage({
        at: "unreachable",
        why: error instanceof Error ? error.message : "the contract did not answer",
      });
    }
  }

  return (
    <div>
      <ProofStrip proofs={stage.at === "answered" ? settle(proofs, stage.findings) : proofs} />

      {canCheck() && (
        <div className="border-b border-rule bg-paper-sunk">
          <div className="mx-auto flex w-full max-w-[76rem] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
            <button
              type="button"
              onClick={run}
              disabled={stage.at === "asking"}
              className="label h-9 bg-ink px-4 text-paper transition-colors duration-150 ease-settle hover:bg-ink/85 active:translate-y-px disabled:opacity-50"
            >
              {stage.at === "asking" ? "Asking the contract" : "Check this yourself"}
            </button>

            <p className="text-[0.8125rem] leading-relaxed text-ink-soft">
              {said(stage)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * What the reader is told at each stage, and never more than is true.
 *
 * The idle sentence explains where the check goes, because a reader who thinks
 * the button asks our server has learned nothing from pressing it.
 */
function said(stage: Stage): string {
  switch (stage.at) {
    case "idle":
      return "Your browser asks the contract directly, over your own connection. Nothing goes through this site.";
    case "asking":
      return "Reading the contract.";
    case "unreachable":
      return `Nothing was checked: ${stage.why}`;
    case "answered":
      return "Checked from your browser just now.";
  }
}

/**
 * The findings, folded back into the strip.
 *
 * A claim the check could not reach stays unchecked rather than becoming
 * broken. A digest we failed to ask about is not a digest that failed, and a
 * strip that could not tell the two apart would turn every outage into an
 * accusation.
 */
function settle(proofs: Proof[], findings: Findings): Proof[] {
  const checks: Record<string, Check | undefined> = {
    "Rules digest": findings.digest,
    Stage: findings.phase,
    "Prize vault": findings.vault,
  };

  return proofs.map((proof) => {
    /* The address needs no separate call. If the contract answered at all, a
       contract exists at this address and it is the one the page named; that
       is the entire claim the row makes. */
    if (proof.label === "Hackathon contract") {
      return { ...proof, standing: findings.reached ? "verified" : proof.standing };
    }

    const result = checks[proof.label];

    if (result === undefined || "failed" in result) {
      return proof;
    }

    return result.matches
      ? { ...proof, standing: "verified" as const }
      : { ...proof, standing: "broken" as const, found: legible(proof.label, result.found) };
  });
}

/**
 * What the contract said, in the same words the page used to say it.
 *
 * The phase comes back as a number and the page shows a name. Printing "4"
 * under a row that reads "Judging" would leave a reader comparing two things
 * that are not written in the same language.
 */
function legible(label: string, found: string): string {
  return label === "Stage" ? phaseName(Number(found)) : found;
}
