"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

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
 * What it looks like is a separate problem, and it was the one this got wrong.
 * Two rows of bare capitals with nothing naming them read as a navigation bar
 * somebody had run out of room for: you could see that one word was filled in
 * black and not that the row was a question or that the black one was your
 * answer. So the block now says it is a filter, each row says which question it
 * asks, and the filled marker is one object that travels between the answers
 * instead of appearing in a new place each time.
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
    <section aria-labelledby="filter-heading" className="border-y border-rule">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-rule py-3">
        <h2 id="filter-heading" className="label flex items-center gap-2 text-ink">
          <Funnel />
          Filter
        </h2>

        <div className="flex items-center gap-4">
          {/* Said plainly rather than left to be counted. A page showing twelve
              of thirty three should say so, or a reader takes the twelve for
              all of them. */}
          <p className="label text-ink-faint">
            {showing === total ? `${total} in all` : `${showing} of ${total}`}
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

      <Row label="Stage">
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
      </Row>

      {tags.length > 0 && (
        <Row label="Topic">
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
        </Row>
      )}
    </section>
  );
}

/**
 * One question and its answers, on a line of their own.
 *
 * The label on the left is what turns a row of words into a question. Without
 * it "Payments" and "Finished" are the same kind of thing in the same type on
 * two lines, and a reader has to click one to find out that they are not.
 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-rule py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-5">
      <span className="label shrink-0 text-ink-faint sm:w-16">{label}</span>

      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">{children}</div>
    </div>
  );
}

/**
 * One answer, and whether it is the one in force.
 *
 * The chosen one is filled rather than outlined. An outline that thickens is
 * the usual way to show this and it is the one that disappears on a screen
 * somebody is glancing at.
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
      className={`label relative px-3 py-2 transition-colors duration-150 ease-settle ${
        chosen ? "text-paper" : "text-ink-soft hover:bg-paper-sunk hover:text-ink"
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

/** The mark everybody already reads as narrowing something down. */
function Funnel() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3 shrink-0"
    >
      <path d="M1.5 2h9L7 6.2v3.4L5 10.7V6.2L1.5 2Z" />
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
