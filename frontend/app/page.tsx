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

        <Display className="mt-6">No black swans</Display>

        <p className="mx-auto mt-6 max-w-[34rem] text-pretty text-[1.0625rem] leading-relaxed text-ink-soft">
          The prize is locked in a contract before anybody starts building. The
          rules are frozen before anybody reads them. The result follows from the
          scores, and the money moves without anybody deciding to send it.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/hackathons">
            Browse hackathons
            <Badge>→</Badge>
          </ButtonLink>

          <ButtonLink href="/how-it-works" intent="quiet">
            How the proof works
          </ButtonLink>
        </div>

        <p className="mt-12 text-[0.8125rem] text-ink-faint">
          Every claim on this site can be checked without an account.
        </p>
      </Measure>
    </section>
  );
}

/**
 * The three things the product actually removes, stated as the problems they
 * are rather than as features.
 */
function Promise() {
  const removed = [
    {
      before: "The prize might not exist",
      after:
        "A hackathon cannot open for registration until the full prize table is sitting in the vault. The balance is public before anybody writes a line of code.",
    },
    {
      before: "The rules might change",
      after:
        "The rules are hashed and frozen at the lock. After that they can be read by anyone and written by no one, and the page shows the digest the contract stored.",
    },
    {
      before: "The result might be decided elsewhere",
      after:
        "Scorecards are sealed until the reveal, then opened all at once. The contract computes the ranking itself and refuses to accept one from anywhere else.",
    },
  ];

  return (
    <section className="border-b border-rule py-24">
      <Measure wide>
        <div className="max-w-[34rem]">
          <Eyebrow>What it takes away</Eyebrow>
          <h2 className="mt-4 text-[clamp(1.75rem,3.5vw,2.5rem)]">
            Three things that go wrong, and cannot here
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
        "See the prize, the rubric and the schedule before you commit a weekend. Check afterwards that the result follows from the scores.",
    },
    {
      who: "For organizers",
      what:
        "Keep every power you need, including disqualification and cancellation. Each one is announced before the lock and leaves a reason behind.",
    },
    {
      who: "For judges",
      what:
        "Score under seal, sign your own card, and hold a receipt that proves it was counted. Step away from a project without it looking like silence.",
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
