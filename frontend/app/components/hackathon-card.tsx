import Link from "next/link";

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

  /*
    Whether the door is actually open, which is not the same as the phase.

    A phase only moves when somebody calls `advance_phase`, and the clock
    service does that within a lap rather than instantly, so an event whose
    submission deadline has just passed is still `Open` on chain for a moment.
    The badge answers "can I still get in", and for that moment the honest
    answer is no, however the contract is labelling itself.

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

          {/* The display face at full weight, which is what the rest of the
              system already does with a name somebody chose. It was set in the
              interface face at regular, because an `h3` is not in the base rule
              that gives `h1` and `h2` the display face, and the card's title
              ended up the same type as the tagline under it and half a shade
              lighter than the tags below that. Bold rather than the 600 the
              base rule uses: a name at twenty one pixels needs the extra weight
              to carry the presence a headline gets from size. */}
          <h3 className="display min-w-0 text-[1.625rem] font-bold leading-tight transition-colors group-hover:text-ink-soft">
            {hackathon.name}
          </h3>

          {hackathon.tagline !== null && (
            <p className="mt-2 text-[1rem] leading-relaxed text-ink-soft">
              {hackathon.tagline}
            </p>
          )}
        </div>

        <div>
          {/* A place is a fact about the event and the tags are what it is
              about, so they get a line each. Sharing one, the place was the
              first of four grey chips and read as another tag. */}
          {hackathon.location !== null && (
            <p className="flex items-center gap-1.5 text-[1rem] font-semibold text-ink">
              <Pin />
              {hackathon.location}
            </p>
          )}

          {hackathon.tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {hackathon.tags.slice(0, 3).map((tag) => (
                /* Tinted rather than grey. Three grey chips under a grey place
                   and a grey tagline gave the lower half of the card one
                   colour, and the tags are the one thing on it a reader scans
                   for rather than reads. The signal yellow is the accent this
                   product already uses for "look here"; at a tenth it is a wash
                   rather than a highlight, so a row of them stays quieter than
                   the prize. */
                <span
                  key={tag}
                  className="label bg-signal/15 px-2 py-1 text-signal-ink ring-1 ring-inset ring-signal/30"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* The money, named. It was one figure with a ticker beside it, which
              is a number somebody has to work out the meaning of; a labelled
              row is read without stopping. */}
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-rule pt-4">
            <p className="label text-ink-faint">Prize pool</p>

            <p className="tabular text-[1.375rem] font-bold text-verified">
              {/* Absent rather than zero when the contract could not be reached.
                  A prize shown as nothing is a claim; a prize shown as unknown
                  is the truth. */}
              {hackathon.prize === null ? (
                <span className="label font-normal text-ink-faint">not readable</span>
              ) : (
                <>
                  {prize.figure}{" "}
                  <span className="text-[1rem] font-semibold text-ink-soft">{prize.code}</span>
                </>
              )}
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
  shut,
}: {
  hackathon: HackathonSummary;
  running: boolean;
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
      <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-3">
      <span
        className={`label flex items-center gap-2 px-2.5 py-1.5 ${
          running
            ? "bg-verified text-paper"
            : finished || shut
              ? "bg-broken text-paper"
              : "bg-signal text-signal-ink"
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
          : label(hackathon)}
      </span>

      {/* The clock beside the badge rather than under the prize. They answer one
          question between them — can I get in, and by when — and reading them
          together is what somebody scanning a grid actually does. */}
      <span className="label bg-paper/90 px-2.5 py-1.5 text-ink backdrop-blur-sm">
        <Remaining
          closesAt={hackathon.closesAt}
          registrationClosesAt={hackathon.registrationClosesAt}
          finished={finished}
        />
      </span>
      </div>
    </div>
  );
}

/**
 * One word for where the event is, in a stranger's vocabulary.
 *
 * A badge on a card is glanced at, not read, so it gets a word rather than a
 * sentence. The phase is the contract's own naming and it stays in the
 * organizer's panel, where the phase is the thing being moved; "Draft",
 * "Funding" and "Reveal" are not answers to the question a card is asked, which
 * is whether this is worth a weekend.
 *
 * The unknown case is the one that mattered here. A phase is what the indexer
 * recorded and a schedule is read from the chain, so an event the indexer has
 * not reached has real deadlines and no phase — and printing "Not published
 * yet" over a hackathon that is open, funded and taking sign-ups is worse than
 * saying nothing. The deadlines answer it on their own.
 */
function label(hackathon: HackathonSummary): string {
  const now = Math.floor(Date.now() / 1000);

  if (hackathon.phase === null) {
    if (hackathon.registrationOpensAt !== null && now < hackathon.registrationOpensAt) {
      return "Soon";
    }

    return hackathon.registrationClosesAt !== null && now < hackathon.registrationClosesAt
      ? "Open"
      : "Running";
  }

  switch (hackathon.phase) {
    case 0:
    case 1:
      return "Soon";
    case 2:
      return "Open";
    case 3:
      return "Checking";
    case 4:
    case 5:
      return "Judging";
    case 6:
      return "Results";
    case 7:
      return "Paying";
    case 8:
      return "Finished";
    default:
      return "Called off";
  }
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
