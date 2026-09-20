/**
 * Which tab is being read, decided from the URL.
 *
 * Kept out of `tabs.tsx` because that file is a client component and this is
 * read on the server: the page has to know which tab to render before it sends
 * anything, and a function exported from a `"use client"` module cannot be
 * called from there at all. Same knowledge, two callers, one of them on each
 * side of the boundary.
 */

export type Tab = "details" | "projects" | "results" | "hackers" | "find-team";

/* Results last, because it is the tab that is empty for most of an event and
   the one people return for after it. A tab that says "not yet" for three days
   should not sit between two that always have something in them. */
export const TABS: Tab[] = ["details", "projects", "hackers", "find-team", "results"];

export const TAB_NAMES: Record<Tab, string> = {
  details: "Details",
  projects: "Projects",
  results: "Results",
  hackers: "Hackers",
  "find-team": "Find a team",
};

/**
 * Whatever arrived in the URL, or the tab a reader gets when they arrive.
 *
 * Anything unrecognised falls to the details rather than erroring. A query
 * string is something anybody can type, and a hackathon page that four
 * hundreds because somebody mistyped a tab name is a page that punishes
 * curiosity.
 */
export function tabFrom(value: string | string[] | undefined): Tab {
  const asked = Array.isArray(value) ? value[0] : value;

  return TABS.includes(asked as Tab) ? (asked as Tab) : "details";
}
