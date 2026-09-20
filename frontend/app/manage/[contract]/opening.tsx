"use client";

import { useState } from "react";

import { CommitButton } from "../../components/commit-button";
import { arg, send } from "../../../lib/send";
import { TopUp } from "./top-up";
import type { Running } from "../../../lib/running";
import { units } from "../../../lib/money";
import type { Rules } from "../../../lib/rules";

/**
 * Everything between a written hackathon and an open one, as one decision.
 *
 * There were four screens here and none of them asked a question. Freezing the
 * rules, deploying the pot, moving the money in and opening the doors are all
 * consequences of the form that has already been filled in: no field, no
 * choice, nothing to weigh. Four screens that only ever want the same answer
 * are not four steps, they are one step wearing four hats, and an organizer
 * walking them had to work out afresh at each one what they had agreed to.
 *
 * So the four are run from a single press, and what replaces them is the thing
 * that actually deserved a screen: a plain reading of what is about to be
 * frozen, while it can still be changed.
 *
 * The wallet asks once. It used to ask six times, because six contract calls
 * really were signed and Soroban allows one call per transaction; the contract
 * now has a `set_up` entry point that runs all six inside a single invocation,
 * so the same work is authorized once. Nothing was loosened to do it: every
 * check those calls made is still made, by the same code, in the same order.
 */

/** The vault wasm already uploaded to the network, from `docs/deployments.md`. */
const VAULT_WASM = "afc98888d9321be76160951ce072b52f08c7f3a6a0e29ee1ac9e3c0aa4783ffb";

type StepId = "freeze" | "pot" | "money" | "open";

/**
 * The four moves, said as what they do rather than as what they are called.
 *
 * "Lock the rules", "bind the vault" and "publish" are the contract's words and
 * were on screen as though they were everybody's. Somebody running their first
 * hackathon does not know what a vault is and should not have to.
 */
const STEPS: { id: StepId; title: string; blurb: string }[] = [
  {
    id: "freeze",
    title: "Freeze the rules",
    blurb: "Hashed and written to the chain.",
  },
  {
    id: "pot",
    title: "Create the prize pot",
    blurb: "A separate contract, with no owner and no way to withdraw.",
  },
  {
    id: "money",
    title: "Move the prize money in",
    blurb: "From your wallet into the pot.",
  },
  {
    id: "open",
    title: "Open for sign-ups",
    blurb: "It goes live and people can join.",
  },
];

type Standing = "done" | "doing" | "waiting" | "failed";

/** A hex digest as the bytes the contract wants, without reaching for Buffer. */
function bytesOf(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g)?.map((pair) => parseInt(pair, 16)) ?? []);
}

