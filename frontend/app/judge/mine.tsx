"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useWallet } from "../components/wallet-context";

/**
 * The list, keyed on the connected wallet rather than on a signed in account.
 *
 * A judge is an address in a frozen document. They may never have made an
 * account here and nothing requires them to: what decides whether they can hand
 * in a card is the key in their extension, so that is what this asks about.
 */

interface Judged {
  contract: string;
  name: string;
  slug: string;
  phase: number | null;
  phaseName: string;
  /** Seconds since the epoch, zero when the rules never named one. */
  judgingCloses: number;
  tracks: number;
}

export function Mine() {
  const { wallet, known } = useWallet();
  const [judging, setJudging] = useState<Judged[] | null>(null);

  const address = wallet?.address ?? null;

  useEffect(() => {
    if (address === null) {
      setJudging(null);
      return;
    }

    let alive = true;

    void fetch(`/api/judging?address=${address}`)
      .then((answer) => answer.json() as Promise<{ judging: Judged[] }>)
      .then((said) => alive && setJudging(said.judging))
      .catch(() => alive && setJudging([]));

    return () => {
      alive = false;
    };
  }, [address]);

  if (!known) {
    return <p className="label text-ink-faint">Looking for a wallet</p>;
  }

  if (address === null) {
    return (
      <Note>
        Connect the wallet the organizer named in the rules. It is the only
        thing that decides which hackathons appear here.
      </Note>
    );
  }

  if (judging === null) {
    return <p className="label text-ink-faint">Reading the rules</p>;
  }

  if (judging.length === 0) {
    return (
      <Note>
        No hackathon has named this wallet as a judge. If you were expecting one,
        check with the organizer that they used this address — it cannot be
        changed after the rules are locked.
      </Note>
    );
  }

  return (
    <div className="grid gap-4">
      {judging.map((one) => (
        <One key={one.contract} judged={one} />
      ))}
    </div>
  );
}

/**
 * One hackathon, and whether it is waiting on this judge right now.
 *
 * Scoring is a window rather than a standing job, so the row leads with which
 * side of that window the event is on. A list that showed four events and left
 * somebody to open each one to find out which needed them would be a list that
 * costs more than it saves.
 */
function One({ judged }: { judged: Judged }) {
  const scoring = judged.phase === 4;

  return (
    <Link
      href={`/judge/${judged.contract}`}
      className="block rounded-[1.25rem] bg-paper p-6 ring-1 ring-rule transition-shadow duration-150 ease-settle hover:ring-ink sm:p-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-[1.25rem] font-semibold text-ink">{judged.name}</p>

        <p className={`label ${scoring ? "text-verified" : "text-ink-faint"}`}>
          {scoring ? "Open for scoring" : judged.phaseName}
        </p>
      </div>

      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
        {scoring ? (
          <>
            Your cards are wanted now
            {judged.judgingCloses > 0 && (
              <>
                , until <Moment at={judged.judgingCloses} />
              </>
            )}
            .
          </>
        ) : judged.phase !== null && judged.phase < 4 ? (
          <>
            Scoring has not opened yet
            {judged.judgingCloses > 0 && (
              <>
                . The window shuts <Moment at={judged.judgingCloses} />
              </>
            )}
            .
          </>
        ) : (
          "Scoring is over. The cards have been handed in."
        )}{" "}
        {judged.tracks === 1 ? "One category." : `${judged.tracks} categories.`}
      </p>
    </Link>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-[40rem] text-[1rem] leading-relaxed text-ink-soft">{children}</p>
  );
}

/** A moment in the reader's own clock, which is the one a deadline is read in. */
function Moment({ at }: { at: number }) {
  return (
    <span suppressHydrationWarning className="text-ink">
      {new Date(at * 1000).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </span>
  );
}
