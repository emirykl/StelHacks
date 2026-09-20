"use client";

import { useEffect, useState } from "react";

import { Button } from "../../../components/primitives";
import { SpecRow, SpecRows, SpecValue } from "../../../components/spec";
import { useWallet } from "../../../components/wallet-context";
import { sealingConfigured } from "../../../../lib/judge";
import type { Card } from "../../../../lib/project";
import { proveAddress } from "../../../../lib/wallet";
import { toHex } from "../../../../lib/hex";
import {
  leafOf,
  mayVote,
  ordered,
  payloadFor,
  submitBallot,
  type Choice,
} from "../../../../lib/vote";

/**
 * Ten points, and somewhere to put them.
 *
 * The whole surface is one decision taken in one pass, so it is one screen: the
 * projects with a control each, and what is left to place held in view the
 * whole time. Nothing is submitted until every point is placed, because the
 * contract refuses a ballot that spends less and finding that out at the wallet
 * prompt would be the worst place to learn it.
 *
 * Points rather than a ranking. A voter who has to order the field is being
 * asked about projects they never opened; a voter with an amount to place is
 * being asked what they actually think, and the two projects they liked can end
 * up five and five without either being called second.
 */

export interface Standing {
  team: number;
  track: string;
  card: Card | null;
}

export function Ballot({
  contractId,
  entries,
  power,
  maxChoices,
}: {
  contractId: string;
  entries: Standing[];
  power: number;
  maxChoices: number;
}) {
  const { wallet } = useWallet();
  const address = wallet?.address;

  const [placed, setPlaced] = useState<Record<number, number>>({});
  const [admitted, setAdmitted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [sealed, setSealed] = useState<{
    leaf: string;
    receipt: string;
  } | null>(null);

  useEffect(() => {
    if (address === undefined) {
      setAdmitted(null);

      return;
    }

    let current = true;
    void mayVote(contractId, address).then((may) => {
      if (current) {
        setAdmitted(may);
      }
    });

    return () => {
      current = false;
    };
  }, [address, contractId]);

  const spent = Object.values(placed).reduce((total, points) => total + points, 0);
  const left = power - spent;
  const backing = Object.values(placed).filter((points) => points > 0).length;
  const complete = left === 0 && backing > 0;

  /**
   * Whether this project can take another point.
   *
   * Two limits, and they read as one refusal to the voter: nothing left to
   * place, or the ballot is already spread as wide as the rules allow and this
   * project is not one of the ones it names.
   */
  function canAdd(team: number): boolean {
    if (left <= 0) {
      return false;
    }

    return (placed[team] ?? 0) > 0 || backing < maxChoices;
  }

  function move(team: number, by: number) {
    setRefused(null);
    setPlaced((held) => {
      const now = Math.max(0, (held[team] ?? 0) + by);

      return { ...held, [team]: now };
    });
  }

  async function seal() {
    if (address === undefined || !complete) {
      return;
    }

    setBusy(true);
    setRefused(null);

    try {
      const choices: Choice[] = ordered(
        Object.entries(placed).map(([team, weight]) => ({
          team: Number(team),
          weight,
        })),
      );

      const leaf = await leafOf(address, choices);

      /* The wallet signs the leaf's hexadecimal text, so what a voter approves
         is a digest rather than a form they would have to reread. */
      const signature = await proveAddress(address, payloadFor(leaf));
      const receipt = await submitBallot(contractId, address, choices, hexFrom(signature));

      setSealed({ leaf: toHex(leaf), receipt: receipt.signature });
    } catch (error) {
      const said = error instanceof Error ? error.message : "";

      setRefused(
        said.includes("Failed to fetch") || said.length === 0
          ? "Could not reach the collection service. It may not be running."
          : said,
      );
    } finally {
      setBusy(false);
    }
  }

  if (power === 0) {
    return (
      <Sheet>
        <p className="text-ink-soft">
          This hackathon is decided by its judges. Its rules give the community no share of the
          score, so there is no ballot to cast.
        </p>
      </Sheet>
    );
  }

  if (!sealingConfigured()) {
    return (
      <Sheet>
        <p className="text-ink-soft">
          No collection service is configured for this deployment, so a ballot has nowhere to go.
        </p>
      </Sheet>
    );
  }

  if (sealed !== null) {
    return (
      <Sheet>
        <h2 className="text-[1.25rem]">Your ballot is sealed</h2>

        <p className="mt-3 text-ink-soft">
          It stays sealed until the reveal, when it is opened on chain with everybody else&apos;s.
          Keep the receipt: it is what proves your ballot was counted, and it is checkable against
          the published root by anybody, including you.
        </p>

        <div className="mt-6">
          <SpecRows>
            <SpecRow label="Your leaf">
              <SpecValue>{sealed.leaf}</SpecValue>
            </SpecRow>
            <SpecRow label="Service signature">
              <SpecValue>{sealed.receipt}</SpecValue>
            </SpecRow>
          </SpecRows>
        </div>
      </Sheet>
    );
  }

  if (address === undefined) {
    return (
      <Sheet>
        <p className="text-ink-soft">
          Connect the wallet you were admitted with. A ballot is signed by a key rather than by an
          account, so that is what decides whether it counts.
        </p>
      </Sheet>
    );
  }

  if (admitted === false) {
    return (
      <Sheet>
        <p className="text-ink-soft">
          This wallet was not admitted to this hackathon, so it holds no ballot here. The electorate
          was fixed when sign-ups closed.
        </p>
      </Sheet>
    );
  }

  return (
    <div className="mt-8">
      <div className="sticky top-4 z-10 rounded-lg bg-paper/95 ring-1 ring-rule px-5 py-4 backdrop-blur">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[1.125rem]">
            <span className="tabular-nums">{left}</span> of {power} points left
          </p>

          <p className="text-[0.9375rem] text-ink-faint">
            Backing {backing} of at most {maxChoices} projects
          </p>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-rule">
          <div
            className="h-full rounded-full bg-ink transition-[width] duration-200"
            style={{ width: `${power === 0 ? 0 : (spent / power) * 100}%` }}
          />
        </div>
      </div>

      <ul className="mt-6 space-y-3">
        {entries.map((entry) => {
          const points = placed[entry.team] ?? 0;

          return (
            <li
              key={entry.team}
              className={`rounded-lg px-5 py-4 ring-1 transition-colors ${
                points > 0 ? "bg-paper-sunk ring-ink/40" : "ring-rule"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-[1.0625rem]">
                    {entry.card?.title ?? entry.card?.teamName ?? `Team ${entry.team}`}
                  </p>

                  {entry.card?.summary !== undefined && entry.card.summary !== null ? (
                    <p className="mt-1 line-clamp-2 max-w-[38rem] text-[0.9375rem] text-ink-soft">
                      {entry.card.summary}
                    </p>
                  ) : null}

                  <p className="mt-1 text-[0.8125rem] text-ink-faint">{entry.track}</p>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    intent="quiet"
                    onClick={() => move(entry.team, -1)}
                    disabled={points === 0 || busy}
                    aria-label={`Take a point off ${entry.card?.title ?? `team ${entry.team}`}`}
                  >
                    −
                  </Button>

                  <span className="w-8 text-center text-[1.125rem] tabular-nums">{points}</span>

                  <Button
                    type="button"
                    intent="quiet"
                    onClick={() => move(entry.team, 1)}
                    disabled={!canAdd(entry.team) || busy}
                    aria-label={`Put a point on ${entry.card?.title ?? `team ${entry.team}`}`}
                  >
                    +
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {entries.length === 0 ? (
        <p className="mt-6 text-ink-soft">
          Nothing is standing in this hackathon yet, so there is nothing to place points on.
        </p>
      ) : null}

      {refused !== null ? <p className="mt-6 text-[0.9375rem] text-danger">{refused}</p> : null}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button type="button" onClick={() => void seal()} disabled={!complete || busy}>
          {busy ? "Sealing…" : "Seal and send"}
        </Button>

        <p className="text-[0.9375rem] text-ink-faint">
          {complete
            ? "One signature. Nothing is paid and nothing goes on chain until the reveal."
            : `Place all ${power} points to send.`}
        </p>
      </div>
    </div>
  );
}

function Sheet({ children }: { children: React.ReactNode }) {
  return <div className="mt-8 rounded-lg px-6 py-6 ring-1 ring-rule">{children}</div>;
}

/** The service wants the signature as hex; a wallet returns base64. */
function hexFrom(signature: string): string {
  return toHex(Uint8Array.from(atob(signature), (character) => character.charCodeAt(0)));
}
