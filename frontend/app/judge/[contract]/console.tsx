"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "../../components/primitives";
import { SpecHeading, SpecLabel, SpecRow, SpecRows, SpecValue } from "../../components/spec";
import { useWallet } from "../../components/wallet-context";
import { entriesOf, type Entry } from "../../../lib/submissions";
import { phaseOf } from "../../../lib/running";
import { rubricOf, type Rubric } from "../../../lib/rubric";
import {
  inclusionOf,
  leafOf,
  payloadFor,
  sealingConfigured,
  submitScorecard,
  type Inclusion,
  type Receipt,
} from "../../../lib/judge";
import { proveAddress } from "../../../lib/wallet";
import { toHex } from "../../../lib/hex";

/**
 * Scoring, in one sitting and at no cost to the judge.
 *
 * A card is signed in the wallet and handed to the collection service, which
 * publishes only a root until the reveal. That service is the one place in this
 * product carrying real trust, and the two things that bound it are both on
 * this page: the signature, so it cannot invent a card, and the receipt, so it
 * cannot quietly drop one.
 *
 * The receipt is the judge's, not ours. It is shown in full and worth keeping,
 * because it is what a judge produces if their card turns out to be missing
 * from the tree.
 */

interface Held {
  receipt: Receipt;
  leaf: string;
}

export function JudgeConsole({ contractId }: { contractId: string }) {
  const { wallet, known } = useWallet();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [rubric, setRubric] = useState<Rubric[] | null>(null);
  const [phase, setPhase] = useState<number | null>(null);
  const [held, setHeld] = useState<Record<number, Held>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [found, tracks, at] = await Promise.all([
      entriesOf(contractId, false),
      rubricOf(contractId),
      phaseOf(contractId),
    ]);

    setEntries(found);
    setRubric(tracks);
    setPhase(at);
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    The wallet is not waited on.

    Nothing above depends on it: the projects and the rubric come from the
    contract, and only signing needs a key. Holding the whole page until the
    kit has loaded and the extension has answered meant a judge with a wallet
    already connected waited longer than one without, which is backwards.
  */
  if (entries === null || rubric === null) {
    return <p className="label text-ink-faint">Reading the contract</p>;
  }

  if (!sealingConfigured()) {
    return (
      <p className="max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        No collection service is configured for this deployment, so there is
        nowhere to hand a scorecard.
      </p>
    );
  }

  /* Cards are only collected while the judging window is open. Outside it the
     service refuses them, so the page says so rather than offering a form that
     cannot be handed in. */
  if (phase !== 4) {
    return (
      <p className="max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        Scorecards are collected during judging. This hackathon is not there.
      </p>
    );
  }

  const scoreable = entries.filter((entry) => !entry.invalid);

  return (
    <div className="space-y-14">
      {scoreable.length === 0 ? (
        <p className="max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
          Nothing to score. Either no project was entered or every one was struck
          out in screening.
        </p>
      ) : (
        scoreable.map((entry) => (
          <Card
            key={entry.team}
            entry={entry}
            criteria={rubric.find((track) => track.track === entry.track)?.criteria ?? []}
            judge={wallet?.address ?? null}
            ready={known}
            contractId={contractId}
            held={held[entry.team]}
            busy={busy === entry.team}
            onBusy={(going) => setBusy(going ? entry.team : null)}
            onHeld={(next) => setHeld({ ...held, [entry.team]: next })}
            onRefused={setRefused}
          />
        ))
      )}

      {refused !== null && (
        <p className="max-w-[46rem] text-[0.875rem] leading-relaxed text-broken">{refused}</p>
      )}
    </div>
  );
}

