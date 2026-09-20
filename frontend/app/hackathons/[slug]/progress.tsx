"use client";

import { useEffect, useState } from "react";

import { PHASES } from "../../../lib/phase";
import type { Rules } from "../../../lib/rules";

/**
 * Where a hackathon has got to, and how long the current stage has left.
 *
 * Everybody sees this, not only the organizer. Somebody deciding whether to
 * enter, a judge wondering if scoring has opened and a spectator waiting on a
 * result are all asking the same question, and before this they each had to
 * work it out from a schedule table further down the page.
 *
 * The stage comes from the contract and the deadline comes from the frozen
 * rules, which means the two can disagree: a phase only moves when somebody
 * calls `advance_phase`, so a deadline can pass while the contract still says
 * the old stage. That gap is shown rather than hidden. Counting down to a
 * moment that has already gone, or quietly drawing the next stage as though it
 * had started, would both be this page claiming something the chain does not
 * say.
 */

/**
 * The stages from a participant's side, in order.
 *
 * Draft and Funding are missing on purpose. They are the organizer writing the
 * rules and moving the prize money in, which happens before anybody can see the
 * event at all, so listing them told a visitor about two steps they had never
 * been able to take part in and could no longer watch.
 */
const WALK = [2, 3, 4, 5, 6, 7, 8] as const;

/** What each stage is called to somebody who does not read the contract. */
const SPOKEN: Record<number, string> = {
  2: "Open",
  3: "Entry check",
  4: "Judging",
  5: "Reveal",
  6: "Ranking",
  7: "Paying out",
  8: "Finished",
};

/**
 * The moment that ends a stage, or absent when nothing but a person ends it.
 *
 * Reveal, ranking and settlement have no deadline in the rules: they end when
 * the organizer computes the ranking, opens settlement and closes the event.
 * Those stages get no countdown because there is no honest number to show.
 */
function deadlineOf(phase: number, rules: Rules): number | null {
  const { schedule } = rules;

  switch (phase) {
    case 2:
      return schedule.submissionCloses;
    case 3:
      return schedule.screeningCloses;
    case 4:
      return schedule.judgingCloses;
    default:
      return null;
  }
}

/**
 * What that deadline is the deadline for.
 *
 * Said rather than left as "this stage". Two clocks run on this page and they
 * count to different moments: this one to the end of the stage, the rail's to
 * the end of registration, which closes first. Both were right and neither said
 * which, so the pair read as one number contradicting itself.
 */
function deadlineName(phase: number): string {
  switch (phase) {
    case 2:
      return "left to submit";
    case 3:
      return "left in entry check";
    case 4:
      return "left to judge";
    default:
      return "left in this stage";
  }
}

/** A gap in the units somebody would say it in, largest two only. */
function spoken(seconds: number): string {
  const day = Math.floor(seconds / 86_400);
  const hour = Math.floor((seconds % 86_400) / 3_600);
  const minute = Math.floor((seconds % 3_600) / 60);
  const second = seconds % 60;

  if (day > 0) {
    return `${day}d ${hour}h`;
  }

  if (hour > 0) {
    return `${hour}h ${minute}m`;
  }

  if (minute > 0) {
    return `${minute}m ${second}s`;
  }

  return `${second}s`;
}

export function Progress({ phase, rules }: { phase: number | null; rules: Rules | null }) {
  /*
    Ticking is done here rather than rendered once on the server, because a
    countdown drawn at request time is wrong by however long the page stays
    open. Started at null and filled in after mount so the server and the first
    client render agree; a clock read during rendering differs between the two
    and React calls that a hydration error.
  */
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));

    const beat = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);

    return () => clearInterval(beat);
  }, []);

  if (phase === null || rules === null) {
    return null;
  }

  /* Before it opens there is no stage a visitor is waiting through, and the
     rail would be seven words with none of them marked. The page says where
     things stand in its own words at that point. */
  if (phase < 2) {
    return null;
  }

  /* Cancelled is not a stage on the way to anywhere, so the rail would be a row
     of steps none of which will ever happen. */
  if (phase === 9) {
    return (
      <section className="border-b border-rule bg-paper">
        <div className="mx-auto w-full max-w-[75rem] px-6 py-5">
          <p className="label text-broken">Cancelled</p>
        </div>
      </section>
    );
  }

  const deadline = deadlineOf(phase, rules);
  const left = deadline === null || now === null ? null : deadline - now;

  return (
    <section className="border-b border-rule bg-paper">
      <div className="mx-auto flex w-full max-w-[75rem] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 py-3">
        {/*
          Set as a specification line rather than as a picture of a journey.

          It has been a row of pills, then a row of words joined by rules, then
          the same words with one underlined, and each version was an attempt to
          draw the idea of progress. The page already speaks in capitals and
          hairlines everywhere it reports what the chain holds, and this is one
          more thing the chain holds. So it is stated in that voice: the stages
          in order, the one we are in bracketed, and nothing drawn at all.

          Allowed to scroll rather than wrap, because a stage list that reflows
          into two rows stops reading as an order.
        */}
        <ol className="label flex min-w-0 flex-1 items-center gap-x-4 overflow-x-auto text-[0.6875rem]">
          {WALK.map((step) => (
            <li
              key={step}
              aria-current={step === phase ? "step" : undefined}
              className={`shrink-0 ${
                step === phase
                  ? "text-ink"
                  : step < phase
                    ? "text-ink-soft"
                    : "text-ink-faint"
              }`}
            >
              {step === phase ? `[ ${SPOKEN[step] ?? PHASES[step]} ]` : (SPOKEN[step] ?? PHASES[step])}
            </li>
          ))}
        </ol>

        {/* The countdown, when the current stage has one. */}
        {left !== null && (
          <p className="label shrink-0 text-[0.6875rem] text-ink-soft">
            {left > 0 ? (
              <>
                <span className="text-ink">{spoken(left)}</span> {deadlineName(phase)}
              </>
            ) : (
              /* The deadline has gone but the contract has not been told. Said
                 plainly, because the alternative is a page that looks stuck. */
              <>Deadline passed &middot; waiting on the organizer</>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
