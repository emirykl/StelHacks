"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

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

  const settled = stage.at === "answered" ? settle(proofs, stage.findings) : proofs;
  const held = stage.at === "answered" && settled.every((p) => p.standing === "verified");

  return (
    <ProofStrip
      proofs={settled}
      action={
        canCheck() ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/*
              A check that finds everything in order used to leave the bar
              looking exactly as it did before: four dots changed colour, a
              sentence changed wording, and the button still read "Check these".
              People pressed it, waited, and concluded it was broken.

              So the answer replaces the control rather than sitting beside it.
              A green badge where a white button was is a change nobody can miss,
              and pressing again is still there for anybody who wants it.
            */}
            {held ? (
              <Settled onAgain={() => void run()} />
            ) : (
              <>
                <p className="text-[0.875rem] text-ink-soft">{said(stage)}</p>

                <button
                  type="button"
                  onClick={() => void run()}
                  disabled={stage.at === "asking"}
                  className="h-8 shrink-0 rounded-full px-4 text-[0.875rem] text-ink ring-1 ring-inset ring-rule transition-colors duration-150 ease-settle hover:bg-paper-sunk active:translate-y-px disabled:opacity-50"
                >
                  {stage.at === "asking"
                    ? "Reading the contract"
                    : stage.at === "unreachable"
                      ? "Try again"
                      : "Check these"}
                </button>
              </>
            )}
          </div>
        ) : undefined
      }
    />
  );
}

/**
 * The answer, arriving where the button was.
 *
 * It fades and scales in rather than appearing, because the whole point is that
 * a reader who pressed something sees something happen. The movement is short
 * enough to read as a settle rather than an entrance, and it is skipped for
 * anybody who has asked their system to stop animating things.
 */
function Settled({ onAgain }: { onAgain: () => void }) {
  const still = useReducedMotion();

  return (
    <div className="flex items-center gap-3">
      <motion.span
        initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 460, damping: 30 }}
        className="flex h-8 shrink-0 items-center gap-2 rounded-full bg-verified px-3.5 text-[0.875rem] font-semibold text-paper"
      >
        <Tick />
        All four match the contract
      </motion.span>

      <button
        type="button"
        onClick={onAgain}
        className="text-[0.875rem] text-night-ink-soft underline decoration-night-rule underline-offset-4 transition-colors duration-150 ease-settle hover:text-night-ink"
      >
        Check again
      </button>
    </div>
  );
}

/** Drawn rather than a character, so it keeps its weight beside the label. */
function Tick() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3 shrink-0"
    >
      <path d="M2 6.4 4.7 9 10 3.2" />
    </svg>
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
      return "So far these are ours to claim. Ask the contract yourself:";
    case "asking":
      return "Reading the contract.";
    case "unreachable":
      return `Could not reach the contract: ${stage.why}.`;
    case "answered":
      return "Read from the contract by your browser, just now.";
  }
}
