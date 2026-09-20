"use client";

import { Switcher } from "./switcher";
import { TokenMark } from "../../components/token";

/**
 * The hackathon, at the top of its own panel, in the shape the public page uses.
 *
 * The two are the same event seen from two sides, so they are the same object
 * to look at: the banner and the mark and the name on one side, a bordered rail
 * of facts on the other. What differs is which facts. A visitor is deciding
 * whether to enter, so theirs are the prize, the clock and the way in; an
 * organizer is checking on something they already own, so theirs are how many
 * came, how much is entered, and where the event has got to.
 *
 * The counts lead because they are the reason somebody opens this page. An
 * answer you have to click a tab to see is an answer you check less often than
 * you should.
 */

export function Masthead({
  contractId,
  organizer,
  name,
  tagline,
  logo,
  banner,
  location,
  tags,
  slug,
  phase,
  applications,
  submissions,
  prize,
  prizeCode,
  live,
}: {
  contractId: string;
  /** Whose events the switcher lists. Null before the wallet is known. */
  organizer: string | null;
  name: string;
  tagline: string | null;
  logo: string | null;
  banner: string | null;
  location: string | null;
  tags: string[];
  /** The public page, once there is one to link to. */
  slug: string | null;
  phase: string;
  /** Null until the counts have been read. */
  applications: number | null;
  submissions: number | null;
  /** The figure alone, or null when the rules are unreadable. */
  prize: string | null;
  /** Its ticker, kept apart from the figure so the mark can be drawn beside it. */
  prizeCode: string | null;
  live: boolean;
}) {
  return (
    <section>
      {/* The rail on the left and the picture on the right, and the columns
          swapped in the layout rather than in the markup, exactly as the public
          page does it: the name and the banner stay first in the document
          because they are what the page is about. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)]">
        <div className="flex flex-col gap-7 lg:order-2">
          <Picture banner={banner} name={name} />

          <div className="min-w-0">
            <div className="flex items-center gap-4">
              {logo !== null && (
                <img
                  src={logo}
                  alt=""
                  width={64}
                  height={64}
                  className="size-16 shrink-0 rounded-[0.55rem] object-cover ring-1 ring-rule"
                />
              )}

              <Switcher address={organizer} here={contractId}>
                <h1 className="min-w-0 text-[clamp(2rem,3.8vw,2.75rem)]">{name}</h1>
              </Switcher>
            </div>

            {tagline !== null && tagline.length > 0 && (
              <p className="mt-4 max-w-[46rem] text-[1.125rem] leading-relaxed text-ink-soft">
                {tagline}
              </p>
            )}
          </div>
        </div>

        {/* Held to its own height. As a grid child it would stretch to match
            the banner column beside it and leave a tall empty box under the
            last panel. */}
        <div className="self-start border border-rule lg:order-1">
          <Panel label="Stage">
            <p className="text-[1.25rem] font-semibold text-ink">{phase}</p>
          </Panel>

          <div className="grid border-b border-rule sm:grid-cols-2 sm:divide-x sm:divide-rule">
            <Panel label="Applications" bare>
              <Figure value={applications} />
            </Panel>

            <Panel label="Projects entered" bare>
              <Figure value={submissions} />
            </Panel>
          </div>

          <Panel label="Prize pot">
            {prize === null ? (
              <p className="text-[0.9375rem] text-ink-faint">Not readable from the contract.</p>
            ) : (
              /* The mark beside the ticker rather than instead of it, the same
                 way the public page sets a prize. A figure with the token's
                 mark on it is recognised without being read. */
              <p className="tabular flex items-center gap-2 text-[1.75rem] font-bold leading-none text-ink">
                {prize}

                {prizeCode !== null && (
                  <span className="inline-flex items-center gap-1.5">
                    <TokenMark code={prizeCode} className="size-6" />
                    {prizeCode}
                  </span>
                )}
              </p>
            )}
          </Panel>

          {(location !== null || tags.length > 0) && (
            <div className="grid border-b border-rule sm:grid-cols-2 sm:divide-x sm:divide-rule">
              {location !== null && (
                <Panel label="Where" bare>
                  <p className="text-[1rem] font-semibold text-ink">{location}</p>
                </Panel>
              )}

              {tags.length > 0 && (
                <Panel label="About" bare>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="bg-signal/15 px-2 py-1 text-[0.875rem] text-signal-ink ring-1 ring-inset ring-signal/30"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </Panel>
              )}
            </div>
          )}

          {/* Three answers, not two. An open event with no page is not the
              same as one that has not opened, and saying the second when the
              first is true sends somebody looking for a fault in the wrong
              place: what is missing is the name, and the tab that writes it is
              two inches below. */}
          <Panel label="Public page" last>
            {!live ? (
              <p className="text-[0.9375rem] text-ink-faint">
                Nothing is public until the hackathon opens.
              </p>
            ) : slug === null ? (
              <p className="text-[0.9375rem] text-ink-soft">
                No name saved yet, so there is no page. Write one under Details.
              </p>
            ) : (
              <a
                href={`/hackathons/${slug}`}
                className="text-[1rem] text-ink underline decoration-rule underline-offset-4 transition-colors duration-150 ease-settle hover:decoration-ink"
              >
                /hackathons/{slug}
              </a>
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}

/**
 * The banner, or the space one will take.
 *
 * Drawn at the same ratio either way, so uploading artwork does not move
 * everything under it down the page.
 */
function Picture({ banner, name }: { banner: string | null; name: string }) {
  if (banner === null) {
    return (
      <div className="grid aspect-[16/7] w-full place-items-center rounded-[0.55rem] bg-paper-sunk ring-1 ring-rule">
        <span aria-hidden className="text-[3rem] text-ink-faint">
          {name.trim().slice(0, 1).toUpperCase() || "?"}
        </span>
      </div>
    );
  }

  return (
    <img
      src={banner}
      alt=""
      className="aspect-[16/7] w-full rounded-[0.55rem] object-cover ring-1 ring-rule"
    />
  );
}

/** One box of the rail, bordered the way the public page borders its own. */
function Panel({
  label,
  children,
  bare = false,
  last = false,
}: {
  label: string;
  children: React.ReactNode;
  /** Inside a row that already carries the border below it. */
  bare?: boolean;
  last?: boolean;
}) {
  return (
    <div className={`px-5 py-4 ${bare || last ? "" : "border-b border-rule"}`}>
      <p className="label text-[0.8125rem] font-semibold text-ink">{label}</p>

      <div className="mt-2">{children}</div>
    </div>
  );
}

/** A count, or the fact that it is still being counted. */
function Figure({ value }: { value: number | null }) {
  return (
    <p className={`tabular text-[1.5rem] ${value === null ? "text-ink-faint" : "text-ink"}`}>
      {value === null ? "—" : value}
    </p>
  );
}
