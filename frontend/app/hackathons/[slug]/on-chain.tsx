"use client";

import { useEffect, useState } from "react";

import { EXPLORER } from "../../../lib/explorer";

/**
 * The values the chain holds, behind one press.
 *
 * They were a section of the page, five rows of fifty six characters that
 * almost nobody reads and that nobody reads twice. Kept open they set the tone
 * of a page whose subject is a hackathon rather than a ledger; removed they
 * would take the product's own claim with them, because "check it yourself" is
 * not a claim if the things to check are not there.
 *
 * So they are here, whole and uncut, one press away. A dialog is the right
 * shape for that: it is the reader asking rather than the page telling.
 */

export interface Held {
  label: string;
  /** What it means, in the words of somebody who has not met a digest before. */
  said: string;
  value: string | null;
  /** An account and a contract are different pages on the explorer. */
  kind?: "contract" | "account";
  missing?: string;
}

export function OnChain({ held }: { held: Held[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);

    document.addEventListener("keydown", escape);

    return () => document.removeEventListener("keydown", escape);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2.5 self-start rounded-full px-5 py-3 text-[0.9375rem] font-semibold text-ink ring-1 ring-inset ring-rule transition-colors duration-150 ease-settle hover:bg-paper-sunk hover:ring-ink"
      >
        <Seal />
        On-chain proofs
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="On-chain proofs"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="max-h-[85vh] w-full max-w-[44rem] overflow-y-auto rounded-[1.25rem] bg-paper p-6 shadow-2xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-[1.5rem] font-semibold text-ink">On-chain proofs</h2>

                <p className="mt-2 max-w-[34rem] text-[0.9375rem] leading-relaxed text-ink-soft">
                  Everything this page claims is stored by a contract rather than
                  by us. These are the values it holds, in full, so they can be
                  compared against what the network says.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-9 shrink-0 place-items-center rounded-full text-ink-faint transition-colors duration-150 ease-settle hover:bg-paper-sunk hover:text-ink"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  className="size-4"
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>

            <dl className="mt-7 divide-y divide-rule border-y border-rule">
              {held.map((one) => (
                <div key={one.label} className="grid gap-1.5 py-4">
                  <dt className="label text-[0.8125rem] font-semibold text-ink">{one.label}</dt>

                  <dd className="min-w-0">
                    <p className="text-[0.875rem] leading-relaxed text-ink-soft">{one.said}</p>

                    {one.value === null ? (
                      <p className="mt-1.5 text-[0.875rem] text-ink-faint">
                        {one.missing ?? "not published yet"}
                      </p>
                    ) : (
                      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        {/* Whole, because this is the one place somebody
                            compares a value character by character and a digest
                            with its middle cut out compares against nothing. */}
                        <span className="tabular min-w-0 break-all text-[0.875rem] text-ink">
                          {one.value}
                        </span>

                        {one.kind !== undefined && (
                          <a
                            href={`https://stellar.expert/explorer/${EXPLORER}/${one.kind}/${one.value}`}
                            target="_blank"
                            rel="noreferrer"
                            className="label shrink-0 text-[0.75rem] text-ink-faint underline decoration-rule underline-offset-4 transition-colors duration-150 ease-settle hover:text-ink hover:decoration-ink"
                          >
                            Explorer ↗
                          </a>
                        )}
                      </div>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </>
  );
}

/** A stamp, for the one control that offers proof rather than information. */
function Seal() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[1.125rem]"
    >
      <path d="M10 2.5 3.5 5.2v4.6c0 3.4 2.6 6.4 6.5 7.7 3.9-1.3 6.5-4.3 6.5-7.7V5.2z" />
      <path d="m7.4 9.9 1.9 1.9 3.4-3.6" />
    </svg>
  );
}
