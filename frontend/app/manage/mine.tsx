"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { hackathonsRun, type Organized } from "../../lib/organized";
import { phaseName } from "../../lib/phase";
import { useWallet } from "../components/wallet-context";

/**
 * The way back into an event somebody is running.
 *
 * There was none. `/manage/[contract]` was keyed on a contract address for a
 * good reason, that an event exists on chain before anybody has typed a name for
 * it, and the cost of that was an organizer who had to keep the address
 * somewhere themselves. Everything the product asks them to do afterwards, the
 * approvals, the lock, the reveal, lives behind an address in their clipboard.
 *
 * Read on the client and keyed by the connected wallet, for the reason the
 * joined list is: which address is connected is a fact about the browser, and
 * the server rendering this has no way to know it and must not guess.
 */

export function Mine() {
  const { wallet, known } = useWallet();
  const [list, setList] = useState<Organized[] | null>(null);

  const address = wallet?.address ?? null;

  useEffect(() => {
    if (address === null) {
      setList(null);
      return;
    }

    let current = true;

    void hackathonsRun(address).then((found) => {
      if (current) {
        setList(found);
      }
    });

    /* A wallet swapped mid read would otherwise put one organizer's events
       under another organizer's address. */
    return () => {
      current = false;
    };
  }, [address]);

  if (!known || address === null) {
    return (
      <Empty>
        {known
          ? "Connect the wallet you created them with. An event belongs to the key that signed it, not to the account."
          : "Looking for a wallet."}
      </Empty>
    );
  }

  if (list === null) {
    return <Empty>Reading the chain.</Empty>;
  }

  if (list.length === 0) {
    return (
      <Empty>
        This address has not created a hackathon yet.{" "}
        <Link href="/create" className="text-ink underline underline-offset-4">
          Create one
        </Link>
        .
      </Empty>
    );
  }

  return (
    <ul className="border-t border-rule">
      {list.map((entry) => (
        <li key={entry.contractId}>
          <Link
            href={`/manage/${entry.contractId}`}
            className="flex items-center gap-4 border-b border-rule py-4 transition-colors duration-150 ease-settle hover:bg-paper-sunk"
          >
            {entry.logoUrl === null ? (
              <span aria-hidden className="size-9 shrink-0 rounded-[0.35rem] bg-paper-sunk ring-1 ring-rule" />
            ) : (
              <img
                src={entry.logoUrl}
                alt=""
                width={36}
                height={36}
                className="size-9 shrink-0 rounded-[0.35rem] object-cover ring-1 ring-rule"
              />
            )}

            {/* The address stands in for a name until there is one. It is
                exactly the row somebody has just created and not yet described,
                and it is the row they came here to find. */}
            {entry.name === null ? (
              <span className="min-w-0 flex-1 truncate tabular text-[0.9375rem] text-ink-soft">
                {entry.contractId}
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-[1rem] text-ink">
                {entry.name}
              </span>
            )}

            <span className="label shrink-0 text-ink-faint">{phaseName(entry.phase)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-t border-rule pt-5 text-[0.9375rem] leading-relaxed text-ink-soft">
      {children}
    </p>
  );
}
