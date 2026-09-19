import { ButtonLink, Measure } from "../../components/primitives";
import { VISIBILITY, milestonesOf, type Milestone } from "../../../lib/rules";
import { prizeLabel, worthOf } from "../../../lib/money";
import { phaseName } from "../../../lib/phase";
import type { HackathonDetail } from "../../../lib/chain";

/**
 * The top of a hackathon page: what it is, what it pays, and when it shuts.
 *
 * Somebody arriving here is deciding whether to spend a weekend on this, and
 * three facts decide it: how much is in the vault, how long is left, and
 * whether they can still get in. Those three are the rail on the right and they
 * are above everything else on the page.
 *
 * The banner is a picture and is treated as one. It sits beside the facts
 * rather than behind them, because a prize figure set over somebody's artwork
 * is a prize figure whose legibility depends on what they uploaded.
 *
 * Everything in the rail except the picture and the tags comes from the frozen
 * document, read from the contract on this request. None of it is our copy of
 * anything, which is the only reason a deadline shown here is worth reading.
 */

export async function Masthead({ hackathon }: { hackathon: HackathonDetail }) {
  const worth = await worthOf(hackathon.asset, hackathon.prize);
  const prize = prizeLabel(worth, hackathon.prize);
  const milestones = hackathon.rules === null ? [] : milestonesOf(hackathon.rules);

  return (
    <section className="border-b border-rule">
      <Measure wide className="py-10 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          {/* The name sits under the banner rather than under the whole grid.
              The rail is the taller of the two columns by some distance, and a
              title row spanning both left a slab of empty paper beside the
              picture; stacked here it is what fills that height, and the name
              ends up beside the prize it is asking somebody to compete for. */}
          <div className="flex flex-col gap-7">
            <Picture hackathon={hackathon} />

            <div className="flex flex-1 flex-wrap items-end justify-between gap-x-8 gap-y-5">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  {hackathon.logo_url !== null && (
                    <img
                      src={hackathon.logo_url}
                      alt=""
                      width={44}
                      height={44}
                      className="size-11 shrink-0 rounded-[0.4rem] object-cover ring-1 ring-rule"
                    />
                  )}

                  <h1 className="min-w-0 text-[clamp(1.75rem,3.4vw,2.5rem)]">{hackathon.name}</h1>
                </div>

                {hackathon.tagline !== null && (
                  <p className="mt-3 max-w-[42rem] text-[1.0625rem] leading-relaxed text-ink-soft">
                    {hackathon.tagline}
                  </p>
                )}
              </div>

              <Action phase={hackathon.phase} />
            </div>
          </div>

          <div className="border border-rule">
            <Panel label="Prize pool">
              {hackathon.prize === null ? (
                <p className="label text-ink-faint">not readable from the contract</p>
              ) : (
                <p className="tabular text-[2rem] font-bold leading-none text-verified">
                  {prize.figure}{" "}
                  <span className="label align-middle font-bold text-ink-soft">{prize.code}</span>
                </p>
              )}
            </Panel>

            <Panel label="Timeline">
              <Countdown closesAt={hackathon.closesAt} phase={hackathon.phase} />

              {milestones.length === 0 ? (
                <p className="label mt-3 text-ink-faint">no schedule readable</p>
              ) : (
                <ol className="mt-4 grid gap-2">
                  {milestones.map((moment) => (
                    <Moment key={moment.label} moment={moment} />
                  ))}
                </ol>
              )}
            </Panel>

            {(hackathon.location !== null || hackathon.tags.length > 0) && (
              <Panel label="Where and what">
                {hackathon.location !== null && (
                  <p className="label flex items-center gap-1.5 font-bold text-ink">
                    <Pin />
                    {hackathon.location}
                  </p>
                )}

                {hackathon.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {hackathon.tags.map((tag) => (
                      <span key={tag} className="label bg-paper-sunk px-2 py-1 text-ink-soft">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Panel>
            )}

            {/* Said in the rail rather than buried on the builds tab, because
                it changes what somebody is agreeing to when they enter. A team
                deciding whether to submit should not have to go looking for who
                will be able to read their work. */}
            <Panel label="Who can read the builds" last>
              <Gallery visibility={hackathon.rules?.visibility ?? null} />
            </Panel>
          </div>
        </div>
      </Measure>
    </section>
  );
}

/**
 * The banner, in the proportions it was drawn in.
 *
 * Without one it is the diagonal hatch, so a hackathon whose organizer skipped
 * an upload has a page the same shape as the others rather than a hole where
 * the picture would be.
 */
function Picture({ hackathon }: { hackathon: HackathonDetail }) {
  return (
    <div className="relative aspect-[5/2] shrink-0 overflow-hidden border border-rule">
      {hackathon.banner_url === null ? (
        <div className="hatch size-full" aria-hidden />
      ) : (
        <img src={hackathon.banner_url} alt="" className="absolute inset-0 size-full object-cover" />
      )}

      <span className="label absolute left-3 top-3 bg-paper px-2.5 py-1.5 text-ink ring-1 ring-inset ring-rule">
        {phaseName(hackathon.phase)}
      </span>
    </div>
  );
}

/** One block of the rail, divided from the next by a hairline rather than a gap. */
function Panel({
  label,
  last = false,
  children,
}: {
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`p-5 ${last ? "" : "border-b border-rule"}`}>
      <p className="label text-ink-faint">{label}</p>

      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * How long is left, which is the number that decides whether to start tonight.
 *
 * Rendered on the server from the contract's own deadline, so it is a figure
 * rather than a ticking clock. A counter updating every second would make this
 * page re-render forever for a number nobody watches change.
 */
function Countdown({ closesAt, phase }: { closesAt: number | null; phase: number | null }) {
  const finished = phase !== null && phase >= 8;
  const left = closesAt === null ? 0 : closesAt - Math.floor(Date.now() / 1000);

  if (finished || closesAt === null || left <= 0) {
    return (
      <p className="label bg-paper-sunk px-2.5 py-1.5 text-ink-soft ring-1 ring-inset ring-rule">
        {closesAt === null ? "no deadline set" : "submissions closed"}
      </p>
    );
  }

  const days = Math.floor(left / 86_400);
  const hours = Math.floor((left % 86_400) / 3_600);

  return (
    <p className="label bg-verified px-2.5 py-1.5 font-bold text-paper">
      {days > 0
        ? `${days} ${days === 1 ? "day" : "days"} left to submit`
        : `${hours} ${hours === 1 ? "hour" : "hours"} left to submit`}
    </p>
  );
}

/**
 * One announced moment, and whether it has happened.
 *
 * The next one still to come is the only line set in full ink. Everything
 * behind it is history and everything past it is somebody else's problem; the
 * one a reader is looking for is the one about to happen.
 */
function Moment({ moment }: { moment: Milestone }) {
  return (
    <li className="flex items-baseline justify-between gap-4">
      <span
        className={`label ${
          moment.next ? "font-bold text-ink" : moment.passed ? "text-ink-faint" : "text-ink-soft"
        }`}
      >
        {moment.label}
      </span>

      <span
        className={`tabular shrink-0 text-[0.75rem] ${
          moment.next ? "font-bold text-ink" : "text-ink-faint"
        }`}
      >
        {stamp(moment.at)}
      </span>
    </li>
  );
}

/**
 * A moment, in UTC, in a shape that sorts.
 *
 * Not the reader's own timezone, and deliberately. Every other timestamp this
 * product shows is a ledger time, and a deadline printed in local time here and
 * in UTC on the explorer is two deadlines a reader has to reconcile.
 */
function stamp(at: number): string {
  const when = new Date(at * 1_000);
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${when.getUTCFullYear()}/${pad(when.getUTCMonth() + 1)}/${pad(when.getUTCDate())} ${pad(
    when.getUTCHours(),
  )}:${pad(when.getUTCMinutes())}Z`;
}

/**
 * Who may read the submitted projects, in the contract's own three levels.
 *
 * This is not a setting on our side. It was chosen before the lock, it is in
 * the digest, and the database enforces the same three levels in
 * `may_see_gallery`, so what this line says and what a request actually returns
 * cannot come apart.
 */
function Gallery({ visibility }: { visibility: number | null }) {
  if (visibility === null) {
    return <p className="label text-ink-faint">not readable from the contract</p>;
  }

  const said = [
    ["Anybody", "Every submitted build is public while the event runs."],
    ["Entrants only", "Only people the organizer approved can open the builds."],
    ["The organizer only", "Nobody but the organizer reads a build before the result."],
  ][visibility] ?? ["Unknown", "The contract answered with a level this page does not know."];

  return (
    <>
      <p className="label font-bold text-ink">{said[0]}</p>

      <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">{said[1]}</p>

      <p className="label mt-3 text-ink-faint">frozen as {VISIBILITY[visibility] ?? "unknown"}</p>
    </>
  );
}

/**
 * The one thing to press, and it changes with the phase.
 *
 * Only one, because there is only ever one next step: you cannot submit before
 * you are approved and you cannot register once registration has shut. Two
 * buttons where one of them always fails is how a reader learns to distrust
 * both.
 */
function Action({ phase }: { phase: number | null }) {
  if (phase === null) {
    return null;
  }

  if (phase < 2) {
    return (
      <ButtonLink href="?tab=take-part" intent="quiet" className="shrink-0">
        Not open yet
      </ButtonLink>
    );
  }

  if (phase >= 8) {
    return (
      <ButtonLink href="?tab=builds" intent="quiet" className="shrink-0">
        See what was built
      </ButtonLink>
    );
  }

  return (
    <ButtonLink href="?tab=take-part" className="shrink-0 bg-ink text-signal hover:bg-ink/90">
      Register as a hacker
    </ButtonLink>
  );
}

/** A map pin, drawn rather than fetched, so the page ships no extra image. */
function Pin() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      className="size-3 shrink-0"
    >
      <path d="M6 11S1.8 7.6 1.8 4.8a4.2 4.2 0 1 1 8.4 0C10.2 7.6 6 11 6 11Z" />
      <circle cx="6" cy="4.7" r="1.4" />
    </svg>
  );
}
