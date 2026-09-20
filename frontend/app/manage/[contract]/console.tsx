"use client";

import { EXPLORER } from "../../../lib/explorer";
import { useCallback, useEffect, useState } from "react";

import { Button } from "../../components/primitives";
import { CommitButton } from "../../components/commit-button";
import { useWallet } from "../../components/wallet-context";
import { send, type Sent } from "../../../lib/send";
import { runningOf, type Running } from "../../../lib/running";
import { PHASES, phaseName } from "../../../lib/phase";
import { PRIZE_ASSETS } from "../../../lib/money";
import { Applications } from "./applications";
import { Screening } from "./screening";
import { Opening } from "./opening";
import { rulesFor, type Rules } from "../../../lib/rules";

/**
 * Getting a hackathon from written to open, one legal call at a time.
 *
 * The contract allows exactly one thing at each point and refuses everything
 * else, so this offers exactly one thing. A console of buttons that mostly fail
 * would be faster to build and would teach an organizer to distrust all of
 * them.
 *
 * What is shown comes from the contract rather than from our database, for the
 * same reason the participant flow does: a button that is wrong here costs a
 * signature and a fee to find out.
 */

export function Console({ contractId, slug }: { contractId: string; slug: string | null }) {
  const { wallet, known } = useWallet();
  const [running, setRunning] = useState<Running | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(Sent & { contractId?: string }) | null>(null);

  const reread = useCallback(async () => {
    /* Both together. The setup screen reads what is about to be frozen off the
       rules and what is still owed off the state, and showing one against a
       stale copy of the other is how a deposit figure ends up disagreeing with
       the prize table beside it. */
    const [state, written] = await Promise.all([runningOf(contractId), rulesFor(contractId)]);

    setRunning(state);
    setRules(written);
  }, [contractId]);

  useEffect(() => {
    void reread();
  }, [reread]);

  async function run(work: () => Promise<Sent & { contractId?: string }>) {
    setBusy(true);
    setResult(null);

    const outcome = await work();

    setResult(outcome.ok || !outcome.refused ? outcome : null);
    setBusy(false);

    if (outcome.ok) {
      await reread();
    }
  }

  if (!known || running === null) {
    return <p className="label text-ink-faint">Reading the contract</p>;
  }

  if (running.phase === null) {
    return (
      <p className="max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        Nothing has been created at this address yet. A hackathon starts on the
        create page, and this is where it continues afterwards.
      </p>
    );
  }

  /* Past the check above the phase is known, and saying so once here saves
     every reader below from re-establishing it. */
  const state = { ...running, phase: running.phase };

  const mine = wallet !== null && wallet.address === state.organizer;
  const funded = state.held >= state.required && state.required > BigInt(0);

  /*
    Whether the event is still being set up.

    There used to be a five step checklist here and a screen per step. None of
    the steps after the form asked a question, so what they measured was how
    many transactions the chain needs rather than anything the organizer
    decides. `Opening` is all of them at once.
  */
  const opening = state.phase < 2;
  const live = !opening;

  /* The ticker the prize is denominated in, so every amount on this page says
     what it is an amount of. Empty rather than guessed when the asset is not
     one we know: a wrong ticker beside a real balance is worse than none. */
  const code =
    PRIZE_ASSETS.find((asset) => asset.contract === state.prizeAsset)?.code ?? "";

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="text-[1.5rem] text-ink">{headline(state, funded)}</h2>

          <p className="label text-ink-faint">{phaseName(state.phase)}</p>
        </div>

        <div className="mt-7">
          {/* A funded event falls through to `Next` even for a stranger,
              because opening it for sign-ups is deliberately not the
              organizer's alone. Everything else about setting up is. */}
          {!mine && opening && !(state.phase === 1 && funded) ? (
            <p className="max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
              Only the organizer can move this on, and that is{" "}
              <span className="tabular text-[0.8125rem]">{state.organizer}</span>. Connect
              that wallet to continue.
            </p>
          ) : opening && mine && wallet !== null ? (
            <Opening
              contractId={contractId}
              running={state}
              rules={rules}
              code={code}
              address={wallet.address}
              reread={reread}
            />
          ) : (
            <Next
              running={state}
              funded={funded}
              contractId={contractId}
              code={code}
              address={wallet?.address ?? null}
              busy={busy}
              run={run}
            />
          )}
        </div>
      </Card>

      {/* Only once registration is open. Before that there is nothing to
          review, and a queue that is empty because the event has not started
          reads the same as one that is empty because nobody came. */}
      {state.phase >= 2 && state.phase <= 3 && (
        <Applications
          contractId={contractId}
          reviewer={mine ? (wallet?.address ?? null) : null}
        />
      )}

      {/* The judges have their own surface and the organizer is usually one of
          them, so the way in is here rather than in an email. */}
      {state.phase >= 3 && state.phase <= 4 && (
        <p className="text-[0.875rem] text-ink-soft">
          Judges score at{" "}
          <a
            href={`/judge/${contractId}`}
            className="tabular text-[0.8125rem] text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
          >
            /judge/{contractId.slice(0, 8)}…
          </a>
        </p>
      )}

      {/* Screening runs from the moment projects can arrive rather than only
          in the screening phase, because the entries are worth seeing while
          they come in and the contract decides for itself when striking one
          out is still allowed. */}
      {state.phase >= 2 && state.phase <= 3 && (
        <Screening
          contractId={contractId}
          organizer={mine ? (wallet?.address ?? null) : null}
        />
      )}

      {result !== null && (
        <p
          className={`max-w-[46rem] text-[0.875rem] leading-relaxed ${
            result.ok ? "text-verified" : "text-broken"
          }`}
        >
          {result.ok
            ? result.contractId === undefined
              ? "Done."
              : "The vault is on chain and bound to this hackathon."
            : result.why}
        </p>
      )}

      {/*
        The addresses, last and folded away.

        They are the reason any of this can be checked by somebody who does not
        trust us, so they are on the page. They are also the first thing that
        was on it, above everything an organizer actually came here to do, which
        made the console look like a diagnostic readout.
      */}
      <details className="group rounded-[1.25rem] bg-paper px-8 py-5 ring-1 ring-rule sm:px-10">
        <summary className="label cursor-pointer list-none text-ink-soft transition-colors duration-150 ease-settle hover:text-ink">
          On chain
        </summary>

        <div className="mt-5 space-y-4 border-t border-rule pt-5">
          <Address label="This hackathon" value={contractId} />

          {state.vault !== null && <Address label="Prize vault" value={state.vault} />}

          {live && slug !== null && (
            <p className="text-[0.8125rem] text-ink-soft">
              Public page at{" "}
              <a
                href={`/hackathons/${slug}`}
                className="text-ink underline decoration-rule underline-offset-4 transition-colors duration-150 ease-settle hover:decoration-ink"
              >
                /hackathons/{slug}
              </a>
            </p>
          )}
        </div>
      </details>
    </div>
  );
}

