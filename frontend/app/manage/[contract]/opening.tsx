"use client";

import { useState } from "react";

import { CommitButton } from "../../components/commit-button";
import { arg, deploy, send, type Sent } from "../../../lib/send";
import { prizeAssetOf, type Running } from "../../../lib/running";
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
 * The wallet still asks six times, because six transactions really are signed
 * and pretending otherwise would be lying about what is happening to somebody's
 * key. What changes is that they are six signatures inside one flow rather than
 * six presses spread over four pages.
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
    blurb: "Your rules are hashed and written to the chain. Nobody can change them after this.",
  },
  {
    id: "pot",
    title: "Create the prize pot",
    blurb: "A separate contract that holds the money. It has no owner and no way to withdraw.",
  },
  {
    id: "money",
    title: "Move the prize money in",
    blurb: "Straight from your wallet into the pot, where it waits for the winners.",
  },
  {
    id: "open",
    title: "Open for sign-ups",
    blurb: "The hackathon goes live and people can join.",
  },
];

type Standing = "done" | "doing" | "waiting" | "failed";

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

    /* Carried locally because the read behind `running` is not refreshed
       between moves, and the pot's address is needed by the two moves after the
       one that creates it. */
    let vault = running.vault;

    function stop(step: StepId, outcome: Sent): boolean {
      if (outcome.ok) {
        return false;
      }

      setFailed(step);
      setWhy(outcome.why ?? "the wallet refused it");
      setAt(null);

      return true;
    }

    if (running.phase === 0) {
      setAt("freeze");

      if (stop("freeze", await send(contractId, "lock_rules", [], address))) {
        return;
      }
    }

    if (vault === null) {
      setAt("pot");

      const asset = await prizeAssetOf(contractId);

      if (asset === null) {
        setFailed("pot");
        setWhy("the rules do not name a prize asset");
        setAt(null);

        return;
      }

      /*
        Three signatures, in this order, because each needs the one before.

        The pot is deployed empty: its `create` is an ordinary entry point
        rather than a constructor, so handing the arguments to the deployment
        fails inside the wasm. Then it is told which hackathon and which token
        it serves. Only then can the hackathon be pointed at it, and it checks
        the binding from both sides, so a pot built for a different event is
        refused here rather than discovered when it is time to pay.
      */
      const built = await deploy(VAULT_WASM, [], address);

      if (stop("pot", built) || built.contractId === undefined) {
        return;
      }

      vault = built.contractId;

      const started = await send(
        vault,
        "create",
        [await arg.address(contractId), await arg.address(asset)],
        address,
      );

      if (stop("pot", started)) {
        return;
      }

      if (stop("pot", await send(contractId, "bind_vault", [await arg.address(vault)], address))) {
        return;
      }
    }

    if (short > BigInt(0) && vault !== null) {
      setAt("money");

      const paid = await send(
        vault,
        "deposit",
        [await arg.address(address), await arg.i128(short)],
        address,
      );

      if (stop("money", paid)) {
        return;
      }
    }

    setAt("open");

    if (stop("open", await send(contractId, "publish", [], address))) {
      return;
    }

    setAt(null);
    await reread();
  }

  return (
    <div className="grid gap-8">
      {rules !== null && <Reading rules={rules} running={running} code={code} />}

      <div className="grid gap-5">
        {STEPS.map((step) => (
          <Move key={step.id} step={step} standing={standingOf(step.id)} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <CommitButton disabled={busy} onClick={() => void open()}>
          {busy ? "Signing" : failed !== null ? "Try again" : "Open the hackathon"}
        </CommitButton>

        <p className="max-w-[32rem] text-[0.875rem] leading-relaxed text-ink-soft">
          Your wallet will ask you to sign a few times, once for each move above.
          Nothing is public until the last one.
        </p>
      </div>

      {why !== null && (
        <p className="text-[0.875rem] leading-relaxed text-broken">
          Stopped at this step: {why}. Whatever was already done is done, so
          pressing again carries on from there.
        </p>
      )}
    </div>
  );
}

/** One move, and where it has got to. */
function Move({
  step,
  standing,
}: {
  step: { id: StepId; title: string; blurb: string };
  standing: Standing;
}) {
  return (
    <div className="flex items-start gap-4">
      <span
        aria-hidden
        className={
          standing === "done"
            ? "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[0.625rem] text-paper"
            : standing === "doing"
              ? "mt-1 h-5 w-5 shrink-0 animate-pulse rounded-full bg-ink"
              : standing === "failed"
                ? "mt-1 h-5 w-5 shrink-0 rounded-full bg-broken"
                : "mt-1 h-5 w-5 shrink-0 rounded-full ring-1 ring-inset ring-rule"
        }
      >
        {standing === "done" ? "✓" : ""}
      </span>

      <div className="min-w-0">
        <p
          className={
            standing === "waiting"
              ? "text-[0.9375rem] text-ink-faint"
              : "text-[0.9375rem] text-ink"
          }
        >
          {step.title}
        </p>

        <p className="mt-1 max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
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

  return (
    <section className="rounded-[1.25rem] bg-paper p-7 ring-1 ring-rule sm:p-9">
      <p className="label text-ink-soft">Before you do</p>

      <p className="mt-3 max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink">
        Everything below is about to be written to the chain and frozen. After
        that you cannot change a prize, a deadline, a judge or a scoring rule.
        The only thing left is cancelling the whole event.
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
  );
}

function Line({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="label text-[0.75rem] text-ink-faint">{name}</dt>
      <dd className="text-[0.9375rem] text-ink">{children}</dd>
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
