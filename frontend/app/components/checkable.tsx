"use client";

import { useState } from "react";

import { ProofStrip, type Proof } from "./proof-strip";
import { canCheck, check } from "../../lib/verify";
import { settle, type Claims, type Findings } from "../../lib/verdict";

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
          <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-3 px-6 py-5 sm:flex-row sm:items-start sm:gap-6">
            <button
              type="button"
              onClick={run}
              disabled={stage.at === "asking"}
              className="h-10 shrink-0 bg-ink px-5 text-[0.875rem] font-semibold text-paper transition-colors duration-150 ease-settle hover:bg-ink/85 active:translate-y-px disabled:opacity-50"
            >
              {stage.at === "asking" ? "Asking the contract" : "Check the four myself"}
            </button>

            <p className="max-w-[52rem] text-[0.875rem] leading-relaxed text-ink-soft">
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
 * The idle sentence has to do the whole job of explaining the button, because
 * it is the only thing anybody reads before deciding whether to press it. It
 * said "Your browser asks the contract. Nothing goes through us." for a while,
 * which is accurate and answers a question nobody had yet. What somebody
 * actually wants to know is what pressing this changes: it goes and looks, and
 * then those four lines above stop being our word for it.
 */
function said(stage: Stage): string {
  switch (stage.at) {
    case "idle":
      return "This does not send anything to us. Your browser connects straight to the Stellar network, reads the four values out of the contract, and compares them with what this page just told you. If we had changed a rule or moved a deadline, the line above would turn red and show you what the contract actually says.";
    case "asking":
      return "Connecting to the network and reading the contract.";
    case "unreachable":
      return `Nothing was checked, so nothing above has changed: ${stage.why}. That is a network problem rather than a sign anything is wrong with this hackathon.`;
    case "answered":
      return "Checked just now, by your own browser, against the contract. The result is on each line above.";
  }
}
