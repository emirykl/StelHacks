"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * The three ways to look at one hackathon from the inside.
 *
 * The console was one long page: the stage, then the queue, then the entries,
 * stacked. That is the whole of running an event on a single scroll, and it put
 * an empty applications list under the nose of somebody whose event has not
 * opened, which reads as a product with nothing in it rather than as a stage
 * that has not arrived.
 *
 * The same idea as the public page's tabs and deliberately the same shape: one
 * event, asked three different questions, with everything that identifies it
 * staying put above them.
 *
 * State rather than a query on the URL, unlike the public page's. Nothing here
 * is worth sending to somebody else — the whole surface is behind a wallet that
 * has to be the organizer's — and a tab that survives a reload would take an
 * organizer back to the queue they left rather than to what is happening now.
 */

export type View = "overview" | "applications" | "submissions" | "schedule" | "details";

const NAMES: Record<View, string> = {
  overview: "Overview",
  applications: "Applications",
  submissions: "Submissions",
  schedule: "Schedule",
  details: "Details",
};

export function Panel({
  at,
  counts,
  onChange,
}: {
  at: View;
  /** Shown beside a tab that has a number worth knowing before opening it. */
  counts: Partial<Record<View, number | null>>;
  onChange: (next: View) => void;
}) {
  return (
    <nav
      aria-label="This hackathon"
      className="-mx-6 flex gap-1 overflow-x-auto border-b border-rule px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {(Object.keys(NAMES) as View[]).map((view) => (
        <One
          key={view}
          view={view}
          chosen={view === at}
          count={counts[view] ?? null}
          onChange={onChange}
        />
      ))}
    </nav>
  );
}

/**
 * One tab, and whether it is the one being read.
 *
 * The rule underneath is a single shared element rather than a border on
 * whichever tab is current, so choosing another slides it across. Copied from
 * the public page on purpose: two tab bars in one product that animate
 * differently are two controls to learn.
 */
function One({
  view,
  chosen,
  count,
  onChange,
}: {
  view: View;
  chosen: boolean;
  count: number | null;
  onChange: (next: View) => void;
}) {
  const still = useReducedMotion();

  return (
    <button
      type="button"
      onClick={() => onChange(view)}
      aria-current={chosen ? "page" : undefined}
      className={`relative flex shrink-0 items-center gap-2 px-4 py-4 text-[1rem] transition-colors duration-150 ease-settle ${
        chosen ? "text-ink" : "text-ink-soft hover:text-ink"
      }`}
    >
      {NAMES[view]}

      {count !== null && (
        <span
          className={`label px-1.5 py-0.5 ${
            chosen ? "bg-ink text-paper" : "bg-paper-sunk text-ink-faint"
          }`}
        >
          {count}
        </span>
      )}

      {chosen && (
        <motion.span
          aria-hidden
          layoutId="manage-tab-rule"
          className="absolute inset-x-0 bottom-0 h-0.5 bg-ink"
          transition={
            still ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 38, mass: 0.6 }
          }
        />
      )}
    </button>
  );
}
