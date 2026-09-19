import Link from "next/link";

import { Eyebrow, Measure, Rule } from "../components/primitives";
import { listHackathons, phaseName, type HackathonSummary } from "../../lib/chain";

/**
 * Everything running, readable by anybody.
 *
 * The listing is the observer surface at its simplest, and the thing it must
 * get right is not looking busy. A hackathon is a commitment somebody is
 * deciding whether to spend a weekend on; the two facts that decide it are what
 * stage the event is at and whether the prize is real.
 */

export const metadata = { title: "Hackathons" };

/** Read fresh. A phase that changed an hour ago and still reads as open is a lie. */
export const revalidate = 0;

export default async function Hackathons() {
  const hackathons = await listHackathons();

  return (
    <main className="flex-1">
      <section className="border-b border-rule">
        <Measure wide className="py-16 sm:py-20">
          <Eyebrow>Every event</Eyebrow>

          <h1 className="mt-4 text-[clamp(2rem,4.5vw,3.25rem)]">Hackathons</h1>

          <p className="mt-5 max-w-[38rem] text-[1.0625rem] leading-relaxed text-ink-soft">
            Each one has its rules frozen on chain and its prize sitting in a
            contract. Open any of them without an account.
          </p>
        </Measure>
      </section>

      <Measure wide className="py-12">
        {hackathons.length === 0 ? <Empty /> : <List hackathons={hackathons} />}
      </Measure>
    </main>
  );
}

function List({ hackathons }: { hackathons: HackathonSummary[] }) {
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {hackathons.map((hackathon) => (
        <li key={hackathon.contract_id}>
          <Link
            href={`/hackathons/${hackathon.slug}`}
            className="group flex flex-col gap-3 py-7 transition-colors duration-150 ease-settle sm:flex-row sm:items-baseline sm:justify-between"
          >
            <div className="min-w-0">
              <h2 className="text-[1.375rem] transition-colors group-hover:text-ink-soft">
                {hackathon.name}
              </h2>

              {hackathon.tagline !== null && (
                <p className="mt-1.5 text-[0.9375rem] text-ink-soft">{hackathon.tagline}</p>
              )}
            </div>

            <Stage phase={hackathon.phase} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * What stage an event is at, in the words the contract uses.
 *
 * Not translated into friendlier language. A participant who reads "Judging"
 * here and "Judging" on the contract can tell they are the same claim, which is
 * worth more than a softer word.
 */
function Stage({ phase }: { phase: number | null }) {
  const settled = phase === 8 || phase === 9;

  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-[0.75rem] ring-1 ring-inset ${
        settled ? "text-ink-faint ring-rule" : "text-ink ring-rule-strong"
      }`}
    >
      {phaseName(phase)}
    </span>
  );
}

/**
 * Nothing to show, said plainly.
 *
 * An empty listing on a product like this usually means the indexer has not
 * reached anything yet rather than that no hackathon exists, and saying so is
 * more useful than an illustration of a box.
 */
function Empty() {
  return (
    <div className="py-16 text-center">
      <p className="text-[1.0625rem] text-ink">Nothing here yet.</p>

      <p className="mx-auto mt-3 max-w-[30rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        Either no hackathon has been created, or the indexer has not caught up
        with the chain. Both are visible from the outside, which is the point.
      </p>

      <Rule className="mx-auto mt-10 max-w-[12rem]" />
    </div>
  );
}
