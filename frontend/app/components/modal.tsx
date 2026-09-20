"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A panel that takes the page over until it is answered.
 *
 * The first one of these in the product, and it exists because asking to run
 * events is a detour rather than a destination: somebody reading the landing
 * page is being persuaded, and sending them to a different URL to fill in seven
 * fields loses the argument they were halfway through. A panel over the page
 * keeps the page.
 *
 * Three things a dialog has to get right and each is easy to skip:
 *
 *   escape closes it, because a panel with one way out is one people feel stuck
 *   in even when they can see the close button
 *
 *   the page behind stops scrolling, or the backdrop turns into a window onto
 *   content moving for no reason
 *
 *   focus moves inside on open and back to the opener on close, or a keyboard
 *   reader is left tabbing through a page they cannot see
 */

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Named for the reader who cannot see it, and drawn by the caller. */
  title: string;
  children: ReactNode;
}) {
  const still = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    opener.current = document.activeElement;

    /* Compensated with padding rather than just hidden. Taking the scrollbar
       away without replacing its width shifts the whole page left by however
       many pixels it occupied, which reads as the layout breaking at the exact
       moment something opened on top of it. */
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const { overflow, paddingRight } = document.body.style;

    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${gap}px`;

    /* After the panel has painted, or there is nothing to focus yet. */
    const focused = requestAnimationFrame(() => {
      panel.current?.querySelector<HTMLElement>(
        "input, textarea, select, button, [href]",
      )?.focus();
    });

    function key(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", key);

    return () => {
      cancelAnimationFrame(focused);
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;

      /* Back where it came from, so closing does not drop a keyboard reader at
         the top of the document. */
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            aria-hidden
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
          />

          {/* Rises from below on a phone and grows in place on a desktop, which
              is where each of those gestures is the one the platform already
              uses for a panel that has to be answered. */}
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={still ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={still ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={still ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="relative m-0 max-h-[92dvh] w-full overflow-y-auto rounded-t-[1.25rem] bg-paper p-7 ring-1 ring-rule sm:m-4 sm:max-w-[32rem] sm:rounded-[1.25rem] sm:p-8"
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** The way out, drawn once so every panel has the same one in the same corner. */
export function ModalClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="absolute right-5 top-5 grid size-8 place-items-center rounded-full text-ink-faint transition-colors duration-150 ease-settle hover:bg-paper-sunk hover:text-ink"
    >
      <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="size-4">
        <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
      </svg>
    </button>
  );
}
