"use client";

import { useEffect, useState } from "react";

import { Button } from "../../components/primitives";
import { SpecHeading, SpecLabel, SpecRow, SpecRows, SpecValue } from "../../components/spec";
import { useWallet } from "../../components/wallet-context";
import { arg, send, type Sent } from "../../../lib/send";
import { decisions, resultsOf, tracksOf, type Results } from "../../../lib/results";

/**
 * Who won, and whether they have been paid.
 *
 * The whole product is an argument about this section, so every number in it
 * comes from the contract that computed it. Each place also says which step of
 * the tie break settled it: a result that says only "second" invites exactly
 * the question this is meant to answer.
 *
 * Claiming is here rather than on an account page because this is where the
 * result is. A winner reading their own name should not have to go looking for
 * the button, and anybody can press it for them: `settle_prize` is not gated on
 * the recipient, so a winner with an empty wallet still gets paid.
 */

export function ResultsBoard({ contractId }: { contractId: string }) {
  const { wallet } = useWallet();
  const [results, setResults] = useState<Results[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Sent | null>(null);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const tracks = await tracksOf(contractId);
      const found = await resultsOf(contractId, tracks);

      if (alive) {
        setResults(found);
      }
    })();

    return () => {
      alive = false;
    };
  }, [contractId]);

  if (results === null || results.length === 0) {
    return null;
  }

  async function claim(track: string, rank: number, member: string) {
    if (wallet === null) {
      return;
    }

    const key = `${track}-${rank}-${member}`;
    setBusy(key);
    setOutcome(null);

    const sent = await send(
      contractId,
      "settle_prize",
      [await arg.symbol(track), await arg.u32(rank), await arg.address(member)],
      wallet.address,
    );

    setOutcome(sent.ok || !sent.refused ? sent : null);
    setBusy(null);

    if (sent.ok) {
      setResults(await resultsOf(contractId, results!.map((result) => result.track)));
    }
  }

  return (
    <section className="hatch border-t border-rule">
      <div className="mx-auto w-full max-w-[76rem] px-6 py-16">
        <SpecLabel index="04">Results</SpecLabel>

        <SpecHeading className="mt-3">Computed by the contract</SpecHeading>

        <div className="mt-10 space-y-12">
          {results.map((result) => (
            <div key={result.track}>
              <p className="label text-ink-faint">{result.track}</p>

              <div className="mt-4">
                <SpecRows>
                  {result.places.map((place) => (
                    <SpecRow
                      key={place.rank}
                      index={ordinal(place.rank)}
                      label={`team ${place.team}`}
                      mark
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                          <SpecValue size="lg">{percent(place.finalScore)}</SpecValue>

                          <span className="label text-ink-faint">
                            {decisions[place.decidedBy] ?? "on score"}
                          </span>

                          {place.paid && <span className="label text-verified">paid</span>}
                        </div>

                        {/* A team prize is split equally and paid to each member
                            directly, so the claim is per person rather than per
                            place. Nobody holds anybody else's share. */}
                        {!place.paid && wallet !== null && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {place.members.map((member) => (
                              <Button
                                key={member}
                                size="sm"
                                intent="quiet"
                                disabled={busy !== null}
                                onClick={() => void claim(result.track, place.rank, member)}
                              >
                                {busy === `${result.track}-${place.rank}-${member}`
                                  ? "Signing"
                                  : `Pay ${short(member)}`}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </SpecRow>
                  ))}
                </SpecRows>
              </div>
            </div>
          ))}
        </div>

        {outcome !== null && (
          <p
            className={`mt-8 max-w-[46rem] text-[0.875rem] leading-relaxed ${
              outcome.ok ? "text-verified" : "text-broken"
            }`}
          >
            {outcome.ok ? `Paid. ${outcome.hash}` : outcome.why}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * The score, rounded only here.
 *
 * The contract holds weighted totals at full scale, which is a criterion out of
 * a hundred multiplied by ten thousand basis points: a perfect card is a
 * million, not a hundred. Dividing by anything else prints a real score as
 * eighty six hundred percent, which is how this was caught.
 *
 * The contract keeps that scale on purpose, because dividing down to a
 * percentage twice drops a fraction that decides close results. This is the one
 * place that rounds, and it rounds for reading rather than for arithmetic.
 */
const MAX_WEIGHTED_SCORE = 100 * 10_000;

function percent(score: number): string {
  return `${((score / MAX_WEIGHTED_SCORE) * 100).toFixed(1)}%`;
}

function ordinal(rank: number): string {
  return ["1st", "2nd", "3rd"][rank - 1] ?? `${rank}th`;
}

function short(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
