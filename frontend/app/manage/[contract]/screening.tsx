"use client";

import { useCallback, useEffect, useState } from "react";

import { SpecLabel, SpecRow, SpecRows, SpecValue } from "../../components/spec";
import { arg, send, type Sent } from "../../../lib/send";
import { reasonHash } from "../../../lib/applications";
import { entriesOf, type Entry } from "../../../lib/submissions";

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
}: {
  contractId: string;
  organizer: string | null;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [striking, setStriking] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Sent | null>(null);

  const reread = useCallback(async () => {
    setEntries(await entriesOf(contractId));
  }, [contractId]);

  useEffect(() => {
    void reread();
  }, [reread]);

  if (entries === null) {
    return (
      <section>
        <SpecLabel index="04">Screening</SpecLabel>
        <p className="mt-6 label text-ink-faint">Reading the entries</p>
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
      <SpecLabel index="04">Screening</SpecLabel>

      {entries.length === 0 ? (
        <p className="mt-6 max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
          Nothing has been submitted yet.
        </p>
      ) : (
        <div className="mt-8">
          <SpecRows>
            {entries.map((entry) => (
              <SpecRow
                key={entry.team}
                index={String(entry.team).padStart(2, "0")}
                label={entry.track}
                mark={!entry.invalid}
              >
                <div className="space-y-3">
                  <div className={entry.invalid ? "opacity-50" : ""}>
                    <SpecValue>{entry.uri}</SpecValue>
                  </div>

                  {entry.invalid ? (
                    <p className="label text-broken">struck out</p>
                  ) : (
                    organizer !== null && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setStriking(striking === entry.team ? null : entry.team)}
                        className="label h-8 px-3 text-ink-soft ring-1 ring-inset ring-rule transition-colors duration-150 ease-settle hover:text-broken disabled:opacity-40"
                      >
                        Strike out
                      </button>
                    )
                  )}

                  {striking === entry.team && organizer !== null && (
                    <div className="max-w-[34rem] space-y-2">
                      <input
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Why, in writing"
                        className="h-10 w-full bg-paper px-3 text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
                      />

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={busy || reason.trim().length === 0}
                          onClick={() => void strike(entry.team)}
                          className="label h-8 bg-broken px-3 text-paper transition-colors duration-150 ease-settle hover:bg-broken/85 disabled:opacity-40"
                        >
                          {busy ? "Signing" : "Strike out"}
                        </button>

                        <p className="text-[0.75rem] leading-relaxed text-ink-faint">
                          A hash of this goes on chain and stays there. Use the
                          appeal route for anything a team would contest.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </SpecRow>
            ))}
          </SpecRows>
        </div>
      )}

      {result !== null && (
        <p
          className={`mt-6 max-w-[46rem] text-[0.875rem] leading-relaxed ${
            result.ok ? "text-verified" : "text-broken"
          }`}
        >
          {result.ok ? `Recorded. ${result.hash}` : result.why}
        </p>
      )}
    </section>
  );
}
