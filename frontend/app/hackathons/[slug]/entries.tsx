"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { entriesOf, type Entry } from "../../../lib/submissions";
import { explorerFor } from "../../../lib/explorer";
import type { Card } from "../../../lib/project";

/**
 * What was actually entered, for anybody to look at.
 *
 * This was a spec table: a numbered row per team, the digest set in full, the
 * pinned URL underneath. That is the right shape for the parts of this page
 * that exist to be checked, and the wrong one here. Somebody on this tab is
 * browsing work, and a browser wants to see the thing before deciding to open
 * it. So the projects are cards, in the same frame as the hackathons on the
 * listing, and the digest moves to the project's own page where a reader has
 * already said they care about this one.
 *
 * A struck out entry keeps its card. Removing it would leave a reader unable to
 * tell a hackathon where nothing was disqualified from one where the record was
 * tidied afterwards, which is the distinction the whole product exists to make.
 */

export function Entries({
  contractId,
  slug,
  visibility,
  cards,
}: {
  contractId: string;
  slug: string;
  /** An index into `VISIBILITY`, or nothing when the contract was unreachable. */
  visibility: number | null;
  /** What the teams wrote about themselves, by team id, read on the server. */
  cards: Record<number, Card>;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let alive = true;

    void entriesOf(contractId).then((found) => {
      if (alive) {
        setEntries(found);
      }
    });

    return () => {
      alive = false;
    };
  }, [contractId]);

  if (entries === null) {
    return null;
  }

  /*
    Nothing entered yet, said plainly and on its own.

    The reading rules used to be printed above this list whether or not there
    was a list, so an event nobody had entered opened with a paragraph about who
    may read a gallery that did not exist. Who can read them is a fact about
    projects, and it waits until there are some.
  */
  if (entries.length === 0) {
    return (
      <section className="border-t border-rule">
        <div className="mx-auto w-full max-w-[96rem] px-6 py-16">
          <p className="max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
            No projects submitted yet.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="border-t border-rule">
      <div className="mx-auto w-full max-w-[96rem] px-6 py-16">
        <h2 className="text-[2rem] leading-tight">
          {entries.length} {entries.length === 1 ? "project" : "projects"}
        </h2>

        {visibility !== null && (
          <p className="mt-4 max-w-[46rem] text-[0.9375rem] leading-relaxed text-ink-soft">
            {explained[visibility] ?? explained[2]}
          </p>
        )}

        <ul className="mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <li key={entry.team}>
              <Project entry={entry} slug={slug} card={cards[entry.team]} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * One project, in the same frame the hackathon cards use.
 *
 * Banner across the top in its own proportions, the mark over its lower edge,
 * then the name. A team that entered without ever writing a description still
 * fills this shape — the hatch stands in for both images and the team number
 * for the name — because the chain accepted that entry and a card that collapsed
 * would be describing a smaller event than the one that happened.
 */
function Project({
  entry,
  slug,
  card,
}: {
  entry: Entry;
  slug: string;
  card: Card | undefined;
}) {
  const title = card?.title ?? `Team ${entry.team}`;
  const links = linksOf(card);

  return (
    <div
      className={`group flex h-full flex-col overflow-hidden border border-rule bg-paper transition-[border-color,box-shadow] duration-150 ease-settle hover:border-ink hover:ring-1 hover:ring-inset hover:ring-ink ${
        entry.invalid ? "opacity-60" : ""
      }`}
    >
      <Link href={`/hackathons/${slug}/projects/${entry.team}`} className="block">
        <div className="relative aspect-[5/2] overflow-hidden border-b border-rule">
          {card?.bannerUrl == null ? (
            <div className="hatch size-full" aria-hidden />
          ) : (
            <img src={card.bannerUrl} alt="" className="size-full object-cover" />
          )}

          {/* The track sits where the phase badge sits on a hackathon card,
              because it answers the same kind of question: which part of the
              event is this. Struck out replaces it rather than joining it —
              a disqualified entry's category is no longer the thing to say. */}
          <span
            className={`label absolute left-3 top-3 px-2.5 py-1.5 ${
              entry.invalid
                ? "bg-broken text-paper"
                : "bg-paper text-ink ring-1 ring-inset ring-rule"
            }`}
          >
            {entry.invalid ? "Struck out" : entry.track}
          </span>
        </div>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-5 px-5 pb-5">
        <div className="min-w-0">
          {/* Round, because that is how this project's own page draws it, and a
              mark that changes shape between the listing and the page it opens
              reads as a different project. */}
          <div className="relative z-10 -mt-8 mb-4 size-14 overflow-hidden rounded-full border border-rule bg-paper">
            {card?.logoUrl == null ? (
              <div className="hatch size-full" aria-hidden />
            ) : (
              <img src={card.logoUrl} alt="" className="size-full object-cover" />
            )}
          </div>

          <h3 className="min-w-0 text-[1.25rem] leading-tight">
            <Link
              href={`/hackathons/${slug}/projects/${entry.team}`}
              className="transition-colors group-hover:text-ink-soft"
            >
              {title}
            </Link>
          </h3>

          {card?.summary != null && (
            <p className="mt-2 line-clamp-3 text-[0.9375rem] leading-relaxed text-ink-soft">
              {card.summary}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-rule pt-4">
          <p className="label text-ink-faint">
            {entry.members.length === 0
              ? "no roster"
              : `${entry.members.length} ${entry.members.length === 1 ? "member" : "members"}`}
          </p>

          {/* Outside the title link and not wrapping it, because an anchor
              inside an anchor is invalid and the browser resolves it by
              dropping one — the repository mark would have quietly opened the
              project page instead of the repository. */}
          {links.length > 0 && (
            <ul className="flex shrink-0 items-center gap-0.5">
              {links.map((link) => (
                <li key={link.title}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={link.title}
                    title={link.title}
                    className="grid size-8 place-items-center rounded-full text-ink-soft transition-colors duration-150 ease-settle hover:bg-paper-sunk hover:text-ink"
                  >
                    {link.icon}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** The shortcuts a project has, in the order the submission form asks for them. */
function linksOf(card: Card | undefined) {
  if (card === undefined) {
    return [];
  }

  return [
    card.repositoryUrl === null
      ? null
      : { title: "Repository", href: card.repositoryUrl, icon: <Repo /> },
    card.liveUrl === null ? null : { title: "Live", href: card.liveUrl, icon: <Globe /> },
    card.demoVideoUrl === null
      ? null
      : { title: "Demo video", href: card.demoVideoUrl, icon: <Play /> },
    card.contractAddress === null
      ? null
      : {
          title: "Contract",
          href: explorerFor("contract", card.contractAddress),
          icon: <Stellar />,
        },
  ].filter((link) => link !== null);
}

/* Drawn rather than fetched, for the reason the map pin on a hackathon card is:
   a grid of these should ship no extra requests. */

function Repo() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className="size-4 shrink-0">
      <path d="M8 .8a7.2 7.2 0 0 0-2.28 14.03c.36.07.49-.16.49-.35v-1.23c-2 .44-2.43-.96-2.43-.96-.33-.83-.8-1.06-.8-1.06-.65-.45.05-.44.05-.44.72.05 1.1.74 1.1.74.64 1.1 1.68.78 2.09.6.07-.47.25-.79.46-.97-1.6-.18-3.28-.8-3.28-3.56 0-.79.28-1.43.74-1.93-.07-.19-.32-.92.07-1.91 0 0 .6-.2 1.98.73a6.8 6.8 0 0 1 3.6 0c1.37-.93 1.97-.73 1.97-.73.4.99.15 1.72.07 1.9.47.51.75 1.15.75 1.94 0 2.77-1.69 3.38-3.29 3.56.26.22.49.66.49 1.33v1.97c0 .19.13.42.5.35A7.2 7.2 0 0 0 8 .8Z" />
    </svg>
  );
}

function Stellar() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="size-4 shrink-0">
      <path d="M12 1.6a10.4 10.4 0 0 0-9.2 5.6l1.9 1a8.3 8.3 0 0 1 14.1-1.5l1.7-1.3A10.4 10.4 0 0 0 12 1.6Zm0 20.8a10.4 10.4 0 0 0 9.2-5.6l-1.9-1a8.3 8.3 0 0 1-14.1 1.5l-1.7 1.3A10.4 10.4 0 0 0 12 22.4Z" />
      <path d="m12 7.4 1.3 3.3 3.3 1.3-3.3 1.3L12 16.6l-1.3-3.3L7.4 12l3.3-1.3L12 7.4Z" />
    </svg>
  );
}

function Globe() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      className="size-4 shrink-0"
    >
      <circle cx="8" cy="8" r="6.2" />
      <path d="M1.8 8h12.4M8 1.8c1.6 1.7 2.5 3.9 2.5 6.2S9.6 12.5 8 14.2C6.4 12.5 5.5 10.3 5.5 8S6.4 3.5 8 1.8Z" />
    </svg>
  );
}

function Play() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      className="size-4 shrink-0"
    >
      <rect x="1.4" y="3.2" width="13.2" height="9.6" rx="2.4" />
      <path d="M6.7 6.2 10.4 8l-3.7 1.8V6.2Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* The three levels the contract holds, said the way somebody entering would ask
   the question. Their order is the contract's, so the index is the answer. */
const explained = [
  "Anybody can read every project in this event, signed in or not. The organizer chose that before the rules were locked and cannot narrow it now.",
  "Only people the organizer approved into this event can read the projects. If you are not on that list you will see nothing here, which is the rule working rather than an empty hackathon.",
  "Nobody but the organizer reads a project before the result is published. What is below is what the chain records about a submission, which is a digest and a link rather than the work itself.",
];