/** A card, the same one the create form is built from. */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[1.25rem] bg-paper p-8 ring-1 ring-rule sm:p-10">{children}</section>
  );
}

/** One contract address, labelled, because unlabelled they are indistinguishable. */
/**
 * A contract address, and a way to go and look at it.
 *
 * The address is the link rather than carrying one beside it. What somebody
 * wants from fifty six characters they cannot read is to check them against the
 * ledger, so the characters themselves are the thing to press.
 */
function Address({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="label text-[0.75rem] text-ink-faint">{label}</span>

      <a
        href={`https://stellar.expert/explorer/${EXPLORER}/contract/${value}`}
        target="_blank"
        rel="noreferrer"
        className="tabular break-all text-[0.75rem] text-ink-soft underline decoration-rule underline-offset-4 transition-colors duration-150 ease-settle hover:text-ink hover:decoration-ink"
      >
        {value}
      </a>
    </div>
  );
}

/** The single thing that can be done right now, and nothing else. */
function Next({
  running,
  funded,
  contractId,
  code,
  address,
  busy,
  run,
}: {
  running: Running & { phase: number };
  funded: boolean;
  contractId: string;
  /** The prize token's ticker, or empty when it is not one we recognise. */
  code: string;
  address: string | null;
  busy: boolean;
  run: (work: () => Promise<Sent & { contractId?: string }>) => Promise<void>;
}) {
  if (address === null) {
    return (
      <p className="max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        Connect a wallet to continue.
      </p>
    );
  }

  /*
    Funded, and somebody other than the organizer is looking at it.

    The organizer never lands here: setting up is one press on `Opening` and
    this stage is inside it. What reaches this branch is a stranger looking at a
    hackathon whose prize is already in the vault, and they are offered the
    button on purpose. Publishing is the one setup move the contract does not
    reserve to the organizer, so that an event with the money committed cannot
    be sat on.
  */
  if (running.phase === 1) {
    return (
      <div className="flex flex-wrap items-center gap-5">
        <Button
          disabled={busy}
          onClick={() => void run(() => send(contractId, "publish", [], address))}
        >
          {busy ? "Signing" : "Open for sign-ups"}
        </Button>

        <p className="max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
          The prize money is all in, so anybody can open this hackathon for
          sign-ups. It does not have to be the organizer.
        </p>
      </div>
    );
  }

  /*
    Reveal, not Finalization.

    The ranking is what ends the reveal rather than something done once
    finalization has been entered, and `advance_phase` refuses this stage
    outright because it has no closing deadline. Offering the generic move here
    is a button that always fails.
  */
  if (running.phase === 5) {
    return (
      <div className="flex flex-wrap items-center gap-5">
        <Button
          disabled={busy}
          onClick={() => void run(() => send(contractId, "finalize_results", [], address))}
        >
          {busy ? "Signing" : "Compute the ranking"}
        </Button>

        <p className="max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
          The contract ranks from the revealed scorecards using the formula that
          was locked. It will not accept a ranking from anywhere else.
        </p>
      </div>
    );
  }

  /* Finalization. Opening settlement is its own call rather than a phase move,
     because it also checks that the safety window announced before the lock
     has elapsed. */
  if (running.phase === 6) {
    return (
      <div className="flex flex-wrap items-center gap-5">
        <Button
          disabled={busy}
          onClick={() => void run(() => send(contractId, "open_settlement", [], address))}
        >
          {busy ? "Signing" : "Open settlement"}
        </Button>

        <p className="max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
          After this the vault pays. If the rules announced a safety window, it
          has to have passed first.
        </p>
      </div>
    );
  }

  /* Settlement. Paying is done from the results, by anybody; what is left here
     is closing the event once nothing is owed.

     The platform's cut is one of the things owed, and `complete` counts it
     alongside the prizes. Offering both buttons at once would put a failing one
     on screen, so the fee comes first and closing appears when it is paid. An
     event at a zero rate still passes through here: owing nothing is settled by
     saying so, not by being skipped. */
  if (running.phase === 7) {
    return running.feeSettled ? (
      <div className="flex flex-wrap items-center gap-5">
        <Button
          disabled={busy}
          onClick={() => void run(() => send(contractId, "complete", [], address))}
        >
          {busy ? "Signing" : "Close it"}
        </Button>

        <p className="max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
          Only once every prize has been handed over. The contract refuses to
          close a hackathon that still owes money, so this fails until the
          results page is clear.
        </p>
      </div>
    ) : (
      <div className="flex flex-wrap items-center gap-5">
        <Button
          disabled={busy}
          onClick={() => void run(() => send(contractId, "settle_platform_fee", [], address))}
        >
          {busy ? "Signing" : "Settle the platform fee"}
        </Button>

        <p className="max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
          The rate was written into the rules before they were frozen and is
          charged on top of the prize table, never out of it. At a zero rate this
          pays nobody and simply records that the event owes nothing.
        </p>
      </div>
    );
  }

  /* Running. The phase only moves when its deadline has passed, and the
     contract is the one that decides that. */
  if (running.phase < PHASES.length - 2) {
    return (
      <div className="flex flex-wrap items-center gap-5">
        <Button
          disabled={busy}
          onClick={() => void run(() => send(contractId, "advance_phase", [], address))}
        >
          {busy ? "Signing" : `Move to ${PHASES[running.phase + 1]}`}
        </Button>

        <p className="max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
          Only once this stage's deadline has passed. The contract refuses
          early, so pressing this before then costs a fee and changes nothing.
        </p>
      </div>
    );
  }

  return (
    <p className="max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
      This hackathon has come to rest. Nothing can change it now.
    </p>
  );
}

function headline(running: Running & { phase: number }, funded: boolean): string {
  switch (running.phase) {
    case 0:
    case 1:
      return "Set it up";
    case 5:
      return "Work out who won";
    case 6:
      return "Let the payouts begin";
    case 7:
      return "Pay and close";
    default:
      return running.phase >= PHASES.length - 2 ? "Finished" : "Move it on";
  }
}

