"use client";

import { useEffect, useState } from "react";

import { arg, send, type Sent } from "../../../lib/send";
import { reasonHash } from "../../../lib/applications";
import type { Entry } from "../../../lib/submissions";
import type { Card } from "../../../lib/project";

/**
 * Striking out the entries nobody would argue about.
 *
 * This is the lighter of the two routes and the contract keeps them apart on
 * purpose: screening is for spam and plain rule breaches, and disqualification
 * is for the ones somebody would contest, which needs judge signatures and
 * gives the team a window to answer. Offering only this one here is deliberate,
 * because an organizer reaching for the quick button on a contested case is
 * exactly what the heavier route exists to prevent.
 *
 * The reason is required. `invalidate_submission` will not take a call without
 * a digest, for the same reason a refused application will not.
 */

export function Screening({
  contractId,
  organizer,
  entries,
  reread,
}: {
  contractId: string;
  organizer: string | null;
  /** The entries, read by the panel and handed down rather than read twice. */
  entries: Entry[] | null;
  /** Re-reads them after a strike, so the panel's count follows it. */
  reread: () => Promise<void>;
}) {
  const [striking, setStriking] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Sent | null>(null);

  /* How each project presents itself. The contract pins a digest and a link;
     the banner, the mark and the words beside them are written on our side, and
     without them this tab is a list of team numbers. */
  const [cards, setCards] = useState<Record<number, Card>>({});

  useEffect(() => {
    let alive = true;

    void fetch(`/api/cards?contract=${contractId}`)
      .then((answer) => answer.json() as Promise<{ cards: Record<number, Card> }>)
      .then((said) => alive && setCards(said.cards))
      .catch(() => null);

    return () => {
      alive = false;
    };
  }, [contractId]);

  if (entries === null) {
    return (
      <section>
        <p className="label text-ink-faint">Reading the entries</p>
      </section>
    );
  }

  async function strike(team: number) {
    if (organizer === null) {
      return;
    }

    setBusy(true);
    setResult(null);

    const outcome = await send(
      contractId,
      "invalidate_submission",
      [await arg.u32(team), await arg.bytes32(await reasonHash(reason.trim()))],
      organizer,
    );

    setResult(outcome.ok || !outcome.refused ? outcome : null);
    setBusy(false);

    if (outcome.ok) {
      setStriking(null);
      setReason("");
      await reread();
    }
  }

  return (
    <section>
      {entries.length === 0 ? (
        <p className="max-w-[38rem] text-[1rem] leading-relaxed text-ink-soft">
          Nothing has been submitted yet.
        </p>
      ) : (
        <>
          {/* The same card the public gallery draws, because it is the same
              project. An organizer deciding whether an entry belongs in the
              event should be looking at what the judges and everybody else will
              look at, not at a row of hex with a strike button beside it. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => {
              const card = cards[entry.team];

              return (
                <div
                  key={entry.team}
                  className={`flex flex-col overflow-hidden rounded-[1rem] bg-paper ring-1 ring-rule ${
                    entry.invalid ? "opacity-60" : ""
                  }`}
                >
                  <div className="relative aspect-[16/7] bg-paper-sunk">
                    {card?.bannerUrl == null ? (
                      <div className="hatch size-full" aria-hidden />
                    ) : (
                      <img src={card.bannerUrl} alt="" className="size-full object-cover" />
                    )}

                    {/* Where the gallery puts the track, and struck out replaces
                        it rather than joining it: a removed entry's category is
                        no longer the thing to say about it. */}
                    <span
                      className={`label absolute left-3 top-3 px-2.5 py-1.5 ${
                        entry.invalid
                          ? "bg-broken text-paper"
                          : "bg-paper text-ink ring-1 ring-inset ring-rule"
                      }`}
                    >
                      {entry.invalid ? "Struck out" : entry.track}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col px-4 pb-4">
                    <div className="relative z-10 -mt-7 mb-3 size-12 overflow-hidden rounded-full border border-rule bg-paper">
                      {card?.logoUrl == null ? (
                        <div className="hatch size-full" aria-hidden />
                      ) : (
                        <img src={card.logoUrl} alt="" className="size-full object-cover" />
                      )}
                    </div>

                    <p className="text-[1.0625rem] font-semibold leading-tight text-ink">
                      {card?.title ?? `Team ${entry.team}`}
                    </p>

                    {card?.summary != null && (
                      <p className="mt-1.5 line-clamp-2 text-[0.9375rem] leading-relaxed text-ink-soft">
                        {card.summary}
                      </p>
                    )}

                    <p className="mt-2 text-[0.8125rem] text-ink-faint">
                      {card?.teamName ?? `Team ${entry.team}`} ·{" "}
                      {entry.members.length === 1
                        ? "one member"
                        : `${entry.members.length} members`}
                    </p>

                    {!entry.invalid && organizer !== null && (
                      <div className="mt-4">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setStriking(striking === entry.team ? null : entry.team)}
                          className="h-9 w-full rounded-full bg-broken/10 text-[0.9375rem] font-semibold text-broken transition-colors duration-150 ease-settle hover:bg-broken hover:text-paper disabled:opacity-40"
                        >
                          {striking === entry.team ? "Cancel" : "Strike out"}
                        </button>
                      </div>
                    )}

                    {striking === entry.team && organizer !== null && (
                      <div className="mt-3 grid gap-3 rounded-[0.75rem] bg-paper-sunk p-3">
                        <input
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="Why, in writing"
                          className="h-10 w-full rounded-[0.5rem] bg-paper px-3 text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-2 focus:ring-ink"
                        />

                        <button
                          type="button"
                          disabled={busy || reason.trim().length === 0}
                          onClick={() => void strike(entry.team)}
                          className="h-9 rounded-full bg-broken text-[0.9375rem] font-semibold text-paper transition-opacity duration-150 ease-settle hover:opacity-90 disabled:opacity-40"
                        >
                          {busy ? "Signing" : "Strike it out"}
                        </button>

                        <p className="text-[0.75rem] leading-relaxed text-ink-faint">
                          A hash of this goes on chain and stays there. Use the appeal route
                          for anything a team would contest.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {result !== null && (
        <p
          className={`mt-6 max-w-[46rem] text-[0.9375rem] leading-relaxed ${
            result.ok ? "text-verified" : "text-broken"
          }`}
        >
          {result.ok ? "Recorded." : result.why}
        </p>
      )}
    </section>
  );
}
