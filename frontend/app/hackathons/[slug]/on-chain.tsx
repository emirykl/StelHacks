"use client";

import Link from "next/link";
import { useState } from "react";

import { Modal, ModalClose } from "../../components/modal";
import { EXPLORER } from "../../../lib/explorer";

/** One essential value the event stores on-chain. */
export interface Held {
  label: string;
  said: string;
  value: string | null;
  /** An account and a contract open on different explorer routes. */
  kind?: "contract" | "account";
  missing?: string;
}

/**
 * A short proof summary.
 *
 * This modal deliberately contains only the five identifiers somebody is most
 * likely to verify. Entries, sealed roots and results live on the full proof
 * page linked at the bottom, so the quick view and the receipt have distinct
 * jobs instead of repeating one another beside the same button.
 */
export function OnChain({ held, proofHref }: { held: Held[]; proofHref: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2.5 justify-self-start rounded-full px-5 py-3 text-[0.9375rem] font-semibold text-ink ring-1 ring-inset ring-rule transition-colors duration-150 ease-settle hover:bg-paper-sunk hover:ring-ink"
      >
        <Seal />
        On-chain proof
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="On-chain proof">
        <ModalClose onClose={() => setOpen(false)} />

        <header className="pr-10">
          <p className="label text-[0.75rem] text-verified">Read from Stellar</p>
          <h2 className="display mt-1 text-[1.75rem] font-bold leading-tight text-ink">
            On-chain proof
          </h2>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
            The essential addresses behind this hackathon. Open any linked value
            to verify it on Stellar Expert.
          </p>
        </header>

        <div className="mt-7 grid gap-5">
          {held.map((one) => (
            <section key={one.label} className="border-b border-rule pb-5 last:border-0 last:pb-0">
              <h3 className="display text-[1.125rem] font-bold leading-tight text-ink">
                {one.label}
              </h3>
              <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-soft">{one.said}</p>

              {one.value === null ? (
                <p className="mt-3 text-[0.875rem] font-medium text-ink-faint">
                  {one.missing ?? "Not published yet"}
                </p>
              ) : one.kind === undefined ? (
                <p className="tabular mt-3 break-all rounded-[0.625rem] bg-paper-sunk px-3 py-2.5 text-[0.8125rem] leading-relaxed text-ink">
                  {one.value}
                </p>
              ) : (
                <a
                  href={`https://stellar.expert/explorer/${EXPLORER}/${one.kind}/${one.value}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group mt-3 block rounded-[0.625rem] bg-paper-sunk px-3 py-2.5 ring-1 ring-inset ring-rule transition-colors hover:bg-paper hover:ring-ink"
                >
                  <span className="tabular block break-all text-[0.8125rem] leading-relaxed text-ink">
                    {one.value}
                  </span>
                  <span className="mt-2 inline-block text-[0.875rem] font-bold text-ink underline decoration-rule underline-offset-4 group-hover:decoration-ink">
                    Open in Stellar Expert ↗
                  </span>
                </a>
              )}
            </section>
          ))}
        </div>

        <div className="mt-7 border-t border-rule pt-6">
          <Link
            href={proofHref}
            onClick={() => setOpen(false)}
            className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-[0.9375rem] font-bold text-paper transition-transform hover:-translate-y-0.5"
          >
            View the full proof page&nbsp;→
          </Link>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-faint">
            Includes entries, sealed judging records and final results.
          </p>
        </div>
      </Modal>
    </>
  );
}

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
