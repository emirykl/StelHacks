"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { ButtonLink } from "./primitives";
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

export function WalletBadge({ signedIn }: { signedIn: boolean }) {
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

  /* With no wallet, the header still needs a way in. Held until the first
     read finishes, because rendering a button and then swapping it for an
     address is a flicker that reads as a bug. */
  if (!known || wallet === null) {
    return (
      <ButtonLink href="/account" size="sm" intent={signedIn ? "quiet" : "primary"}>
        {signedIn ? "Account" : "Sign in"}
      </ButtonLink>
    );
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
        <Icon id={wallet.id} name={wallet.wallet} />
        {shorten(wallet.address)}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-20 w-[19rem] bg-paper p-4 ring-1 ring-rule">
          <p className="label text-ink-faint">{wallet.wallet}</p>

          <p className="mt-2 tabular text-[0.8125rem] break-all text-ink">{wallet.address}</p>

          {/* The account link lives here rather than as its own button in the
              header. Beside a connected address it is obvious what it opens;
              on its own next to one it was a word with nothing behind it. */}
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="label mt-4 flex items-center justify-between border-t border-rule pt-3 text-ink-soft transition-colors duration-150 ease-settle hover:text-ink"
          >
            Account
            <span aria-hidden>→</span>
          </Link>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void disconnect();
              }}
              className="label h-8 bg-broken px-3 text-paper transition-colors duration-150 ease-settle hover:bg-broken/85"
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

/**
 * The wallet's own mark, so the badge says which one at a glance.
 *
 * Served from here rather than from the kit's `productIcon`, which points at
 * creit.tech. That URL would make the header fetch an image from a third party
 * on every page a connected person opens, and tell them about it each time.
 */
const known = new Set(["freighter", "albedo", "xbull", "lobstr"]);

function Icon({ id, name }: { id: string; name: string }) {
  if (!known.has(id)) {
    /* A wallet added later has no file here yet. A dot keeps the badge the
       same shape rather than collapsing it. */
    return <span aria-hidden className="size-4 rounded-full bg-ink-faint" />;
  }

  return (
    <img
      src={`/wallets/${id}.png`}
      alt={name}
      width={16}
      height={16}
      className="size-4 rounded-[0.2rem]"
    />
  );
}
