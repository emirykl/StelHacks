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
 *
 * Each blurb is under half a line. They were a sentence each, and a sentence
 * each is a paragraph nobody reads beside a button they have already decided to
 * press: the title carries the move and the blurb only has to carry the one
 * thing the title leaves out.
 */
const STEPS: { id: StepId; title: string; blurb: string }[] = [
  {
    id: "freeze",
    title: "Freeze the rules",
    blurb: "Hashed onto the chain.",
  },
  {
    id: "pot",
    title: "Create the prize pot",
    blurb: "No owner, no withdrawals.",
  },
  {
    id: "money",
    title: "Move the prize money in",
    blurb: "From your wallet.",
  },
  {
    id: "open",
    title: "Open for sign-ups",
    blurb: "People can join.",
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
        <h3 className="text-[1.25rem] font-bold text-ink">What one press does</h3>

        <div className="mt-5 grid gap-4">
          {STEPS.map((step, at) => (
            <Move
              key={step.id}
              number={at + 1}
              step={step}
              standing={standingOf(step.id)}
              /* Staggered, so the four arrive in the order they will run in.
                 A tenth of a second apart is enough to be read as an order and
                 short enough that the whole list is there before somebody has
                 finished reading the heading above it. */
              after={at * 0.09}
            />
          ))}
        </div>
      </div>

      {/* Wrapped, because the grid around it would otherwise stretch a button
          that says one short thing across the whole column. */}
      <div className="flex">
        <CommitButton disabled={busy} onClick={() => void open()}>
          {busy ? "Signing" : failed !== null ? "Try again" : "Open the hackathon"}
        </CommitButton>
      </div>

      {why !== null && (
        <p className="text-[0.9375rem] leading-relaxed text-broken">
          Stopped: {why}. Pressing again carries on from where it stopped.
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
  after,
}: {
  number: number;
  step: { id: StepId; title: string; blurb: string };
  standing: Standing;
  /** Seconds to wait before this line arrives, so the four arrive in order. */
  after: number;
}) {
  return (
    <div className="rise flex items-start gap-4" style={{ animationDelay: `${after}s` }}>
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
          className={`text-[1rem] font-bold ${
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
        <TopUp assetContract={running.prizeAsset} needed={short} />
      )}

    <section className="rounded-[1.25rem] bg-paper p-7 ring-1 ring-rule sm:p-9">
      {/* Half a line where there were three. What an organizer needs at this
          moment is the fact that it is permanent, not a paragraph explaining
          permanence to them. */}
      <h3 className="text-[1.25rem] font-bold text-ink">Check this, then freeze it</h3>

      <p className="mt-2 max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        Only cancelling undoes it.
      </p>

      <dl className="mt-7 grid gap-x-10 gap-y-4 border-t border-rule pt-6 sm:grid-cols-2">
        <Line name="Prizes">
          {units(rules.total)} {code}
        </Line>

        {/* The cut is said as a rate and as an amount on its own line, because
            they answer different questions. "750" tells an organizer what
            leaves their wallet; "5%" tells them whether that is the deal they
            agreed to, and a rate buried mid-sentence beside the total was being
            read as neither. */}
        <Line
          name="You deposit"
          note={
            fee > BigInt(0)
              ? `Prizes plus ${units(fee)}${code.length > 0 ? ` ${code}` : ""} platform fee${
                  rules.platformFeeBps > 0 ? ` (${percent(rules.platformFeeBps)})` : ""
                }`
              : null
          }
        >
          {units(running.required)} {code}
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

        <Line name="Payout">
          {rules.settlementDelay === 0
            ? "Right after ranking"
            : rules.settlementDelay >= 86_400
              ? `${Math.round(rules.settlementDelay / 86_400)}d after ranking`
              : `${Math.round(rules.settlementDelay / 3_600)}h after ranking`}
        </Line>
      </dl>
    </section>
    </div>
  );
}

function Line({
  name,
  note,
  children,
}: {
  name: string;
  /** What the figure above is made of, when it is made of more than one thing. */
  note?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      {/* Spelled out rather than reaching for `.label`, because this one is
          bigger and heavier than a label anywhere else on the site: it is
          naming a term that is about to become permanent, and it has to be
          scannable by somebody checking eight of them one last time. */}
      <dt className="text-[0.875rem] font-bold tracking-[0.045em] text-ink-soft uppercase">
        {name}
      </dt>
      {/* The note lives inside the `dd` rather than beside it: a `dl` may hold
          only terms and descriptions, and the breakdown is part of the figure
          it sits under. */}
      <dd className="text-[1.0625rem] text-ink">
        {children}

        {note !== undefined && note !== null && (
          <span className="mt-0.5 block text-[0.875rem] text-ink-faint">{note}</span>
        )}
      </dd>
    </div>
  );
}

/** Basis points as somebody says them, without a trailing zero. */
function percent(bps: number): string {
  return `${String(Number((bps / 100).toFixed(2)))}%`;
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
