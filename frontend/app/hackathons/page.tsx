import Link from "next/link";

import { Measure, Rule } from "../components/primitives";
import { HackathonCard } from "../components/hackathon-card";
import { Filters } from "./filters";
import {
  PAGE,
  countHackathons,
  listHackathons,
  tagsInUse,
  type HackathonSummary,
} from "../../lib/chain";

/**
 * Everything running, readable by anybody.
 *
 * The listing is the observer surface at its simplest, and the thing it must
 * get right is not looking busy. A hackathon is a commitment somebody is
 * deciding whether to spend a weekend on; the two facts that decide it are what
 * stage the event is at and whether the prize is real.
 */

/** Read fresh. A phase that changed an hour ago and still reads as open is a lie. */
export const revalidate = 0;

export default async function Hackathons({ searchParams }: PageProps<"/hackathons">) {
  const asked = await searchParams;

  const filter = {
    stage: one(asked["stage"]),
    tag: one(asked["tag"]),
    q: one(asked["q"]),
    limit: Number(one(asked["show"]) ?? PAGE) || PAGE,
  };

  const [hackathons, total, tags] = await Promise.all([
    listHackathons(filter),
    countHackathons(filter),
    tagsInUse(),
  ]);

  return (
    <main className="flex-1">
      <section className="border-b border-rule">
        <Measure wide className="py-16 sm:py-20">
          {/* The eyebrow above this said "Every event", which is what a listing
              already is. A line of small capitals earns its place by telling a
              reader something the heading under it does not. */}
          <h1 className="text-[clamp(2rem,4.5vw,3.25rem)]">Hackathons</h1>

          <p className="mt-5 max-w-[38rem] text-[1.0625rem] leading-relaxed text-ink-soft">
            Every hackathon listed here has its rules and its prize written on
            chain before anybody registers.
          </p>
        </Measure>
      </section>

      <Measure wide className="pb-12">
        <Filters
          applied={{ stage: filter.stage, tag: filter.tag, q: filter.q }}
          tags={tags}
          showing={hackathons.length}
          total={total}
        />

        <div className="py-10">
          {hackathons.length === 0 ? (
            <Empty narrowed={filter.stage !== undefined || filter.tag !== undefined} />
          ) : (
            <List hackathons={hackathons} />
          )}
        </div>

        {/* A link rather than a button, so the longer page is a page: it can be
            sent to somebody and it comes back with the browser's own history
            rather than resetting to twelve. */}
        {hackathons.length < total && (
          <Link
            href={more(asked, filter.limit + PAGE)}
            className="label flex h-12 items-center justify-center border border-rule text-ink transition-colors duration-150 ease-settle hover:bg-paper-sunk"
          >
            Show {Math.min(PAGE, total - hackathons.length)} more
          </Link>
        )}
      </Measure>
    </main>
  );
}

/* The same card as the home page, so a hackathon looks like itself wherever it
   turns up and there is one place to change how it reads. */
function List({ hackathons }: { hackathons: HackathonSummary[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {hackathons.map((hackathon) => (
        <HackathonCard key={hackathon.contract_id} hackathon={hackathon} />
      ))}
    </div>
  );
}

/**
 * Nothing to show, said plainly.
 *
 * An empty listing on a product like this usually means the indexer has not
 * reached anything yet rather than that no hackathon exists, and saying so is
 * more useful than an illustration of a box.
 */
function Empty({ narrowed }: { narrowed: boolean }) {
  return (
    <div className="py-16 text-center">
      <p className="text-[1.0625rem] text-ink">
        {narrowed ? "Nothing matches that." : "Nothing here yet."}
      </p>

      {/* Two different situations and two different sentences. Telling somebody
          who filtered to "payments" that the indexer might be behind sends them
          to look at the wrong thing. */}
      <p className="mx-auto mt-3 max-w-[30rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        {narrowed
          ? "Try a wider filter, or clear it to see everything."
          : "Either nobody has created one, or our indexer is behind the chain. The contract will tell you which."}
      </p>

      <Rule className="mx-auto mt-10 max-w-[12rem]" />
    </div>
  );
}

/** A query value is a string or a list of them; a filter wants one. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The same filters, showing more. */
function more(asked: Record<string, string | string[] | undefined>, show: number): string {
  const params = new URLSearchParams();

  for (const key of ["stage", "tag", "q"]) {
    const value = one(asked[key]);

    if (value !== undefined && value.length > 0) {
      params.set(key, value);
    }
  }

  params.set("show", String(show));

  return `/hackathons?${params.toString()}`;
}
