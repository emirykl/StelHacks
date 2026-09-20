"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "../../components/primitives";
import { arg, send } from "../../../lib/send";
import { reasonHash } from "../../../lib/applications";
import {
  carryForward,
  extendSchedule,
  orderProblem,
  scheduleOf,
  type Movable,
} from "../../../lib/schedule";

/**
 * Moving a deadline, inside the allowance that was announced before the lock.
 *
 * The rules are frozen and this does not change them. What it changes is the
 * schedule in force, and the gap between the two is the event trail: an
 * extension always reads as an extension rather than as rules that quietly say
 * something different. Three things bound it, all published before anybody
 * entered — how many times one deadline may move, how many seconds it may gain
 * in total, and that a deadline already passed is closed for good.
 *
 * That last one is the important one. An organizer who could read what arrived
 * and only then decide to give more time would be steering the result, so the
 * contract refuses it and this page says so rather than offering a button that
 * fails.
 *
 * The reason is required by the contract, not by this form. `extend_deadline`
 * will not take a call without a digest, for the same reason a refused
 * application will not: a discretionary act that leaves no trace is the quiet
 * back door the rest of the product exists to close.
 */

export function Schedule({
  contractId,
  organizer,
}: {
  contractId: string;
  /** The connected wallet when it is the organizer's, null otherwise. */
  organizer: string | null;
}) {
  const [found, setFound] = useState<Movable | null>(null);
  const [reading, setReading] = useState(true);
  const [moving, setMoving] = useState<number | null>(null);
  const [when, setWhen] = useState("");
  const [reason, setReason] = useState("");
  /* On by default, because a hackathon that runs late runs late at every stage.
     An organizer who means to move one deadline alone turns it off; one who
     leaves it alone gets the thing they almost certainly meant. */
  const [carry, setCarry] = useState(true);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const reread = useCallback(async () => {
    setFound(await scheduleOf(contractId).catch(() => null));
    setReading(false);
  }, [contractId]);

  useEffect(() => {
    void reread();
  }, [reread]);

  if (reading) {
    return <p className="label text-ink-faint">Reading the schedule</p>;
  }

  if (found === null) {
    return (
      <p className="max-w-[40rem] text-[1rem] leading-relaxed text-ink-soft">
        The schedule could not be read from the contract.
      </p>
    );
  }

  const { allowance } = found;
  const now = Math.floor(Date.now() / 1000);

  async function move(at: number) {
    if (organizer === null || found === null) {
      return;
    }

    const moment = Math.floor(new Date(when).getTime() / 1000);

    if (!Number.isFinite(moment)) {
      setSaid("That is not a moment.");
      return;
    }

    setBusy(true);
    setSaid(null);

    const digest = await reasonHash(reason.trim());
    const following = carry ? carryForward(at, moment, found.deadlines, now) : [];

    /* One call either way. The batched one exists for the run, so sending a run
       of one through it would be a longer argument for the same thing. */
    const outcome =
      following.length > 1
        ? await extendSchedule(contractId, following, digest, organizer)
        : await send(
            contractId,
            "extend_deadline",
            [await arg.u32(at), await arg.u64(BigInt(moment)), await arg.bytes32(digest)],
            organizer,
          );

    setBusy(false);

    if (!outcome.ok) {
      setSaid(outcome.why ?? "the wallet refused it");
      return;
    }

    setMoving(null);
    setWhen("");
    setReason("");
    setSaid(
      following.length > 1
        ? `Moved, and ${following.length - 1} later ${following.length === 2 ? "deadline" : "deadlines"} with it. The new moments are the ones in force from now on.`
        : "Moved. The new moment is the one in force from now on.",
    );

    await reread();
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[1.25rem] bg-paper p-6 ring-1 ring-rule sm:p-8">
        <h2 className="text-[1.25rem] font-semibold text-ink">The schedule in force</h2>

        <p className="mt-2 max-w-[42rem] text-[0.9375rem] leading-relaxed text-ink-soft">
          {allowance.times === 0
            ? "The rules announced no room to move any of these, so the schedule is final."
            : `Each of these may be moved ${allowance.times === 1 ? "once" : `${allowance.times} times`}, by up to ${hours(allowance.seconds)} in total. That allowance was published before anybody entered, and a deadline that has already passed cannot be moved at all.`}
        </p>

        <div className="mt-7 grid gap-1">
          {found.deadlines.map((deadline) => {
            /* A vote that was never enabled has no moment, and a row for it
               would be a deadline nobody has. */
            if (deadline.moment === 0) {
              return null;
            }

            const passed = now >= deadline.moment;
            const spent =
              deadline.timesMoved >= allowance.times ||
              deadline.secondsAdded >= allowance.seconds;

            return (
              <div key={deadline.at} className="border-b border-rule py-4 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <div>
                    <p className="text-[1rem] font-semibold text-ink">{deadline.name}</p>

                    <p className="mt-0.5 text-[0.9375rem] text-ink-soft">
                      <Moment at={deadline.moment} />
                      {deadline.timesMoved > 0 && (
                        <span className="text-ink-faint">
                          {" "}
                          · moved {deadline.timesMoved === 1 ? "once" : `${deadline.timesMoved} times`},
                          {" "}
                          {hours(deadline.secondsAdded)} gained
                        </span>
                      )}
                    </p>
                  </div>

                  {organizer !== null && allowance.times > 0 && (
                    <p className="label text-ink-faint">
                      {passed ? (
                        "Closed"
                      ) : spent ? (
                        "Allowance spent"
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setMoving(moving === deadline.at ? null : deadline.at);
                            setWhen(momentOf(deadline.moment));
                            setSaid(null);
                          }}
                          className="text-ink underline decoration-rule underline-offset-4 transition-colors duration-150 ease-settle hover:decoration-ink"
                        >
                          {moving === deadline.at ? "Cancel" : "Move it"}
                        </button>
                      )}
                    </p>
                  )}
                </div>

                {moving === deadline.at && (
                  <div className="mt-5 grid gap-4 rounded-[0.875rem] bg-paper-sunk p-5">
                    <label className="grid gap-2">
                      <span className="label text-[0.8125rem] font-semibold text-ink">
                        New moment
                      </span>

                      <input
                        type="datetime-local"
                        value={when}
                        onChange={(event) => setWhen(event.target.value)}
                        className="tabular h-12 w-full max-w-[20rem] rounded-[0.625rem] bg-paper px-4 text-[1rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-2 focus:ring-ink"
                      />

                      {(() => {
                        /* Said while the date is still being typed. The contract
                           checks the same thing and answers with a failed
                           transaction and a number, which is the worst moment
                           and the worst words to learn it in. */
                        const asked = Math.floor(new Date(when).getTime() / 1000);
                        const wrong = Number.isFinite(asked)
                          ? carry
                            ? null
                            : orderProblem(deadline.at, asked, found.deadlines)
                          : null;

                        if (wrong !== null) {
                          return <span className="text-[0.875rem] text-danger">{wrong}</span>;
                        }

                        return (
                          <span className="text-[0.875rem] text-ink-faint">
                            Later than it is now, and inside the published allowance.
                          </span>
                        );
                      })()}
                    </label>

                    {/* The ordinary case rather than an extra. Everything after
                        this deadline keeps its own gap and travels with it, so a
                        week added to the build window is a week added to the
                        rounds that follow rather than a week taken out of
                        them. */}
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={carry}
                        onChange={(event) => setCarry(event.target.checked)}
                        className="mt-1 size-4 accent-ink"
                      />

                      <span className="grid gap-1">
                        <span className="text-[0.9375rem] text-ink">
                          Move everything after it by the same amount
                        </span>

                        <span className="text-[0.875rem] text-ink-faint">
                          One signature for the whole run. Each deadline spends its own allowance,
                          and any that has already passed is left where it is.
                        </span>
                      </span>
                    </label>

                    <label className="grid gap-2">
                      <span className="label text-[0.8125rem] font-semibold text-ink">Why</span>

                      <textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value.slice(0, 2_000))}
                        rows={3}
                        placeholder="The venue lost power for three hours on Saturday night."
                        className="rounded-[0.625rem] bg-paper p-4 text-[1rem] leading-relaxed text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-2 focus:ring-ink"
                      />

                      <span className="text-[0.875rem] text-ink-faint">
                        Hashed and written to the chain with the move. Keep the words: the
                        digest is what anybody later checks them against.
                      </span>
                    </label>

                    <div>
                      <Button
                        disabled={busy || when.length === 0 || reason.trim().length === 0}
                        onClick={() => void move(deadline.at)}
                      >
                        {busy ? "Signing" : "Move the deadline"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {said !== null && (
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-ink-soft">{said}</p>
        )}
      </section>
    </div>
  );
}

/** A moment in the reader's own clock, which is the one a deadline is read in. */
function Moment({ at }: { at: number }) {
  return (
    <span suppressHydrationWarning className="tabular">
      {new Date(at * 1000).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </span>
  );
}

/** The same instant in the shape a datetime input takes. */
function momentOf(at: number): string {
  const date = new Date(at * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Seconds in the unit somebody would say them in. */
function hours(seconds: number): string {
  if (seconds >= 86_400) {
    const days = Math.round(seconds / 86_400);

    return `${days} day${days === 1 ? "" : "s"}`;
  }

  const count = Math.round(seconds / 3_600);

  return `${count} hour${count === 1 ? "" : "s"}`;
}
