"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { phaseName } from "../../../lib/phase";

/**
 * The way out of one hackathon and into another.
 *
 * Somebody running a second event had to go back to the list to reach it, and
 * the list is two clicks away through a menu, so the panel behaved as though
 * every organizer had exactly one hackathon. They do not: the same key runs
 * last month's and this month's, and moving between them is the most ordinary
 * thing an organizer does here.
 *
 * On the name rather than beside it. The name is what somebody looks at to know
 * which event they are in, so it is also where they look to change it.
 */

interface Organized {
  contractId: string;
  name: string | null;
  logoUrl: string | null;
  phase: number;
}

export function Switcher({
  address,
  here,
  children,
}: {
  /** The organizer's address, which is what the chain keyed the events on. */
  address: string | null;
  /** The contract this panel is for, so it can be marked and not offered. */
  here: string;
  /** The name, rendered by the caller so the heading keeps its own type. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [organized, setOrganized] = useState<Organized[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (address === null) {
      setOrganized(null);
      return;
    }

    let alive = true;

    void fetch(`/api/organized?address=${address}`)
      .then((answer) => answer.json() as Promise<{ organized: Organized[] }>)
      .then((said) => alive && setOrganized(said.organized))
      .catch(() => alive && setOrganized([]));

    return () => {
      alive = false;
    };
  }, [address]);

  /* Closing on anything outside it, because a menu that only closes by the
     control that opened it is a menu somebody leaves open by accident. */
  useEffect(() => {
    if (!open) {
      return;
    }

    const away = (event: MouseEvent) => {
      if (box.current !== null && !box.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);

    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);

    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const others = (organized ?? []).filter((one) => one.contractId !== here);

  /* No control at all when there is nowhere to go. A chevron that opens an
     empty list is a promise the product does not keep. */
  if (others.length === 0) {
    return <>{children}</>;
  }

  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="group flex items-center gap-3 text-left transition-opacity duration-150 ease-settle hover:opacity-70"
      >
        {children}

        <svg
          aria-hidden
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`size-5 shrink-0 text-ink-faint transition-transform duration-150 ease-settle ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-3 w-[22rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-[1rem] bg-paper p-1.5 shadow-lg ring-1 ring-rule">
          <p className="label px-3 py-2 text-[0.75rem] text-ink-faint">Your other hackathons</p>

          {others.map((one) => (
            <Link
              key={one.contractId}
              href={`/manage/${one.contractId}`}
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 rounded-[0.625rem] px-3 py-2.5 transition-colors duration-150 ease-settle hover:bg-paper-sunk"
            >
              {one.logoUrl === null ? (
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-[0.5rem] bg-paper-sunk text-[0.875rem] text-ink-faint"
                >
                  {(one.name ?? "?").trim().slice(0, 1).toUpperCase()}
                </span>
              ) : (
                <img
                  src={one.logoUrl}
                  alt=""
                  className="size-8 shrink-0 rounded-[0.5rem] object-cover ring-1 ring-rule"
                />
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[1rem] text-ink">
                  {one.name ?? "Untitled hackathon"}
                </span>

                <span className="label block text-[0.75rem] text-ink-faint">
                  {phaseName(one.phase)}
                </span>
              </span>
            </Link>
          ))}

          <Link
            href="/manage"
            onClick={() => setOpen(false)}
            className="label mt-1 block border-t border-rule px-3 py-3 text-ink-soft transition-colors duration-150 ease-settle hover:text-ink"
          >
            All of them
          </Link>
        </div>
      )}
    </div>
  );
}