export function Opening({
  contractId,
  running,
  rules,
  code,
  address,
  reread,
}: {
  contractId: string;
  running: Running & { phase: number };
  rules: Rules | null;
  /** The prize token's ticker, or empty when it is not one we recognise. */
  code: string;
  address: string;
  reread: () => Promise<void>;
}) {
  const [at, setAt] = useState<StepId | null>(null);
  const [failed, setFailed] = useState<StepId | null>(null);
  const [why, setWhy] = useState<string | null>(null);

  const busy = at !== null;
  const short = running.required - running.held;

  /*
    What is already behind us, read from the contract rather than remembered.

    A press that fails halfway leaves real work done: the rules may be frozen
    and the pot may exist. Deriving this from the chain means pressing again
    carries on from where it stopped instead of trying to freeze rules that are
    already frozen and failing on the first move every time.
  */
  function standingOf(step: StepId): Standing {
    if (failed === step) {
      return "failed";
    }

    if (at === step) {
      return "doing";
    }

    /* Still read from the chain rather than remembered, because a press that
       failed leaves real work done: the rules may be frozen and the pot may
       exist. The four are one signature now, but the contract skips whatever is
       already behind it, so this is what a second press would actually do. */
    const behind =
      step === "freeze"
        ? running.phase > 0
        : step === "pot"
          ? running.vault !== null
          : step === "money"
            ? short <= BigInt(0)
            : running.phase > 1;

    return behind ? "done" : "waiting";
  }

  async function open(): Promise<void> {
    setFailed(null);
    setWhy(null);
    setAt("freeze");

    /*
      A fresh salt on every press.

      The vault's address is derived from this contract and this salt, so one
      used before names a contract that already exists and the deploy inside
      `set_up` would fail on it. A run that got as far as standing the pot up
      never reaches the deploy again, because the contract skips it once a vault
      is bound; a run that failed before the binding does, and it needs
      somewhere new to put it.
    */
    const salt = crypto.getRandomValues(new Uint8Array(32));

    const outcome = await send(
      contractId,
      "set_up",
      [
        await arg.bytes32(bytesOf(VAULT_WASM)),
        await arg.bytes32(salt),
      ],
      address,
    );

    if (!outcome.ok) {
      setFailed("freeze");
      setWhy(outcome.why ?? "the wallet refused it");
      setAt(null);

      return;
    }

    setAt(null);
    await reread();
  }

  return (
    <div className="grid gap-8">
      {rules !== null && <Reading rules={rules} running={running} code={code} />}

      {/* Titled, because four greyed lines with circles beside them read as a
          list of things to go and do rather than as what one button is about to
          do. Numbered for the same reason. */}
      <div>
        <h3 className="text-[1.25rem] font-semibold text-ink">
          What happens when you press it
        </h3>

        <div className="mt-5 grid gap-4">
          {STEPS.map((step, at) => (
            <Move
              key={step.id}
              number={at + 1}
              step={step}
              standing={standingOf(step.id)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <CommitButton disabled={busy} onClick={() => void open()}>
          {busy ? "Signing" : failed !== null ? "Try again" : "Open the hackathon"}
        </CommitButton>

        <p className="max-w-[32rem] text-[0.9375rem] leading-relaxed text-ink-soft">
          One signature. Nothing is public until it lands.
        </p>
      </div>

      {why !== null && (
        <p className="text-[0.9375rem] leading-relaxed text-broken">
          Stopped at this step: {why}. Whatever was already done is done, so
          pressing again carries on from there.
        </p>
      )}
    </div>
  );
}

/** One move, numbered, and where it has got to. */
function Move({
  number,
  step,
  standing,
}: {
  number: number;
  step: { id: StepId; title: string; blurb: string };
  standing: Standing;
}) {
  return (
    <div className="flex items-start gap-4">
      {/* The number is the marker until the move is done, and the tick replaces
          it afterwards. Two separate things, a number and a state, would take
          two columns to say what one shape says here. */}
      <span
        aria-hidden
        className={`tabular mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.75rem] ${
          standing === "done"
            ? "bg-verified text-paper"
            : standing === "doing"
              ? "animate-pulse bg-ink text-paper"
              : standing === "failed"
                ? "bg-broken text-paper"
                : "text-ink-faint ring-1 ring-inset ring-rule"
        }`}
      >
        {standing === "done" ? "✓" : number}
      </span>

      <div className="min-w-0">
        <p
          className={`text-[1rem] font-semibold ${
            standing === "waiting" ? "text-ink-soft" : "text-ink"
          }`}
        >
          {step.title}
        </p>

        <p className="mt-0.5 max-w-[34rem] text-[0.9375rem] leading-relaxed text-ink-faint">
          {step.blurb}
        </p>
      </div>
    </div>
  );
}

/**
 * What is about to be frozen, in the words somebody would use to describe it.
 *
 * This is the screen the four it replaced never had. The rules are readable up
 * to the moment they are hashed and unreadable in any useful sense afterwards,
 * so the last chance to notice a wrong deadline is here.
 */
function Reading({
  rules,
  running,
  code,
}: {
  rules: Rules;
  running: Running & { phase: number };
  code: string;
}) {
  const fee = running.required - rules.total;

  /* What is still missing from the organizer's wallet, which is what the ramp
     above is asked to fetch. The step below deposits the whole requirement; the
     shortfall is what has to be bought first. */
  const short = running.required - running.held;

  return (
    <div className="grid gap-6">
      {/* Above the summary, because it is the step before it. An organizer who
          cannot fund the vault cannot do anything below, and finding that out
          at the deposit is finding it out too late to be useful. */}
      {running.prizeAsset !== null && short > BigInt(0) && (
        <TopUp assetContract={running.prizeAsset} needed={units(short)} />
      )}

    <section className="rounded-[1.25rem] bg-paper p-7 ring-1 ring-rule sm:p-9">
      {/* One sentence where there were three. What an organizer needs at this
          moment is the fact that it is permanent, not a paragraph explaining
          permanence to them. */}
      <h3 className="text-[1.25rem] font-semibold text-ink">Check this, then freeze it</h3>

      <p className="mt-2 max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        None of it can change afterwards. Cancelling is the only way out.
      </p>

      <dl className="mt-7 grid gap-x-10 gap-y-4 border-t border-rule pt-6 sm:grid-cols-2">
        <Line name="Prize money">
          {units(rules.total)} {code}
        </Line>

        <Line name="You will deposit">
          {units(running.required)} {code}
          {fee > BigInt(0) && (
            <span className="text-ink-soft">
              {" "}
              — the prizes plus {units(fee)} platform fee
            </span>
          )}
        </Line>

        <Line name="Categories">
          {rules.tracks.length === 1
            ? (rules.tracks[0]?.id ?? "One category")
            : `${rules.tracks.length} categories`}
        </Line>

        <Line name="Judges">
          {rules.judges === 1 ? "One judge" : `${rules.judges} judges`}
        </Line>

        <Line name="Sign-ups close">
          <Moment at={rules.schedule.registrationCloses} />
        </Line>

        <Line name="Build deadline">
          <Moment at={rules.schedule.submissionCloses} />
        </Line>

        <Line name="Judging ends">
          <Moment at={rules.schedule.judgingCloses} />
        </Line>

        <Line name="Winners can be paid">
          {rules.settlementDelay === 0
            ? "As soon as the ranking is done"
            : rules.settlementDelay >= 86_400
              ? `${Math.round(rules.settlementDelay / 86_400)} day(s) after the ranking`
              : `${Math.round(rules.settlementDelay / 3_600)} hour(s) after the ranking`}
        </Line>
      </dl>
    </section>
    </div>
  );
}

function Line({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="label text-[0.8125rem] text-ink-faint">{name}</dt>
      <dd className="text-[1rem] text-ink">{children}</dd>
    </div>
  );
}

/**
 * A moment in the reader's own clock.
 *
 * Hydration is suppressed because that is exactly what differs: the server
 * formats in its timezone and the browser in the visitor's, and the browser is
 * the one that is right. The alternative is showing UTC to somebody deciding
 * whether a deadline falls on their Sunday evening.
 */
function Moment({ at }: { at: number }) {
  return (
    <span suppressHydrationWarning>
      {at === 0
        ? "not set"
        : new Date(at * 1000).toLocaleString(undefined, {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
    </span>
  );
}
