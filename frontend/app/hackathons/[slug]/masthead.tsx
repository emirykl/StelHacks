import { ButtonLink, Measure } from "../../components/primitives";
import { Register } from "./register";
import { windowsOf, type Window } from "../../../lib/rules";
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
  const windows = hackathon.rules === null ? [] : windowsOf(hackathon.rules);

  return (
    <section className="border-b border-rule">
      <Measure wide className="py-10 sm:py-12">
        {/* The rail on the left and the picture on the right, and the columns
            swapped in the layout rather than in the markup. The name and the
            banner stay first in the document because they are what the page is
            about, and a reader who arrives with a screen reader should meet
            them before a table of deadlines. Only the eye's order changes. */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)]">
          {/* The name sits under the banner rather than under the whole grid.
              The rail is the taller of the two columns by some distance, and a
              title row spanning both left a slab of empty paper beside the
              picture; stacked here it is what fills that height, and the name
              ends up beside the prize it is asking somebody to compete for. */}
          <div className="flex flex-col gap-7 lg:order-2">
            <Picture hackathon={hackathon} />

            <div className="flex flex-1 flex-wrap items-end justify-between gap-x-8 gap-y-5">
              <div className="min-w-0">
                {/* The mark and the name grew together rather than the name
                    alone. A logo held at its old size beside a larger title
                    stops reading as the thing's mark and starts reading as an
                    icon in front of it. */}
                <div className="flex items-center gap-4">
                  {hackathon.logo_url !== null && (
                    <img
                      src={hackathon.logo_url}
                      alt=""
                      width={64}
                      height={64}
                      className="size-16 shrink-0 rounded-[0.55rem] object-cover ring-1 ring-rule"
                    />
                  )}

                  <h1 className="min-w-0 text-[clamp(2.25rem,4.2vw,3.25rem)]">{hackathon.name}</h1>
                </div>

                {hackathon.tagline !== null && (
                  <p className="mt-4 max-w-[46rem] text-[1.1875rem] leading-relaxed text-ink-soft">
                    {hackathon.tagline}
                  </p>
                )}
              </div>

            </div>
          </div>

          {/* Held to its own height. As a grid child it stretched to match the
              banner column beside it, which left a tall empty box under the
              last panel on any event without tags. */}
          <div className="self-start border border-rule lg:order-1">
            <Panel label="Prize pool">
              {hackathon.prize === null ? (
                <p className="text-[0.875rem] text-ink-faint">Not readable from the contract.</p>
              ) : (
                <p className="tabular text-[2rem] font-bold leading-none text-verified">
                  {prize.figure}{" "}
                  <span className="align-middle font-bold text-ink">{prize.code}</span>
                </p>
              )}
            </Panel>

            <Panel label="Timeline · UTC">
              <Countdown
                closesAt={hackathon.closesAt}
                registrationClosesAt={hackathon.rules?.schedule.registrationCloses ?? null}
                phase={hackathon.phase}
              />

              {windows.length === 0 ? (
                <p className="mt-3 text-[0.875rem] text-ink-faint">no schedule readable</p>
              ) : (
                <ol className="mt-4 grid gap-2.5">
                  {windows.map((span) => (
                    <Span key={span.label} span={span} />
                  ))}
                </ol>
              )}
            </Panel>

            {(hackathon.location !== null || hackathon.tags.length > 0) && (
              <Panel label="Where and what">
                {hackathon.location !== null && (
                  <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-ink">
                    <Pin />
                    {hackathon.location}
                  </p>
                )}

                {hackathon.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {hackathon.tags.map((tag) => (
                      <span
                        key={tag}
                        className="bg-paper-sunk px-2 py-1 text-[0.8125rem] text-ink-soft"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Panel>
            )}

            {/* The way in, at the foot of the column that argues for it. It sat
                beside the name, which is the one place on the page with nothing
                to its right, so it read as floating rather than as the end of
                anything. Under the prize and the deadline it is the answer to
                the two facts above it. */}
            <Panel label="Taking part" last>
              <Action
                phase={hackathon.phase}
                contractId={hackathon.contract_id}
                slug={hackathon.slug}
                registrationClosesAt={hackathon.rules?.schedule.registrationCloses ?? null}
              />
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
  /* Registration, not submission, and the same reading as the card's badge.
     They disagreed: an event whose sign up window had closed while its teams
     still had time to build said CLOSED in the listing and OPEN on its own
     page. The badge answers "can I get in", and there is one answer. */
  const shut =
    hackathon.registrationClosesAt !== null &&
    hackathon.registrationClosesAt <= Math.floor(Date.now() / 1000);

  return (
    <div className="relative aspect-[5/2] shrink-0 overflow-hidden border border-rule">
      {hackathon.banner_url === null ? (
        <div className="hatch size-full" aria-hidden />
      ) : (
        <img src={hackathon.banner_url} alt="" className="absolute inset-0 size-full object-cover" />
      )}

      {/*
        What the badge answers is whether somebody can still get in, not what
        the phase is called.

        A phase only moves when somebody calls `advance_phase`, so an event
        whose submission deadline went an hour ago still says `Open` on chain.
        This said "Open" over a strip that said "deadline passed", which is the
        page arguing with itself in two places a reader sees at once.
      */}
      <span
        className={`label absolute left-3 top-3 px-2.5 py-1.5 ${
          shut
            ? "bg-broken text-paper"
            : "bg-paper text-ink ring-1 ring-inset ring-rule"
        }`}
      >
        {shut && (hackathon.phase === null || hackathon.phase < 8)
          ? "Closed"
          : phaseName(hackathon.phase)}
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
function Countdown({
  closesAt,
  registrationClosesAt,
  phase,
}: {
  closesAt: number | null;
  /** When signing up stops, which closes before the build deadline does. */
  registrationClosesAt: number | null;
  phase: number | null;
}) {
  const finished = phase !== null && phase >= 8;
  const now = Math.floor(Date.now() / 1000);

  /*
    The deadline the reader is actually up against, which is not always the one
    the event ends on.

    Registration closes before submissions do, and this counted only the second.
    So a visitor arriving in the gap was met with a loud green "1 hour left to
    submit" over a rail that said registration had closed: the page shouting
    about a door they could no longer walk through.

    Whoever is still able to sign up is deciding whether to, so that is the
    clock. Once that has gone, the people left are the ones already in, and
    theirs is the build deadline.
  */
  const registering = registrationClosesAt !== null && registrationClosesAt > now;
  const deadline = registering ? registrationClosesAt : closesAt;
  const left = deadline === null ? 0 : deadline - now;

  if (finished || deadline === null || left <= 0) {
    return (
      <p className="bg-paper-sunk px-3 py-2 text-[0.875rem] font-semibold text-ink-soft ring-1 ring-inset ring-rule">
        {deadline === null ? "No deadline set" : "Submissions closed"}
      </p>
    );
  }

  const what = registering ? "to register" : "to submit";
  const days = Math.floor(left / 86_400);
  const hours = Math.floor((left % 86_400) / 3_600);
  const minutes = Math.floor((left % 3_600) / 60);

  const span =
    days > 0
      ? `${days} ${days === 1 ? "day" : "days"}`
      : hours > 0
        ? `${hours} ${hours === 1 ? "hour" : "hours"}`
        /* Minutes in the last hour. Rounded to hours it read "0 hours left" for
           the whole of it, on the one page where that hour still counts. */
        : `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;

  return (
    <p className="bg-verified px-3 py-2 text-[0.9375rem] font-bold text-paper">
      {span} left {what}
    </p>
  );
}

/**
 * One window, on one line.
 *
 * The window running right now is the only line in full ink. What is behind it
 * is history and what is past it is somebody else's week; the one a reader is
 * looking for is the one they are standing in, or the next one if they are
 * between two.
 *
 * The label is set in the interface face rather than in tracked out capitals.
 * "Registration" and "Submissions" are words a person reads, not values the
 * chain is quoting, and the capitals were costing legibility for a distinction
 * that does not apply here.
 */
function Span({ span }: { span: Window }) {
  const lit = span.standing === "now";

  return (
    <li className="flex items-baseline justify-between gap-4">
      <span
        className={`text-[0.875rem] ${
          lit ? "font-bold text-ink" : span.standing === "past" ? "text-ink-faint" : "text-ink-soft"
        }`}
      >
        {span.label}
      </span>

      <span
        className={`tabular shrink-0 text-[0.8125rem] ${
          lit ? "font-bold text-ink" : "text-ink-faint"
        }`}
      >
        {span.to === null ? (
          stamp(span.from)
        ) : (
          <>
            {stamp(span.from)} <span className="text-ink-faint">→</span> {stamp(span.to)}
          </>
        )}
      </span>
    </li>
  );
}

/**
 * A moment, in UTC, short enough that two fit on one line.
 *
 * It was `2026/08/27 20:27Z`, which is twenty characters, and two of those on
 * a line in a rail this narrow do not fit at all. The year is dropped unless
 * the date is not in this one, which is the only case where its absence could
 * mislead anybody.
 *
 * Still UTC, and deliberately. Every other timestamp this product shows is a
 * ledger time, and a deadline printed in local time here and in UTC on the
 * explorer is two deadlines a reader has to reconcile.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function stamp(at: number): string {
  const when = new Date(at * 1_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  const year =
    when.getUTCFullYear() === new Date().getUTCFullYear() ? "" : ` ${when.getUTCFullYear()}`;

  return `${when.getUTCDate()} ${MONTHS[when.getUTCMonth()]}${year} ${pad(
    when.getUTCHours(),
  )}:${pad(when.getUTCMinutes())}`;
}

/**
 * The one thing to press, and it changes with the phase.
 *
 * Only one, because there is only ever one next step: you cannot submit before
 * you are approved and you cannot register once registration has shut. Two
 * buttons where one of them always fails is how a reader learns to distrust
 * both.
 */
function Action({
  phase,
  contractId,
  slug,
  registrationClosesAt,
}: {
  phase: number | null;
  contractId: string;
  slug: string | null;
  /** When applying stops being possible, from the frozen rules. */
  registrationClosesAt: number | null;
}) {
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
      <ButtonLink href="?tab=projects" intent="quiet" className="shrink-0">
        See the projects
      </ButtonLink>
    );
  }

  return (
    <Register
      contractId={contractId}
      slug={slug}
      registrationClosesAt={registrationClosesAt}
    />
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
