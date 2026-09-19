import { ButtonLink, Badge, Display, Eyebrow, Measure, Rule } from "./components/primitives";
import { HackathonCard } from "./components/hackathon-card";
import { listHackathons } from "../lib/chain";

/**
 * The page somebody lands on knowing nothing.
 *
 * It has one job, and the job is not to explain the architecture: it is to make
 * the single promise legible in about four seconds. Everything else on it earns
 * its place by supporting that promise or is cut.
 */

/* Read fresh. A stage that changed an hour ago and still reads as open is a
   lie, and this page is where most people meet one. */
export const revalidate = 0;

export default async function Home() {
  const hackathons = await listHackathons();

  return (
    <main className="flex-1">
      <Hero />
      <Happening hackathons={hackathons} />
      <Promise />
      <Audiences />
    </main>
  );
}

/**
 * The events themselves, high on the page.
 *
 * Somebody who has heard of this site already is not here to read the argument
 * again; they are here to see what is on. So the hackathons sit directly under
 * the hero, above the explanation, and the explanation is for the people who
 * scroll past them.
 */
function Happening({ hackathons }: { hackathons: Awaited<ReturnType<typeof listHackathons>> }) {
  if (hackathons.length === 0) {
    return null;
  }

  /* Six at most. This is a shop window, not the shop, and the listing is one
     click away in the header and again at the bottom of this section. */
  const shown = hackathons.slice(0, 6);

  return (
    <section className="border-b border-rule">
      <Measure wide className="py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>On now</Eyebrow>

            <h2 className="mt-4 text-[clamp(1.75rem,3.5vw,2.5rem)]">Hackathons</h2>
          </div>

          <ButtonLink href="/hackathons" intent="quiet" size="sm">
            See all
            <Badge>→</Badge>
          </ButtonLink>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((hackathon) => (
            <HackathonCard key={hackathon.contract_id} hackathon={hackathon} />
          ))}
        </div>
      </Measure>
    </section>
  );
}

/**
 * The editorial hero: serif display, generous air, halftone behind.
 *
 * The texture sits at an opacity where you would not name it if asked. That is
 * the intended dose; at the point it becomes a pattern it has stopped being
 * paper and started being decoration.
 */
function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-rule">
      <div className="halftone pointer-events-none absolute inset-0 -z-10 opacity-[0.4]" aria-hidden />

      <Measure className="relative py-24 text-center sm:py-32">
        <Eyebrow>Hackathons on Stellar</Eyebrow>

        <Display className="mt-6">Check it yourself</Display>

        <p className="mx-auto mt-6 max-w-[34rem] text-pretty text-[1.0625rem] leading-relaxed text-ink-soft">
          The prize goes into a contract before registration opens. The rules get
          hashed and frozen. Judges score under seal. At the end the contract
          pays the winners. Nobody presses send.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/hackathons">
            Browse hackathons
            <Badge>→</Badge>
          </ButtonLink>

          <ButtonLink href="/how-it-works" intent="quiet">
            How it works
          </ButtonLink>
        </div>

        <p className="mt-12 text-[0.8125rem] text-ink-faint">
          No account needed to check any of it.
        </p>
      </Measure>
    </section>
  );
}

/**
 * The three failures, named the way somebody who has been burned by one would
 * name them. A feature list would say the same things and land as marketing.
 */
function Promise() {
  const removed = [
    {
      before: "The prize never showed up",
      after:
        "Registration stays shut until the whole prize table is in the vault. The balance is public from day one.",
    },
    {
      before: "The rules changed halfway",
      after:
        "Rules are hashed and frozen at the lock. Read them whenever you like. Nobody can edit them after that, us included.",
    },
    {
      before: "The winner was picked in a group chat",
      after:
        "Scorecards stay sealed until the reveal, then open at once. The contract does the ranking, and it will not take one from anywhere else.",
    },
  ];

  return (
    <section className="border-b border-rule py-24">
      <Measure wide>
        <div className="max-w-[34rem]">
          <Eyebrow>Why bother</Eyebrow>
          <h2 className="mt-4 text-[clamp(1.75rem,3.5vw,2.5rem)]">
            Three ways a hackathon goes bad
          </h2>
        </div>

        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {removed.map((item, index) => (
            <div key={item.before}>
              <p className="tabular text-[0.75rem] text-ink-faint">
                {String(index + 1).padStart(2, "0")}
              </p>

              <Rule className="mt-3" />

              <p className="mt-5 text-[1.0625rem] text-ink">{item.before}</p>

              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
                {item.after}
              </p>
            </div>
          ))}
        </div>
      </Measure>
    </section>
  );
}

/**
 * The inverted section, which is the editorial layout's way of changing
 * register partway down a page.
 */
function Audiences() {
  const forWhom = [
    {
      who: "For builders",
      what:
        "See the prize, the rubric and the deadline before you give up a weekend. Afterwards, check the result against the scores.",
    },
    {
      who: "For organizers",
      what:
        "You keep every power you need, disqualification and cancellation included. You announce them before the lock and leave a reason when you use them.",
    },
    {
      who: "For judges",
      what:
        "Score under seal and sign your own card. Your receipt proves it was counted. Recuse yourself from a project without it looking like silence.",
    },
  ];

  return (
    <section className="grain relative bg-night py-24 text-night-ink">
      <Measure wide className="relative">
        <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3">
          {forWhom.map((item) => (
            <div
              key={item.who}
              className="border border-night-rule p-8 first:rounded-l-lg last:rounded-r-lg"
            >
              <h3 className="display text-[1.5rem]">{item.who}</h3>

              <p className="mt-4 text-[0.9375rem] leading-relaxed text-night-ink-soft">
                {item.what}
              </p>
            </div>
          ))}
        </div>
      </Measure>
    </section>
  );
}