function Card({
  entry,
  criteria,
  judge,
  ready,
  contractId,
  held,
  busy,
  onBusy,
  onHeld,
  onRefused,
}: {
  entry: Entry;
  criteria: { id: string; weightBps: number }[];
  judge: string | null;
  ready: boolean;
  contractId: string;
  held: Held | undefined;
  busy: boolean;
  onBusy: (going: boolean) => void;
  onHeld: (next: Held) => void;
  onRefused: (why: string | null) => void;
}) {
  const [scores, setScores] = useState<Record<string, string>>({});
  const [included, setIncluded] = useState<Inclusion | null>(null);
  const [checking, setChecking] = useState(false);

  const filled = criteria.every((criterion) => (scores[criterion.id] ?? "").length > 0);

  async function submit() {
    if (judge === null) {
      return;
    }

    onBusy(true);
    onRefused(null);

    try {
      const scorecard = {
        judge,
        team: entry.team,
        scores: criteria.map((criterion) => ({
          criterion: criterion.id,
          score: Math.max(0, Math.min(100, Number(scores[criterion.id] ?? 0))),
        })),
      };

      const leaf = await leafOf(scorecard);

      /* The wallet signs the leaf's hexadecimal text. Nothing about the card
         itself is handed to the wallet, so what a judge approves is a digest
         rather than a form they would have to reread. */
      const signature = await proveAddress(judge, payloadFor(leaf));
      const receipt = await submitScorecard(contractId, scorecard, hexFrom(signature));

      onHeld({ receipt, leaf: toHex(leaf) });
    } catch (error) {
      /* A browser that cannot reach the service at all says only "Failed to
         fetch", which tells a judge nothing about what to do. */
      const said = error instanceof Error ? error.message : "";

      onRefused(
        said.includes("Failed to fetch") || said.length === 0
          ? "Could not reach the collection service. It may not be running."
          : said,
      );
    } finally {
      onBusy(false);
    }
  }

  async function check() {
    if (held === undefined) {
      return;
    }

    setChecking(true);
    setIncluded(await inclusionOf(contractId, held.leaf));
    setChecking(false);
  }

  return (
    <section className="border-l-2 border-rule pl-6">
      <SpecLabel index={String(entry.team)}>{entry.track}</SpecLabel>

      <p className="mt-2 tabular text-[0.875rem] break-all text-ink-soft">{entry.uri}</p>

      {held === undefined ? (
        <>
          <div className="mt-6 max-w-[30rem] space-y-3">
            {criteria.map((criterion) => (
              <label key={criterion.id} className="flex items-center gap-4">
                <span className="label w-40 text-ink-faint">
                  {criterion.id} · {criterion.weightBps / 100}%
                </span>

                <input
                  value={scores[criterion.id] ?? ""}
                  onChange={(event) =>
                    setScores({
                      ...scores,
                      [criterion.id]: event.target.value.replace(/[^0-9]/g, "").slice(0, 3),
                    })
                  }
                  inputMode="numeric"
                  placeholder="0"
                  className="tabular h-10 w-20 bg-paper px-3 text-center text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
                />

                <span className="label text-ink-faint">of 100</span>
              </label>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Button
              disabled={busy || !filled || judge === null}
              onClick={() => void submit()}
            >
              {busy ? "Signing" : "Seal this card"}
            </Button>

            {/* Only the button waits on the wallet, and it says why rather
                than sitting there greyed out for a reason nobody can see. */}
            {judge === null && (
              <p className="text-[0.875rem] leading-relaxed text-ink-soft">
                {ready
                  ? "Connect the wallet the rules name as a judge. A card signed by any other key is refused."
                  : "Checking your wallet"}
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="mt-6">
          <SpecRows>
            <SpecRow index="1" label="Leaf" mark>
              <SpecValue>{held.leaf}</SpecValue>
            </SpecRow>

            <SpecRow index="2" label="Receipt from">
              <SpecValue>{held.receipt.sealer}</SpecValue>
            </SpecRow>

            <SpecRow index="3" label="Signature">
              <SpecValue>{held.receipt.signature}</SpecValue>
            </SpecRow>

            <SpecRow index="4" label="Included" mark={included?.at === "omitted"}>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`label ${tone(included)}`}>
                    {checking ? "asking" : verdict(included)}
                  </span>

                  <Button
                    size="sm"
                    intent="quiet"
                    disabled={checking}
                    onClick={() => void check()}
                  >
                    {checking ? "Checking" : "Check"}
                  </Button>
                </div>

                {included?.at === "disagrees" && (
                  <p className="max-w-[34rem] text-[0.8125rem] leading-relaxed text-broken">
                    The service proved your card against a tree whose root is not
                    the one on chain. Keep this receipt.
                  </p>
                )}

                {included?.at === "omitted" && (
                  <p className="max-w-[34rem] text-[0.8125rem] leading-relaxed text-broken">
                    Cards are held for this hackathon and yours is not among
                    them. This is what the receipt is for.
                  </p>
                )}
              </div>
            </SpecRow>
          </SpecRows>

          {/* Said plainly because it is the judge's only recourse. The proof
              shows the card was included; the receipt is what they hold if it
              turns out not to have been. */}
          <p className="mt-4 max-w-[34rem] text-[0.8125rem] leading-relaxed text-ink-faint">
            Keep this receipt. Once the root is published you can prove your card
            was in the tree, and if it was not, this is what says it should have
            been.
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * What the check found, in a word.
 *
 * Nothing until it has been run. A page that says "no root yet" before anybody
 * asked is answering a question that was never put, and is wrong as often as it
 * is right.
 */
function verdict(found: Inclusion | null): string {
  if (found === null) {
    return "not checked";
  }

  switch (found.at) {
    case "included":
      return "proved";
    case "omitted":
      return "not in the tree";
    case "disagrees":
      return "root does not match";
    case "waiting":
      return "nothing sealed yet";
    case "unreachable":
      return found.why;
  }
}

function tone(found: Inclusion | null): string {
  if (found === null) {
    return "text-ink-faint";
  }

  return found.at === "included"
    ? "text-verified"
    : found.at === "omitted" || found.at === "disagrees"
      ? "text-broken"
      : "text-ink-faint";
}

/**
 * The service wants the signature as hex; a wallet returns base64.
 *
 * Converted here rather than at either end, because the wallet's format is the
 * wallet's business and the service's is the service's.
 */
function hexFrom(base64: string): string {
  const raw = atob(base64);
  let out = "";

  for (let index = 0; index < raw.length; index += 1) {
    out += raw.charCodeAt(index).toString(16).padStart(2, "0");
  }

  return out;
}
