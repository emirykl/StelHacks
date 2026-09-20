"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Narrowing the list, in the URL rather than in a component's memory.
 *
 * Every choice is a link, so a filtered list can be sent to somebody, opened in
 * a second tab, and returned to with the back button. A set of buttons holding
 * the same state in React would look identical and do none of that.
 *
 * It also means the filtering happens where the data is. The page reads these
 * off the request and asks the chain only about the cards it is going to show,
 * which is the difference between a list that pages and one that gets slower
 * the more hackathons exist.
 *
 * The search box is the newest part and the one that was missing longest. The
 * `q` filter has matched names and taglines since the listing was built and
 * nothing on any screen ever set it, so the feature existed and could not be
 * reached. A row of category chips with no way to type a name is a filter that
 * answers questions nobody asked and refuses the one everybody does.
 */

export interface Applied {
  stage?: string | undefined;
  tag?: string | undefined;
  q?: string | undefined;
}

const stages = [
  { value: "", label: "All" },
  { value: "open", label: "Running" },
  { value: "upcoming", label: "Not open yet" },
  { value: "finished", label: "Finished" },
] as const;

export function Filters({
  applied,
  tags,
  showing,
  total,
}: {
  applied: Applied;
  tags: string[];
  showing: number;
  total: number;
}) {
  const narrowed =
    (applied.stage ?? "") !== "" || (applied.tag ?? "") !== "" || (applied.q ?? "") !== "";

  return (
    <section aria-label="Find a hackathon" className="border-y border-rule">
      {/*
        One row rather than three.

        This was a search box, then a labelled row of four statuses, then a
        labelled row of eight topics, stacked with a hairline between each. Three
        bands of chrome above two cards read as the filtering being the page.
        The status choices are short and there are four of them, so they sit
        beside the search; the topics are open ended and go behind a disclosure,
        which is where a control somebody uses occasionally belongs.
      */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 py-3">
        <Search applied={applied} />

        <div className="flex flex-wrap items-center gap-1">
          {stages.map((stage) => (
            <Choice
              key={stage.value}
              group="stage"
              href={linkTo({ ...applied, stage: stage.value })}
              chosen={(applied.stage ?? "") === stage.value}
            >
              {stage.label}
            </Choice>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-4">
          {/* Said plainly rather than left to be counted, and said differently
              once something is filtered. "1 in all" under a search reads as a
              site with one hackathon on it rather than as one that matched. */}
          <p className="label text-ink-faint">
            {narrowed
              ? `${showing} ${showing === 1 ? "match" : "matches"}`
              : showing === total
                ? `${total} in all`
                : `${showing} of ${total}`}
          </p>

          {/* Only once there is something to undo. A permanent clear on an
              unfiltered list is a control that does nothing, and a reader who
              presses it learns to expect nothing from the next one. */}
          {narrowed && (
            <Link
              href="/hackathons"
              className="label flex items-center gap-1.5 text-ink-soft transition-colors duration-150 ease-settle hover:text-broken"
            >
              <span aria-hidden>×</span>
              Clear
            </Link>
          )}
        </div>
      </div>

      {tags.length > 0 && (
        /* Open when a topic is chosen, so a filtered list never hides the thing
           doing the filtering. */
        <details open={(applied.tag ?? "") !== ""} className="group border-t border-rule">
          <summary className="label flex cursor-pointer list-none items-center gap-2 py-2.5 text-ink-soft transition-colors duration-150 ease-settle hover:text-ink">
            <span aria-hidden className="transition-transform duration-150 ease-settle group-open:rotate-90">
              ›
            </span>
            Topic
            {(applied.tag ?? "") !== "" && <span className="text-ink">· {applied.tag}</span>}
          </summary>

          <div className="flex flex-wrap items-center gap-1 pb-3">
            <Choice
              group="tag"
              href={linkTo({ ...applied, tag: "" })}
              chosen={(applied.tag ?? "") === ""}
            >
              Everything
            </Choice>

            {tags.map((tag) => (
              <Choice
                key={tag}
                group="tag"
                href={linkTo({ ...applied, tag })}
                chosen={applied.tag === tag}
              >
                {tag}
              </Choice>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

/**
 * Typing a name, which is what somebody with one in mind actually wants.
 *
 * It navigates on submit rather than on every keystroke. A list that reorders
 * itself under a half typed word is a list somebody has to stop typing to read,
 * and each of those keystrokes is a round trip to the chain for every card on
 * the page.
 *
 * The field keeps the URL's own value when that changes underneath it, so
 * pressing back after a search leaves the box holding what the results are
 * actually for rather than what was last typed into it.
 */
function Search({ applied }: { applied: Applied }) {
  const router = useRouter();
  const asked = applied.q ?? "";
  const [typed, setTyped] = useState(asked);

  useEffect(() => setTyped(asked), [asked]);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(linkTo({ ...applied, q: typed.trim() }));
      }}
      className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-[24rem]"
    >
      <label className="flex min-w-0 flex-1 items-center gap-2.5 bg-paper-sunk px-3 ring-1 ring-inset ring-rule transition-shadow duration-150 ease-settle focus-within:ring-ink">
        <Glass />

        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          type="search"
          placeholder="Search by name"
          aria-label="Search hackathons by name"
          className="h-9 min-w-0 flex-1 bg-transparent text-[0.875rem] text-ink outline-none placeholder:text-ink-faint"
        />
      </label>

      {/* Only once there is something to submit. An always visible Search beside
          an empty box is a button whose only job is to reload the page. */}
      {typed.trim() !== asked && (
        <button
          type="submit"
          className="label h-9 shrink-0 bg-ink px-3 text-paper transition-colors duration-150 ease-settle hover:bg-ink/85 active:translate-y-px"
        >
          Search
        </button>
      )}
    </form>
  );
}


/**
 * One answer, and whether it is the one in force.
 *
 * Set in sentence case rather than capitals. These are choices somebody is
 * scanning, not values the chain is quoting, and a row of tracked out capitals
 * reads as a specification a reader is meant to study rather than a control
 * they are meant to press.
 *
 * The fill is a single shared element per row rather than a background on
 * whichever link happens to be current, so choosing a different answer slides
 * it across instead of extinguishing it here and lighting it there. That is
 * what makes the row read as one control with a setting: the marker is a thing
 * that moves, and a thing that moves is a thing you can follow to see what you
 * just did.
 */
function Choice({
  group,
  href,
  chosen,
  children,
}: {
  group: string;
  href: string;
  chosen: boolean;
  children: ReactNode;
}) {
  const still = useReducedMotion();

  return (
    <Link
      href={href}
      aria-current={chosen ? "true" : undefined}
      className={`relative px-3 py-1.5 text-[0.875rem] transition-colors duration-150 ease-settle ${
        chosen ? "font-semibold text-paper" : "text-ink-soft hover:bg-paper-sunk hover:text-ink"
      }`}
    >
      {chosen && (
        <motion.span
          aria-hidden
          layoutId={`chosen-${group}`}
          className="absolute inset-0 bg-ink"
          transition={
            still
              ? { duration: 0 }
              : { type: "spring", stiffness: 480, damping: 38, mass: 0.6 }
          }
        />
      )}

      {/* Above the marker, which is absolutely positioned over the whole link
          and would otherwise cover the word it is meant to be highlighting. */}
      <span className="relative">{children}</span>
    </Link>
  );
}

/** The mark everybody already reads as "type here to look for something". */
function Glass() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      className="size-3.5 shrink-0 text-ink-faint"
    >
      <circle cx="6" cy="6" r="4.2" />
      <path d="M9.2 9.2 12.5 12.5" />
    </svg>
  );
}

/** The same page with one thing changed, and empty choices left out of the URL. */
function linkTo(applied: Applied): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(applied)) {
    if (typeof value === "string" && value.length > 0) {
      params.set(key, value);
    }
  }

  const query = params.toString();

  return query.length === 0 ? "/hackathons" : `/hackathons?${query}`;
}
