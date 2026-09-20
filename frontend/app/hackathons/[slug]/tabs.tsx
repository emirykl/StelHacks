"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { Measure } from "../../components/primitives";
import { TABS, TAB_NAMES, type Tab } from "./tab";

/**
 * The four ways to read one hackathon.
 *
 * A tab is a link with a query on it rather than a piece of React state, for
 * the same reason the listing's filters are: a reader looking at the builds can
 * send that to somebody, open it in a second tab, and come back to it with the
 * back button. State in a component looks identical and does none of that.
 *
 * The rule that keeps them honest is that each tab is a different question
 * about the same event, not a different page. Everything above them, the
 * banner, the prize, the deadline, stays put while they change, because those
 * are the facts the whole page is about.
 */

export function Tabs({
  at,
  counts,
}: {
  at: Tab;
  /** Shown beside a tab that has a number worth knowing before opening it. */
  counts: Partial<Record<Tab, number | null>>;
}) {
  return (
    <div className="sticky top-16 z-[5] border-b border-rule bg-paper/85 backdrop-blur-xl">
      <Measure wide>
        {/* Scrolls sideways on a narrow screen rather than wrapping onto a
            second line. A tab bar that becomes two rows stops reading as one
            control and starts reading as a menu. */}
        <nav
          aria-label="This hackathon"
          className="-mx-6 flex gap-1 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((tab) => (
            <One key={tab} tab={tab} chosen={tab === at} count={counts[tab] ?? null} />
          ))}
        </nav>
      </Measure>
    </div>
  );
}

/**
 * One tab, and whether it is the one being read.
 *
 * The rule underneath is a single shared element rather than a border on
 * whichever tab is current, so choosing another slides it across. It is the
 * same idea as the filter's marker and for the same reason: a thing that moves
 * can be followed, and being able to follow it is what tells somebody their
 * click landed.
 */
function One({ tab, chosen, count }: { tab: Tab; chosen: boolean; count: number | null }) {
  const still = useReducedMotion();

  return (
    <Link
      href={`?tab=${tab}`}
      scroll={false}
      aria-current={chosen ? "page" : undefined}
      className={`relative flex shrink-0 items-center gap-2 px-4 py-4 text-[1rem] transition-colors duration-150 ease-settle ${
        chosen ? "text-ink" : "text-ink-soft hover:text-ink"
      }`}
    >
      {TAB_NAMES[tab]}

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
          layoutId="tab-rule"
          className="absolute inset-x-0 bottom-0 h-0.5 bg-ink"
          transition={
            still ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 38, mass: 0.6 }
          }
        />
      )}
    </Link>
  );
}
