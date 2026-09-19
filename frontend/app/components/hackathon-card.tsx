import Link from "next/link";

import { phaseName } from "../../lib/phase";
import type { HackathonSummary } from "../../lib/chain";

/**
 * One hackathon, as somebody deciding between six of them reads it.
 *
 * The order is the order the decision is made in: can I still get in, what is
 * it, how long have I got, and what is it worth. Everything else is context and
 * sits between those.
 *
 * The card speaks in both voices, which is the point rather than a compromise.
 * The name and the tagline are a person's. The stage, the countdown and the
 * prize are the chain's, and they are set in the chain's type so a reader can
 * see at a glance which half of the card they could go and check themselves.
 *
 * Square, hairline, no shadow. A card that floats claims a depth this layout
 * does not have, and the grid should read as a table of facts rather than a
 * shelf of adverts.
 */

export function HackathonCard({ hackathon }: { hackathon: HackathonSummary }) {
  const running = hackathon.phase !== null && hackathon.phase >= 2 && hackathon.phase <= 7;
  const finished = hackathon.phase !== null && hackathon.phase >= 8;

  return (
    <Link
      href={`/hackathons/${hackathon.slug}`}
      className="group flex flex-col bg-paper transition-colors duration-150 ease-settle hover:bg-paper-sunk"
    >
      <Banner hackathon={hackathon} running={running} finished={finished} />

      <div className="flex flex-1 flex-col justify-between gap-6 p-6">
        <div>
          <div className="flex items-start gap-3">
            {hackathon.logo_url !== null && (
              /* The organizer's mark, square and small. A hackathon people have
                 heard of is recognised by it before the name is read. */
              <img
                src={hackathon.logo_url}
                alt=""
                width={36}
                height={36}
                className="size-9 shrink-0 rounded-[0.35rem] object-cover ring-1 ring-rule"
              />
            )}

            <h3 className="text-[1.375rem] leading-tight transition-colors group-hover:text-ink-soft">
              {hackathon.name}
            </h3>
          </div>

          {hackathon.tagline !== null && (
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
              {hackathon.tagline}
            </p>
          )}

          {(hackathon.location !== null || hackathon.tags.length > 0) && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              {hackathon.location !== null && (
                <span className="label text-ink-soft">{hackathon.location}</span>
              )}

              {/* Three at most. A card that lists eight subjects has told a
                  reader nothing about which one it is really about. */}
              {hackathon.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="label px-2 py-1 text-ink-faint ring-1 ring-inset ring-rule"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-rule pt-4">
          <div>
            <p className="label text-ink-faint">Prize</p>

            <p className="mt-1.5 tabular text-[1.25rem] text-ink">
              {/* Absent rather than zero when the contract could not be reached.
                  A prize shown as nothing is a claim; a prize shown as unknown
                  is the truth. */}
              {hackathon.prize === null ? (
                <span className="label text-ink-faint">not readable</span>
              ) : (
                <>
                  {units(hackathon.prize)} <span className="label text-ink-faint">XLM</span>
                </>
              )}
            </p>
          </div>

          <div>
            <p className="label text-ink-faint">Submissions</p>

            <p className="mt-1.5 tabular text-[1.25rem] text-ink">
              <Remaining closesAt={hackathon.closesAt} finished={finished} />
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

/**
 * The top of the card, and the only place a picture is allowed.
 *
 * Without one it is a band of the diagonal hatch rather than an empty box, so a
 * hackathon with no banner still has a card the same shape as the others. A
 * grid whose rows change height because somebody skipped an upload is a grid
 * that punishes the organizer for the wrong thing.
 */
function Banner({
  hackathon,
  running,
  finished,
}: {
  hackathon: HackathonSummary;
  running: boolean;
  finished: boolean;
}) {
  return (
    <div className="relative h-32 overflow-hidden border-b border-rule">
      {hackathon.banner_url === null ? (
        <div className="hatch size-full" aria-hidden />
      ) : (
        <img
          src={hackathon.banner_url}
          alt=""
          className="size-full object-cover transition-transform duration-500 ease-settle group-hover:scale-[1.03]"
        />
      )}

      {/* Over the image rather than under it, because whether somebody can
          still enter is the first thing they are looking for and it should not
          move down the card when a banner appears. */}
      <span
        className={`label absolute left-3 top-3 flex items-center gap-2 px-2.5 py-1.5 ${
          running
            ? "bg-signal text-signal-ink"
            : finished
              ? "bg-night text-night-ink"
              : "bg-paper text-ink ring-1 ring-inset ring-rule"
        }`}
      >
        {running && <span aria-hidden className="size-1.5 rounded-full bg-signal-ink" />}
        {phaseName(hackathon.phase)}
      </span>
    </div>
  );
}

/**
 * How long is left, which is the number that decides whether to start tonight.
 *
 * Rendered on the server from the contract's own deadline, so it is a date
 * rather than a ticking clock. A counter that updates every second would make
 * this page re-render forever for a figure nobody watches change.
 */
function Remaining({ closesAt, finished }: { closesAt: number | null; finished: boolean }) {
  if (finished) {
    return <span className="label text-ink-faint">closed</span>;
  }

  if (closesAt === null) {
    return <span className="label text-ink-faint">not set</span>;
  }

  const left = closesAt - Math.floor(Date.now() / 1000);

  if (left <= 0) {
    return <span className="label text-ink-faint">closed</span>;
  }

  const days = Math.floor(left / 86_400);
  const hours = Math.floor((left % 86_400) / 3_600);

  return (
    <>
      {days > 0 ? days : hours}{" "}
      {/* No "not open" beside it. The badge on the banner already says which
          stage this is, and a second answer to the same question in different
          words reads as a different question. */}
      <span className="label text-ink-faint">
        {days > 0 ? (days === 1 ? "day left" : "days left") : hours === 1 ? "hour left" : "hours left"}
      </span>
    </>
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
