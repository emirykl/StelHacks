"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { hackathonsJoined, type Joined } from "../../lib/joined";
import { phaseName } from "../../lib/phase";
import { Button } from "../components/primitives";
import { useWallet } from "../components/wallet-context";

/**
 * What this person has actually done, which is the only part of the page
 * nobody typed.
 *
 * Keyed by the connected address rather than by the account, because that is
 * what the chain approved. It reads on the client for the same reason: which
 * address is connected is a fact about the browser, and the server rendering
 * this page has no way to know it and must not guess.
 *
 * Empty and unknown are different answers and are said differently. No wallet
 * means we cannot look; a wallet with nothing means they have not entered one
 * yet. Rendering both as an empty list would tell somebody they have done
 * nothing when the truth is that we did not ask.
 */

export function Joined() {
  const { wallet, known, connect } = useWallet();
  const [list, setList] = useState<Joined[] | null>(null);

  const address = wallet?.address ?? null;

  useEffect(() => {
    if (address === null) {
      setList(null);
      return;
    }

    let current = true;

    void hackathonsJoined(address).then((found) => {
      if (current) {
        setList(found);
      }
    });

    /* A wallet swapped mid read would otherwise land one person's record under
       another person's address. */
    return () => {
      current = false;
    };
  }, [address]);

  if (!known || address === null) {
    return (
      <Empty>
        {known ? (
          /* The way to fix it, beside the thing that is wrong with it. Saying
             "connect a wallet" and then leaving somebody to find the control
             behind an avatar is a sentence that describes a door without
             opening one. */
          <span className="flex flex-wrap items-center gap-4">
            Connect a wallet to see the hackathons it has entered.
            <Button size="sm" intent="quiet" onClick={() => void connect()}>
              Connect a wallet
            </Button>
          </span>
        ) : (
          "Looking for a wallet."
        )}
      </Empty>
    );
  }

  if (list === null) {
    return <Empty>Reading the record.</Empty>;
  }

  if (list.length === 0) {
    return (
      <Empty>
        This address has not entered a hackathon yet.{" "}
        <Link href="/hackathons" className="text-ink underline underline-offset-4">
          Browse the open ones
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
            href={`/hackathons/${entry.slug}`}
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

            <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-ink">
              {entry.name}
            </span>

            {/* The stage is the chain's word, so it keeps the chain's voice.
                Everything else in this row is a person's. */}
            <span className="label shrink-0 text-ink-faint">
              {entry.phase === null ? "unknown" : phaseName(entry.phase)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-t border-rule pt-5 text-[0.875rem] leading-relaxed text-ink-soft">
      {children}
    </p>
  );
}
