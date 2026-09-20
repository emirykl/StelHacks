import Link from "next/link";

import { ButtonLink, Measure, Rule } from "../components/primitives";
import { HackathonCard } from "../components/hackathon-card";
import { Filters } from "./filters";
import {
  PAGE,
  countHackathons,
  listHackathons,
  tagsInUse,
  type HackathonSummary,
} from "../../lib/chain";
import { currentUser, serverClient } from "../../lib/supabase/server";
import { mayOrganize } from "../../lib/organizing";

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

  /* Asked here rather than in the card, because this is the page somebody
     approved to run an event lands on when they want to start the next one.
     Through the same function the schema answers with, so the button being
     offered and the create page accepting the press are one decision. */
  const user = await currentUser();
  const db = user === null ? null : await serverClient();

  const [hackathons, counted, tags, mayCreate] = await Promise.all([
    listHackathons(filter),
    countHackathons(filter),
    tagsInUse(),
    db === null ? false : mayOrganize(db),
  ]);

  /*
    The count is a row count and the list is what survived being read from the
    chain, so the two disagree whenever a hackathon on superseded code is
    dropped. A page that says "five in all" above four cards is describing a
    fifth nobody can reach.

    Trusting the list is the right way to resolve it: a page that came back
    under its own limit has nothing left to fetch, so its length is the whole
    answer. Only a full page still needs the count, and a full page is one where
    the number is a lower bound anyway.
  */
  const total = hackathons.length < filter.limit ? hackathons.length : counted;

  return (
    <main className="flex-1">
      <section className="border-b border-rule">
        <Measure wide className="py-16 sm:py-20">
          <div className="flex items-center justify-between gap-12">
            <div className="min-w-0">
              {/* The eyebrow above this said "Every event", which is what a
                  listing already is. A line of small capitals earns its place by
                  telling a reader something the heading under it does not. */}
              <h1 className="text-[clamp(2.5rem,5.5vw,4rem)]">Hackathons</h1>

              <p className="mt-6 max-w-[40rem] text-[1.25rem] leading-relaxed text-ink-soft">
                Every hackathon listed here has its rules and its prize written
                on chain before anybody registers.
              </p>

              {/* Only for somebody already holding a grant. Everybody else is
                  offered the application, from the landing page and the footer,
                  and a create button that leads to a refusal would be the site
                  inviting a press it has already decided to reject. */}
              {mayCreate && (
                <ButtonLink href="/create" className="mt-10">
                  Create a hackathon
                </ButtonLink>
              )}
            </div>

            {/*
              The right of this band was empty at every width past a laptop, and
              the heading and its one sentence sat in a third of a very wide
              room. It is the only page in the product with a whole column of
              nothing on it.

              Hidden below `lg` rather than scaled down. On a narrow screen the
              space it fills does not exist, and a decoration that pushes the
              first card further from the heading has stopped being decoration.
              Sized in rem so it holds its proportions rather than growing with
              the column.

              Cropped rather than shrunk, and the crop is what the box is for.
              The source frames the cat small in the middle of a wide shot with
              a third of the height empty above and below, so at the size the
              layout allows the cat itself came out tiny while a band of nothing
              set the height of the page's first section.

              The frame keeps its footprint and the picture is scaled up inside
              it. Nothing around this moves; only the cat gets larger, and the
              empty margins go past the edge and are clipped.
            */}
            <div className="hidden aspect-[4/3] w-[20rem] shrink-0 overflow-hidden lg:block xl:w-[23rem]">
              <img
                src="/gif/cat.gif"
                alt=""
                width={440}
                height={330}
                className="size-full scale-[0.95] object-cover"
              />
            </div>
          </div>
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
    /* Three at the widest rather than four. A card carries a banner, a mark, a
       name at twenty six pixels, a place, tags and a prize; at a quarter of the
       window the name wrapped to three lines and the tags to two. */
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
      <p className="text-[1.125rem] text-ink">
        {narrowed ? "Nothing matches that." : "Nothing here yet."}
      </p>

      {/* Two different situations and two different sentences. Telling somebody
          who filtered to "payments" that the indexer might be behind sends them
          to look at the wrong thing. */}
      <p className="mx-auto mt-3 max-w-[30rem] text-[1rem] leading-relaxed text-ink-soft">
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
