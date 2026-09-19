"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

import { CommitButton } from "./commit-button";
import { Pop, Press } from "./motion";
import { browserClient } from "../../lib/supabase/client";
import { shorten, useWallet } from "./wallet-context";

/**
 * The one control on the right of the header, on every page.
 *
 * It used to be a pill reading "My account", which spent the widest object in
 * the header on two words a reader learns once and then never needs again. An
 * avatar says the same thing in the shape everybody already knows, and the
 * room it gives back is what lets the connected address sit beside it.
 *
 * Address and identity share this control rather than having one each. They
 * are different layers and the account page keeps them apart, but in a header
 * they answer the same question, which is who am I here as. Two controls side
 * by side made a reader choose between them before knowing what either was.
 *
 * The address is shown wherever somebody is, because it is the key that will
 * sign the next thing they do. A page where that is out of sight is a page
 * where somebody submits a project from an account they did not mean to use.
 */

export function AccountMenu({ email }: { email: string | null }) {
  const router = useRouter();
  const { wallet, known, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
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

  /* Nobody signed in, so the header's job is to offer the way in and nothing
     else. Black and yellow rather than a quiet grey: it is the one control up
     here and it should look like a door from across the page. */
  if (email === null) {
    return (
      <CommitButton href="/login" size="sm">
        Log In
      </CommitButton>
    );
  }

  async function signOut() {
    const db = browserClient();

    if (db === null) {
      return;
    }

    setLeaving(true);
    setOpen(false);
    await db.auth.signOut();

    /* Refresh rather than push. Every server component on the page read the
       session while rendering, so the page has to be asked again rather than
       navigated to. */
    router.refresh();
    setLeaving(false);
  }

  const attached = known && wallet !== null;

  return (
    <div ref={holder} className="relative">
      <Press>
        {/* `layout` because the pill grows when a wallet turns up: the first
            read finishes after the header has already painted, and a control
            that jumps from one width to another reads as a fault where one
            that expands reads as an answer arriving. */}
        <motion.button
          layout
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={attached ? `Account, wallet ${wallet.address}` : "Account"}
          className={`flex h-9 items-center rounded-full transition-colors duration-150 ease-settle ${
            attached
              ? "gap-2 bg-paper-sunk pl-3 pr-1 text-ink ring-1 ring-inset ring-rule hover:bg-rule/60"
              : ""
          }`}
        >
          {attached && (
            <>
              <Icon id={wallet.id} name={wallet.wallet} />
              <span className="label">{shorten(wallet.address)}</span>
            </>
          )}

          <Avatar email={email} />
        </motion.button>
      </Press>

      <Pop open={open} className="absolute right-0 top-11 z-20 w-[19rem] origin-top-right">
        <div className="bg-paper p-4 shadow-[0_18px_40px_-24px_oklch(19%_0.008_60/0.5)] ring-1 ring-rule">
          <p className="label text-ink-faint">Signed in as</p>
          <p className="mt-1.5 truncate text-[0.875rem] text-ink">{email}</p>

          <div className="mt-4 border-t border-rule pt-4">
            {attached ? (
              <>
                <p className="label text-ink-faint">{wallet.wallet}</p>

                <p className="tabular mt-1.5 break-all text-[0.8125rem] text-ink">
                  {wallet.address}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
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
              </>
            ) : (
              <>
                <p className="label text-ink-faint">No wallet</p>

                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-soft">
                  Nothing can be signed until one is attached.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void connect();
                  }}
                  className="label mt-3 h-8 bg-ink px-3 text-signal transition-colors duration-150 ease-settle hover:bg-ink/90"
                >
                  Connect a wallet
                </button>
              </>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-rule pt-3">
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="label text-ink-soft transition-colors duration-150 ease-settle hover:text-ink"
            >
              Account →
            </Link>

            {/* Signing out lives beside what it undoes rather than only on the
                account page, which is a page somebody has to reach first. */}
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={leaving}
              className="label text-ink-faint transition-colors duration-150 ease-settle hover:text-broken disabled:opacity-40"
            >
              {leaving ? "Signing out" : "Sign out"}
            </button>
          </div>
        </div>
      </Pop>
    </div>
  );
}

/**
 * The person, as a circle with their initial in it.
 *
 * The initial rather than a stock silhouette, because two accounts on the same
 * machine look identical as silhouettes and this is the control somebody checks
 * before signing something. It falls back to a drawn figure only when there is
 * no address to take a letter from, which is a state the header should survive
 * rather than one it should be designed around.
 */
function Avatar({ email }: { email: string }) {
  const initial = email.trim().charAt(0).toUpperCase();

  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-[0.8125rem] font-semibold text-signal"
    >
      {initial === "" ? <Figure /> : initial}
    </span>
  );
}

/** A shoulders and head silhouette, drawn rather than fetched. */
function Figure() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className="size-4">
      <circle cx="8" cy="5.4" r="2.8" />
      <path d="M8 9.4c-3 0-5.2 1.8-5.2 4.1 0 .3.2.5.5.5h9.4c.3 0 .5-.2.5-.5 0-2.3-2.2-4.1-5.2-4.1Z" />
    </svg>
  );
}

/**
 * The wallet's own mark, so the pill says which one at a glance.
 *
 * Served from here rather than from the kit's `productIcon`, which points at
 * creit.tech. That URL would make the header fetch an image from a third party
 * on every page a connected person opens, and tell them about it each time.
 */
const drawn = new Set(["freighter", "albedo", "xbull", "lobstr"]);

function Icon({ id, name }: { id: string; name: string }) {
  if (!drawn.has(id)) {
    /* A wallet added later has no file here yet. A dot keeps the pill the same
       shape rather than collapsing it. */
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
