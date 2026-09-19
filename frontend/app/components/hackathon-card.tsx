import Link from "next/link";

import { phaseName } from "../../lib/phase";
import type { HackathonSummary } from "../../lib/chain";

/**
 * One hackathon, as somebody deciding between several of them reads it.
 *
 * The banner runs across the top in its own proportions rather than down one
 * side. A banner is a wide image by nature, and standing one on its end means
 * cropping away most of what was drawn; keeping the shape it was made in also
 * leaves the card narrow enough that three sit side by side, which is the
 * number somebody actually compares at once.
 *
 * The card speaks in both voices, which is the point rather than a compromise.
 * The name and the tagline are a person's. The stage, the countdown and the
 * prize are the chain's, and they are set in the chain's type so a reader can
 * see at a glance which half of the card they could go and check themselves.
 *
 * Its edges are drawn on all four sides. Earlier these cards were separated by
 * the grid's own gaps showing through, which reads as a table when the rows are
 * even and as nothing at all when they are not.
 */

export function HackathonCard({ hackathon }: { hackathon: HackathonSummary }) {
  const running = hackathon.phase !== null && hackathon.phase >= 2 && hackathon.phase <= 7;
  const finished = hackathon.phase !== null && hackathon.phase >= 8;

  return (
    <Link
      href={`/hackathons/${hackathon.slug}`}
      className="group flex flex-col overflow-hidden border border-rule bg-paper transition-colors duration-150 ease-settle hover:border-ink-faint"
    >
      <Picture hackathon={hackathon} running={running} finished={finished} />

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-5 p-5">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            {hackathon.logo_url !== null && (
              /* The organizer's mark. A hackathon people have heard of is
                 recognised by it before the name is read. */
              <img
                src={hackathon.logo_url}
                alt=""
                width={32}
                height={32}
                className="size-8 shrink-0 rounded-[0.3rem] object-cover ring-1 ring-rule"
              />
            )}

            <h3 className="min-w-0 text-[1.25rem] leading-tight transition-colors group-hover:text-ink-soft">
              {hackathon.name}
            </h3>
          </div>

          {hackathon.tagline !== null && (
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
              {hackathon.tagline}
            </p>
          )}
        </div>

        <div>
          {(hackathon.location !== null || hackathon.tags.length > 0) && (
            <p className="label flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-faint">
              {hackathon.location !== null && <span className="text-ink-soft">{hackathon.location}</span>}

              {/* Separated by a middle dot rather than boxed. Three small
                  outlines competed with the row of figures underneath, which is
                  the part being compared. */}
              {hackathon.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="before:mr-2 before:content-['·']">
                  {tag}
                </span>
              ))}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-2 border-t border-rule pt-4">
            <p className="tabular text-[1.25rem] text-ink">
              {/* Absent rather than zero when the contract could not be reached.
                  A prize shown as nothing is a claim; a prize shown as unknown
                  is the truth. */}
              {hackathon.prize === null ? (
                <span className="label text-ink-faint">prize not readable</span>
              ) : (
                <>
                  {units(hackathon.prize)} <span className="label text-ink-faint">XLM</span>
                </>
              )}
            </p>

            <p className="label text-ink-soft">
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
 * Without one it is the diagonal hatch rather than an empty box, so a hackathon
 * whose organizer skipped an upload still has a card the same shape as the
 * others. A grid whose cells change size because of that is a grid that
 * punishes the wrong thing.
 */
function Picture({
  hackathon,
  running,
  finished,
}: {
  hackathon: HackathonSummary;
  running: boolean;
  finished: boolean;
}) {
  /* Two and a half to one, which is the shape a banner is drawn in. Fixing the
     ratio rather than the height also keeps every card in a row the same, so a
     grid does not go ragged because one image was a different size. */
  return (
    <div className="relative aspect-[5/2] overflow-hidden border-b border-rule">
      {hackathon.banner_url === null ? (
        <div className="hatch size-full" aria-hidden />
      ) : (
        <img
          src={hackathon.banner_url}
          alt=""
          className="size-full object-cover transition-transform duration-500 ease-settle group-hover:scale-[1.04]"
        />
      )}

      {/* Over the picture, because whether somebody can still enter is the
          first thing they look for and it should not move when a banner
          appears. */}
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
 * rather than a ticking clock. A counter updating every second would make this
 * page re-render forever for a figure nobody watches change.
 */
function Remaining({ closesAt, finished }: { closesAt: number | null; finished: boolean }) {
  if (finished) {
    return <>submissions closed</>;
  }

  if (closesAt === null) {
    return <>no deadline set</>;
  }

  const left = closesAt - Math.floor(Date.now() / 1000);

  if (left <= 0) {
    return <>submissions closed</>;
  }

  const days = Math.floor(left / 86_400);
  const hours = Math.floor((left % 86_400) / 3_600);

  return days > 0 ? (
    <>{days === 1 ? "1 day left" : `${days} days left`}</>
  ) : (
    <>{hours === 1 ? "1 hour left" : `${hours} hours left`}</>
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
