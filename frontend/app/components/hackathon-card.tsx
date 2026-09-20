import Link from "next/link";

import { phaseName } from "../../lib/phase";
import { prizeLabel, worthOf } from "../../lib/money";
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

export async function HackathonCard({ hackathon }: { hackathon: HackathonSummary }) {
  const worth = await worthOf(hackathon.asset, hackathon.prize);
  const prize = prizeLabel(worth, hackathon.prize);
  const finished = hackathon.phase !== null && hackathon.phase >= 8;
  const funding = hackathon.phase === 1;

  /*
    Whether the door is actually open, which is not the same as the phase.

    A phase only moves when somebody calls `advance_phase`, so an event whose
    submission deadline passed an hour ago is still `Open` on chain until
    someone tells it otherwise. The badge answers "can I still get in", and for
    that hour the honest answer is no, however the contract is labelling itself.

    Green was also given to judging, reveal and settlement, which are stages
    nobody can enter at all. It is now the one stage where entering is possible.
  */
  const now = Math.floor(Date.now() / 1000);

  /* Signing up closes before building does, and the badge answers the first
     question, not the second. A card that said OPEN because a team already in
     had an hour left to submit was inviting somebody who could no longer
     apply. */
  const shut =
    hackathon.registrationClosesAt !== null && hackathon.registrationClosesAt <= now;
  const running = hackathon.phase === 2 && !shut;

  return (
    /* Hovering sharpens the frame rather than raising the card. The hairline
       goes to full ink and a second one is drawn just inside it, so the edge
       gains weight without gaining a pixel of size: an inset ring cannot push
       its neighbours the way a border that thickens would, and a grid of these
       has to stay still while one of them answers. */
    <Link
      href={`/hackathons/${hackathon.slug}`}
      className="group flex h-full flex-col overflow-hidden border border-rule bg-paper transition-[border-color,box-shadow] duration-150 ease-settle hover:border-ink hover:ring-1 hover:ring-inset hover:ring-ink"
    >
      <Picture
        hackathon={hackathon}
        running={running}
        funding={funding}
        finished={finished}
        shut={shut}
      />

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-5 px-5 pb-5">
        <div className="min-w-0">
          {/* The mark sits over the picture's lower edge rather than beside the
              name, which is where a logo goes on everything else that has both.
              It also buys the name the full width of the card: at three words
              the old row wrapped the title around a thirty two pixel square. */}
          <div className="relative z-10 -mt-8 mb-4 size-14 overflow-hidden rounded-[0.6rem] border border-rule bg-paper">
            {hackathon.logo_url === null ? (
              <div className="hatch size-full" aria-hidden />
            ) : (
              <img src={hackathon.logo_url} alt="" className="size-full object-cover" />
            )}
          </div>

          <h3 className="min-w-0 text-[1.25rem] leading-tight transition-colors group-hover:text-ink-soft">
            {hackathon.name}
          </h3>

          {hackathon.tagline !== null && (
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
              {hackathon.tagline}
            </p>
          )}
        </div>

        <div>
          {(hackathon.location !== null || hackathon.tags.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* A place is not a subject, so it is not dressed as one. The pin
                  says which kind of fact it is without a word being spent. */}
              {hackathon.location !== null && (
                <span className="label flex items-center gap-1.5 font-bold text-ink-soft">
                  <Pin />
                  {hackathon.location}
                </span>
              )}

              {hackathon.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="label bg-paper-sunk px-2 py-1 text-ink-faint"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-rule pt-4">
            {/* The two numbers somebody is actually comparing across a grid of
                these, so they are the two things given weight. The money is
                green because money is; the countdown is full ink because it is
                the other half of the same decision, and a deadline set in the
                soft grey the tags use loses to them. Everything else on the
                card stays quiet so that this pair reads first. */}
            <p className="tabular text-[1.25rem] font-bold text-verified">
              {/* Absent rather than zero when the contract could not be reached.
                  A prize shown as nothing is a claim; a prize shown as unknown
                  is the truth. */}
              {hackathon.prize === null ? (
                <span className="label font-normal text-ink-faint">prize not readable</span>
              ) : (
                <>
                  {prize.figure}{" "}
                  <span className="font-bold text-ink">{prize.code}</span>
                </>
              )}
            </p>

            <p className="label font-bold text-ink">
              <Remaining
                closesAt={hackathon.closesAt}
                registrationClosesAt={hackathon.registrationClosesAt}
                finished={finished}
              />
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
  funding,
  finished,
  shut,
}: {
  hackathon: HackathonSummary;
  running: boolean;
  funding: boolean;
  finished: boolean;
  /** Whether the submission deadline has passed, whatever the phase says. */
  shut: boolean;
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
          className="size-full object-cover"
        />
      )}

      {/* Over the picture, because whether somebody can still enter is the
          first thing they look for and it should not move when a banner
          appears. */}
      {/*
        Three colours for three answers to one question: can I still get in.
        Green yes, yellow not yet, red no. They are the traffic light everybody
        already reads, and the dot repeats it as a shape for anybody who cannot
        separate the colours.

        Shut counts as red whatever the phase is called. An event whose deadline
        has gone is closed to anybody arriving, and drawing that in the neutral
        outline made "Closed" read as a footnote rather than as the answer.
      */}
      <span
        className={`label absolute left-3 top-3 flex items-center gap-2 px-2.5 py-1.5 ${
          running
            ? "bg-verified text-paper"
            : funding
              ? "bg-signal text-signal-ink"
              : finished || shut
                ? "bg-broken text-paper"
                : "bg-paper text-ink ring-1 ring-inset ring-rule"
        }`}
      >
        {running && <span aria-hidden className="size-1.5 rounded-full bg-paper" />}
        {/*
          "Closed" while the event is still Open, and while the phase is not
          known at all.

          The first is the one stage where the phase would otherwise say a door
          is open that is not. Past it the phase name is the more useful word
          and just as honest — nobody joins a hackathon in Judging or Settlement
          either, and "Closed" on an event that has already paid its winner
          tells somebody less than the truth does.

          The second is the case this was first written without. A phase is read
          from what the indexer recorded and a deadline is read from the chain,
          so an event the indexer has not reached yet has a real deadline and no
          phase. Falling through to `phaseName` printed "Not published yet" over
          a hackathon that was published, funded and settled.
        */}
        {shut && (hackathon.phase === null || hackathon.phase === 2)
          ? "Closed"
          : phaseName(hackathon.phase)}
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
function Remaining({
  closesAt,
  registrationClosesAt,
  finished,
}: {
  closesAt: number | null;
  registrationClosesAt: number | null;
  finished: boolean;
}) {
  if (finished) {
    return <>submissions closed</>;
  }

  const now = Math.floor(Date.now() / 1000);

  /* The clock the reader is on. Somebody who can still sign up is deciding
     whether to; once that has gone they are watching a build deadline that is
     not theirs. */
  const registering = registrationClosesAt !== null && registrationClosesAt > now;
  const deadline = registering ? registrationClosesAt : closesAt;

  if (deadline === null) {
    return <>no deadline set</>;
  }

  const what = registering ? "to register" : "left";
  const left = deadline - now;

  if (left <= 0) {
    return <>submissions closed</>;
  }

  const days = Math.floor(left / 86_400);
  const hours = Math.floor((left % 86_400) / 3_600);

  if (days > 0) {
    return <>{`${days} ${days === 1 ? "day" : "days"} ${what}`}</>;
  }

  if (hours > 0) {
    return <>{`${hours} ${hours === 1 ? "hour" : "hours"} ${what}`}</>;
  }

  /* Minutes in the last hour. Rounding them all down to hours printed "0 hours
     left" for the whole of it, which reads as expired on an event somebody can
     still just about enter. */
  const minutes = Math.floor(left / 60);

  return <>{`${minutes <= 1 ? "1 minute" : `${minutes} minutes`} ${what}`}</>;
}

/** A map pin, drawn rather than fetched, so a card ships no extra image. */
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
