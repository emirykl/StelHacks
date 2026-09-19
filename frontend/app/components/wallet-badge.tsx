"use client";

import { useEffect, useRef, useState } from "react";

import { shorten, useWallet } from "./wallet-context";

/**
 * The connected address, in the header, on every page.
 *
 * Shown wherever somebody is, because the address in this badge is the key that
 * will sign the next thing they do. A page where that is out of sight is a page
 * where somebody submits a project from an account they did not mean to use.
 *
 * Disconnecting lives in here rather than on the account page. It is the same
 * gesture as signing out, it belongs beside what it undoes, and putting it here
 * means the account page never needs a second button for changing wallets.
 */

export function WalletBadge() {
  const { wallet, known, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  /* Close on a click anywhere else, and on escape. A menu that can only be
     closed by the control that opened it is a menu people get stuck in. */
  useEffect(() => {
    if (!open) {
      return;
    }

    function away(event: MouseEvent) {
      if (!holder.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);

    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  /* Nothing until the first read finishes. Rendering "connect" and then
     swapping it for an address is a flicker that reads as a bug. */
  if (!known || wallet === null) {
    return null;
  }

  return (
    <div ref={holder} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Wallet ${wallet.address}`}
        className="label flex h-9 items-center gap-2 rounded-full bg-paper-sunk px-3 text-ink ring-1 ring-inset ring-rule transition-colors duration-150 ease-settle hover:bg-rule/60"
      >
        <Mark />
        {shorten(wallet.address)}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-20 w-[19rem] bg-paper p-4 ring-1 ring-rule">
          <p className="label text-ink-faint">{wallet.wallet}</p>

          <p className="mt-2 tabular text-[0.8125rem] break-all text-ink">{wallet.address}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void disconnect();
              }}
              className="label h-8 bg-ink px-3 text-paper transition-colors duration-150 ease-settle hover:bg-ink/85"
            >
              Disconnect
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void connect();
              }}
              className="label h-8 px-3 text-ink-soft transition-colors duration-150 ease-settle hover:text-ink"
            >
              Switch
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A wallet, drawn rather than fetched, so the header ships no image. */
function Mark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="size-4"
    >
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h8A1.5 1.5 0 0 1 13 4.5V5" />
      <rect x="2" y="5" width="12" height="8" rx="1.5" />
      <circle cx="10.75" cy="9" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
