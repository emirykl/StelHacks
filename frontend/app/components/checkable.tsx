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
    <ProofStrip
      proofs={stage.at === "answered" ? settle(proofs, stage.findings) : proofs}
      action={
        canCheck() ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-[0.8125rem] text-night-ink-soft">{said(stage)}</p>

            <button
              type="button"
              onClick={run}
              disabled={stage.at === "asking"}
              className="h-8 shrink-0 rounded-full bg-night-ink px-4 text-[0.8125rem] font-semibold text-night transition-colors duration-150 ease-settle hover:bg-night-ink/85 active:translate-y-px disabled:opacity-50"
            >
              {stage.at === "asking" ? "Asking" : "Check these"}
            </button>
          </div>
        ) : undefined
      }
    />
  );
}

/**
 * What the reader is told at each stage, and never more than is true.
 *
 * It sits beside the button rather than under a heading, so it has one line
 * and has to spend it saying what pressing the button changes. Everything else
 * that could be said about verification lives on `/how-it-works`.
 */
function said(stage: Stage): string {
  switch (stage.at) {
    case "idle":
      return "Our word for it so far. Read them from the contract instead:";
    case "asking":
      return "Reading the contract.";
    case "unreachable":
      return `Could not reach the contract: ${stage.why}.`;
    case "answered":
      return "Read from the contract by your browser, just now.";
  }
}
