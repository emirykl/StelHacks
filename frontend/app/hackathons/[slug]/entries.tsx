"use client";

import { useEffect, useState } from "react";

import { SpecHeading, SpecLabel, SpecRow, SpecRows, SpecValue } from "../../components/spec";
import { entriesOf, type Entry } from "../../../lib/submissions";

/**
 * What was actually entered, for anybody to look at.
 *
 * The observer surface has shown addresses and digests and no projects, which
 * makes it a page about a hackathon rather than a page of one. This is the
 * part a reader came for, and it is read from the contract so that the list
 * cannot quietly differ from what was pinned.
 *
 * A struck out entry keeps its row. Removing it would leave a reader unable to
 * tell a hackathon where nothing was disqualified from one where the record was
 * tidied afterwards, which is the distinction the whole product exists to make.
 */

export function Entries({ contractId }: { contractId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let alive = true;

    void entriesOf(contractId).then((found) => {
      if (alive) {
        setEntries(found);
      }
    });

    return () => {
      alive = false;
    };
  }, [contractId]);

  if (entries === null || entries.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-rule">
      <div className="mx-auto w-full max-w-[96rem] px-6 py-16">
        <SpecLabel index="03">Entries</SpecLabel>

        <SpecHeading className="mt-3">{entries.length} submitted</SpecHeading>

        <div className="mt-10">
          <SpecRows>
            {entries.map((entry) => (
              <SpecRow
                key={entry.team}
                index={String(entry.team).padStart(2, "0")}
                label={entry.track}
                mark
              >
                <div className={entry.invalid ? "opacity-50" : ""}>
                  <div className="flex flex-wrap items-baseline gap-3">
                    <a
                      href={entry.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="tabular text-[0.875rem] break-all text-ink underline decoration-rule underline-offset-4 transition-colors duration-150 ease-settle hover:decoration-ink"
                    >
                      {entry.uri}
                    </a>

                    {entry.invalid && (
                      <span className="label text-broken">struck out</span>
                    )}
                  </div>

                  <p className="mt-2">
                    <SpecValue>{entry.digest}</SpecValue>
                  </p>

                  {entry.members.length > 0 && (
                    <p className="mt-2 text-[0.75rem] text-ink-faint">
                      {entry.members.length} on the team
                    </p>
                  )}
                </div>
              </SpecRow>
            ))}
          </SpecRows>
        </div>
      </div>
    </section>
  );
}
