"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * The movements this product is allowed to make.
 *
 * Kept in one file for the same reason the buttons are: the moment there are
 * two ways to animate a panel opening, some screen will use both. Each of
 * these answers a question a reader has actually asked. Nothing here moves on
 * its own, and nothing here moves while it is being read.
 *
 * Every one of them checks `useReducedMotion` and goes still rather than fast.
 * The stylesheet already flattens CSS transitions for that preference, but a
 * spring driven from JavaScript never reaches the stylesheet, so honouring it
 * has to be done here by hand.
 */

/* Apple's deceleration, expressed as a spring rather than a curve. A spring
   settles at a speed that depends on how far it travelled, which is what makes
   a small movement feel quick and a large one feel weighty without either
   being timed separately. */
const settle = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.7 };

/**
 * A small control that acknowledges being pressed.
 *
 * For icon buttons, where there is no label to change and no page to navigate
 * to, so the press itself is the only confirmation available.
 */
export function Press({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const still = useReducedMotion();

  return (
    <motion.div
      className={className}
      whileHover={still ? undefined : { scale: 1.04 }}
      whileTap={still ? undefined : { scale: 0.94 }}
      transition={settle}
    >
      {children}
    </motion.div>
  );
}

/**
 * A panel that opens from the control that opened it.
 *
 * It scales up from just under full size while dropping a few pixels, which
 * reads as the panel coming out of the button rather than appearing over it.
 * The transform origin is what ties it there: without one the panel grows from
 * its own centre and the connection is lost, so every caller sets it.
 */
export function Pop({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  const still = useReducedMotion();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={className}
          initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -6 }}
          animate={still ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={still ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
          transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
