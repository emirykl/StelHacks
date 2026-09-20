"use client";

import { useEffect, useState } from "react";

import { Button } from "../../components/primitives";
import { backersOf, claimedName, creditFor, type Backer } from "../../../lib/backers";
import { units } from "../../../lib/money";
import { titleOf } from "../../../lib/words";
import {
  PROPOSED,
  decideTrack,
  proposedTracksOf,
  type ProposedTrack,
} from "../../../lib/sponsor";

/**
 * Sponsors asking for a category of their own, waiting on an answer.
 *
 * It appears only when there is something to answer. An organizer's console
 * that carries a permanently empty section is a console with one more thing to
 * scroll past, and this is a queue that most events never have anything in.
 *
 * Both answers are one signature. Declining refunds the sponsor inside the same
 * call that declines, so there is no moment where somebody has been told no and
 * the contract is still holding their money — and nothing here has to remember
 * to send it back.
 */

export function SponsorQueue({
  contractId,
  organizer,
  code,
}: {
  contractId: string;
  /** The signing address, or null when this console is somebody else's. */
  organizer: string | null;
  code: string;
}) {
  const [waiting, setWaiting] = useState<ProposedTrack[]>([]);
  const [backers, setBackers] = useState<Backer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void proposedTracksOf(contractId).then((found) => {
      if (alive) {
        setWaiting(found.filter((track) => track.status === PROPOSED));
      }
    });

    /* Who the address belongs to, so the row names somebody. The chain holds a
       key and nothing else, and an organizer deciding whether to open a whole
       category for a stranger was being shown fifty six characters to decide
       it on. Undecided credits count here: the name is what is being weighed,
       not something already granted. */
    void backersOf(contractId).then((found) => alive && setBackers(found));

    return () => {
      alive = false;
    };
  }, [contractId]);

  async function decide(id: string, accepted: boolean) {
    if (organizer === null) {
      return;
    }

    setBusy(id);
    setWhy(null);

    const outcome = await decideTrack(contractId, organizer, id, accepted);

    setBusy(null);

    if (outcome.ok) {
      setWaiting((were) => were.filter((track) => track.id !== id));

      return;
    }

    if (!outcome.refused) {
      setWhy(outcome.why);
    }
  }

  if (waiting.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[1.25rem] bg-paper p-7 ring-1 ring-rule sm:p-9">
      <h3 className="text-[1.25rem] font-semibold text-ink">
        {waiting.length === 1
          ? "A sponsor wants a category"
          : `${waiting.length} sponsors want a category`}
      </h3>

      <p className="mt-2 max-w-[40rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        The bounty is already in the vault. Accept and the category opens for
        entries straight away, judged by your rubric and your judges; refuse and
        every unit goes back to them in the same signature.
      </p>

      <div className="mt-6 grid gap-4">
        {waiting.map((track) => (
          <div
            key={track.id}
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-rule pt-4"
          >
            <div className="min-w-0">
              <p className="text-[1.0625rem] text-ink">{titleOf(track.id)}</p>

              <p className="mt-0.5 text-[0.875rem] text-ink-faint">
                <span className="tabular font-semibold text-verified">
                  {units(track.tiers.reduce((sum, tier) => sum + tier.amount, BigInt(0)))}{" "}
                  {code}
                </span>{" "}
                from {claimedName(creditFor(backers, track.sponsor), track.sponsor)}
                {/* The address stays beside the name rather than behind it.
                    A name here is something somebody typed; the key is what
                    the contract will refund if this is refused. */}
                {" · "}
                <span className="tabular">{short(track.sponsor)}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                disabled={organizer === null || busy !== null}
                onClick={() => void decide(track.id, true)}
              >
                {busy === track.id ? "Signing" : "Accept"}
              </Button>

              <Button
                size="sm"
                intent="quiet"
                disabled={organizer === null || busy !== null}
                onClick={() => void decide(track.id, false)}
              >
                Refuse and refund
              </Button>
            </div>
          </div>
        ))}
      </div>

      {why !== null && (
        <p className="mt-5 text-[0.9375rem] leading-relaxed text-broken">{why}</p>
      )}
    </section>
  );
}

function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
