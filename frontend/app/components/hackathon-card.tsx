import Link from "next/link";

import { phaseName } from "../../lib/phase";
import type { HackathonSummary } from "../../lib/chain";

/**
 * One hackathon, as a card somebody decides on.
 *
 * Two facts decide it and everything else is context: what stage the event is
 * at, and how much is actually in the vault. So those are the two things set
 * large, and the name is the only thing above them.
 *
 * The card speaks in both voices, which is the point rather than a compromise.
 * The name is a person's; the stage and the prize are the chain's, and they are
 * set in the chain's type so a reader can see at a glance which half of the
 * card they could go and check for themselves.
 *
 * Square, hairline, no shadow. A card that floats is claiming a depth this
 * layout does not have, and the grid reads as a table of facts rather than a
 * shelf of adverts.
 */

export function HackathonCard({ hackathon }: { hackathon: HackathonSummary }) {
  const running = hackathon.phase !== null && hackathon.phase >= 2 && hackathon.phase <= 7;
  const finished = hackathon.phase === 8 || hackathon.phase === 9;

  return (
    <Link
      href={`/hackathons/${hackathon.slug}`}
      className="group flex flex-col justify-between gap-8 border border-rule bg-paper p-6 transition-colors duration-150 ease-settle hover:border-rule-strong"
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <span
            className={`label ${
              running
                ? "text-signal-deep dark:text-signal"
                : finished
                  ? "text-ink-faint"
                  : "text-ink-soft"
            }`}
          >
            {phaseName(hackathon.phase)}
          </span>

          {/* A dot rather than a word. On a grid the eye is looking for which
              ones are live, and a shape answers that before any label does. */}
          {running && (
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-signal-deep dark:bg-signal"
            />
          )}
        </div>

        <h3 className="mt-5 text-[1.5rem] leading-tight transition-colors group-hover:text-ink-soft">
          {hackathon.name}
        </h3>

        {hackathon.tagline !== null && (
          <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-soft">
            {hackathon.tagline}
          </p>
        )}
      </div>

      <div className="border-t border-rule pt-4">
        <p className="label text-ink-faint">Prize</p>

        <p className="mt-1.5 tabular text-[1.375rem] text-ink">
          {/* Absent rather than zero when the contract could not be reached. A
              prize shown as nothing is a claim; a prize shown as unknown is
              the truth. */}
          {hackathon.prize === null ? (
            <span className="label text-ink-faint">not readable</span>
          ) : (
            <>
              {units(hackathon.prize)} <span className="label text-ink-faint">XLM</span>
            </>
          )}
        </p>
      </div>
    </Link>
  );
}

/** Seven decimals, with the fraction kept so a small prize never reads as none. */
function units(amount: bigint): string {
  const scale = BigInt(10_000_000);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(7, "0").replace(/0+$/, "");

  return fraction.length === 0
    ? whole.toLocaleString("en-US")
    : `${whole.toLocaleString("en-US")}.${fraction}`;
}
