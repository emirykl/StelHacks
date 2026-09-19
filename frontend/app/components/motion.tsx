"use client";

import { motion, useReducedMotion } from "framer-motion";
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
 * A surface that answers the cursor.
 *
 * It rises four pixels and takes a shadow only while hovered. The shadow is a
 * deliberate exception to a system that otherwise refuses them: a thing that
 * has visibly left the page has to cast something, and a card that lifts
 * without one reads as a rendering fault rather than as a response.
 */
export function Lift({
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
      whileHover={
        still ? undefined : { y: -4, boxShadow: "0 12px 28px -18px oklch(19% 0.008 60 / 0.45)" }
      }
      whileTap={still ? undefined : { y: -1, scale: 0.994 }}
      transition={settle}
    >
      {children}
    </motion.div>
  );
}
