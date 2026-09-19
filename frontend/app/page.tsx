import { ButtonLink, Badge, Display, Eyebrow, Measure, Rule } from "./components/primitives";

/**
 * The page somebody lands on knowing nothing.
 *
 * It has one job, and the job is not to explain the architecture: it is to make
 * the single promise legible in about four seconds. Everything else on it earns
 * its place by supporting that promise or is cut.
 */

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <Promise />
      <Audiences />
    </main>
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
