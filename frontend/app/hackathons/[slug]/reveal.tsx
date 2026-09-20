"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";

/**
 * The moment the seals come off, played once.
 *
 * Everything under here was decided weeks earlier and sat as a digest nobody
 * could read — the scorecards, the ballots, the order they imply. Then a phase
 * changes and all of it opens at once. That is the one genuinely dramatic thing
 * this product does, and a page that simply had the answer already on it when
 * you arrived would throw the drama away.
 *
 * So the result arrives rather than appearing. The seal breaks, the cat comes
 * through it, and the board rises underneath. About a second and a half, once
 * per visit, and never in the way: what is animated is the arrival, so the
 * ranking is readable from the first frame it is drawn in.
 *
 * It plays once per browser session per hackathon. A reader who came back to
 * check second place does not want a ceremony, and a reader who refreshed
 * because they missed it does — `sessionStorage` is the line between the two,
 * and it forgets when they close the tab, which is the right kind of memory
 * for a thing this small.
 */

export function Reveal({
  contractId,
  children,
}: {
  /** What the ceremony belongs to, so two hackathons each get their own. */
  contractId: string;
  children: ReactNode;
}) {
  const still = useReducedMotion();
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    const key = `revealed:${contractId}`;

    /* Read in an effect rather than in the initial state, because the server
       renders this too and it has no session to read. Guessing either way
       would mean the markup it sends disagrees with what the browser draws. */
    try {
      const already = window.sessionStorage.getItem(key) !== null;

      setSeen(already);
      window.sessionStorage.setItem(key, "1");
    } catch {
      // A browser refusing storage is a browser that sees it every time, which
      // is a far better failure than one that sees a blank space.
      setSeen(false);
    }
  }, [contractId]);

  /* Nothing until the session has been read, so the ceremony is never half
     started. It is one frame on any real machine. */
  if (seen === null) {
    return <div className="opacity-0">{children}</div>;
  }

  if (seen || still) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <Seal />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.85, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * The seal itself: a ring that breaks, and the cat coming through it.
 *
 * Drawn over the board rather than before it, and it leaves. A curtain that has
 * to be dismissed is a curtain somebody has to think about; this one is gone by
 * the time anybody would have reached for it.
 */
function Seal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setOpen(true), 1_150);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {!open && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 -top-14 z-10 grid place-items-center"
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
        >
          <div className="relative grid place-items-center">
            {/* The ring, widening and thinning out — a seal giving way rather
                than a spinner. It is behind the cat, so the cat reads as coming
                through it. */}
            <motion.span
              aria-hidden
              className="absolute size-32 rounded-full ring-2 ring-signal"
              initial={{ scale: 0.4, opacity: 0.9 }}
              animate={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            />
            <motion.span
              aria-hidden
              className="absolute size-32 rounded-full ring-1 ring-rule-strong"
              initial={{ scale: 0.4, opacity: 0.7 }}
              animate={{ scale: 3.2, opacity: 0 }}
              transition={{ duration: 1.1, delay: 0.12, ease: "easeOut" }}
            />

            {/* The cut out version rather than the header's tile. The tile is
                there so a black laptop screen survives a dark background at
                44 pixels; here the art is drawn four times that size over the
                page's own surface, where a square of night would read as a
                sticker somebody dropped on the result. */}
            <motion.img
              src="/stelhacks-nobg.png"
              alt=""
              width={176}
              height={176}
              className="w-44"
              initial={{ scale: 0.2, opacity: 0, rotate: -12 }}
              animate={{ scale: [0.2, 1.12, 1], opacity: 1, rotate: 0 }}
              transition={{ duration: 0.7, times: [0, 0.65, 1], ease: "easeOut" }}
            />
          </div>

          <motion.p
            className="label -mt-2 text-[0.8125rem] tracking-[0.16em] text-ink-faint"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.15, times: [0, 0.35, 0.75, 1] }}
          >
            The seals are open
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
