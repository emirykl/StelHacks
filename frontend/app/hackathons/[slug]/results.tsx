"use client";

import { useEffect, useState } from "react";

import { Button } from "../../components/primitives";
import { SpecRow, SpecRows, SpecValue } from "../../components/spec";
import { useWallet } from "../../components/wallet-context";
import { arg, send, type Sent } from "../../../lib/send";
import { decisions, resultsOf, tracksOf, type Results } from "../../../lib/results";
import { rulesFor } from "../../../lib/rules";
import { CashOut } from "./cash-out";
import { Podium } from "./podium";
import { teamMarks, type Mark } from "../../../lib/team-names";
import { accept, assetOf, holds, type PrizeAsset } from "../../../lib/trustline";

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

  /*
    Which places the frozen rules actually pay.

    The board lists every team the contract ranked, which is the point of it:
    coming fortieth is a result and a team that entered deserves to read theirs.
    But `settle_prize` only knows about positions in the prize table, so an
    unpaid row was offering a button that could only fail, on the row belonging
    to the people least in the mood for it.
  */
  const [payable, setPayable] = useState<Set<string>>(new Set());

  /* What the prize is paid in, and whether this wallet can receive it. Both
     start unknown rather than false: a warning drawn before the answer is in
     would flash on every load for the many events that pay in XLM and need no
     warning at all. */
  const [asset, setAsset] = useState<PrizeAsset | null>(null);
  const [prizeAsset, setPrizeAsset] = useState<string | null>(null);

  /* What the teams call themselves. A podium labelled "Team 1" names the row in
     a database rather than the people who won. */
  const [names, setNames] = useState<Map<number, Mark>>(new Map());
  const [ready, setReady] = useState<boolean | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const tracks = await tracksOf(contractId);
      const [found, rules] = await Promise.all([
        resultsOf(contractId, tracks),
        rulesFor(contractId),
      ]);

      if (!alive) {
        return;
      }

      setResults(found);
      setPayable(new Set((rules?.tiers ?? []).map((tier) => `${tier.track}-${tier.rank}`)));
      setNames(await teamMarks(contractId));

      if (rules?.prizeAsset != null) {
        const which = await assetOf(rules.prizeAsset);

        if (alive) {
          setPrizeAsset(rules.prizeAsset);
          setAsset(which);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [contractId]);

  /* Asked again whenever the wallet changes, because somebody switching
     accounts in their extension is switching to an account that may not be
     prepared, and a stale yes is the one answer this must never give. */
  const address = wallet?.address ?? null;

  useEffect(() => {
    let alive = true;

    if (asset === null || address === null) {
      setReady(null);

      return;
    }

    void holds(address, asset).then((found) => {
      if (alive) {
        setReady(found);
      }
    });

    return () => {
      alive = false;
    };
  }, [asset, address]);

  if (results === null || results.length === 0) {
    return null;
  }

  /* Whether this wallet has already been paid at this event, which is what
     makes cashing out a thing it can do. */
  const paidHere = results.some((result) =>
    result.places.some(
      (place) => place.paid && address !== null && place.members.includes(address),
    ),
  );

  /* Whether this wallet is on an unpaid place the prize table actually pays.
     The board lists every ranked team, and most of them are owed nothing. */
  const owed = results.some((result) =>
    result.places.some(
      (place) =>
        !place.paid &&
        payable.has(`${result.track}-${place.rank}`) &&
        address !== null &&
        place.members.includes(address),
    ),
  );

  async function acceptAsset() {
    if (address === null || asset === null) {
      return;
    }

    setAccepting(true);
    setRefused(null);

    const done = await accept(address, asset);

    /* Declining in the wallet is a decision, not a failure, and says nothing
       back. Everything else does. */
    setRefused(done.ok || done.refused ? null : done.why);
    setAccepting(false);

    if (done.ok) {
      setReady(await holds(address, asset));
    }
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
    <section className="border-t border-rule">
      <div className="mx-auto w-full max-w-[96rem] px-6 py-16">
        {/* A heading the size of every other page's, and no diagonal hatch
            behind it. This was a specification sheet: an eyebrow numbering the
            section, a title in tracked capitals, and a texture saying "look,
            machinery". It is a results table, and the thing worth emphasising
            is who won rather than that a contract worked it out. */}
        <h2 className="text-[2rem] leading-tight">Results</h2>

        {/*
          Only when it is this wallet's problem, and only when it is a problem.

          Every hackathon on the network today pays in XLM, which needs nothing
          accepted, so `ready` comes back true and this never draws. It appears
          for an issued asset the connected wallet has not accepted, and only
          while that wallet is actually owed something: telling a spectator
          their wallet is unprepared for a prize they did not win is noise about
          a step they will never take.
        */}
        {ready === false && asset?.kind === "issued" && owed && (
          <section className="mt-10 max-w-[46rem] rounded-[1.25rem] bg-paper p-8 ring-1 ring-rule">
            <h3 className="text-[1.25rem] text-ink">Accept {asset.code} to be paid</h3>

            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
              Stellar will not put an asset into a wallet that has not accepted
              it. Your prize is waiting in the vault and the contract will not
              release it until this is done. It is one signature and it moves no
              money.
            </p>

            <div className="mt-6">
              <Button disabled={accepting} onClick={() => void acceptAsset()}>
                {accepting ? "Signing" : `Accept ${asset.code}`}
              </Button>
            </div>

            {refused !== null && (
              <p className="mt-4 text-[0.8125rem] leading-relaxed text-broken">{refused}</p>
            )}
          </section>
        )}

        {/*
          Who won on the left, what the winner can do about it on the right.

          They are two different readings of the same fact and they were stacked,
          so the way to the money sat above the result it came from and a reader
          met a button before they knew what it was for. Side by side, the
          sentence runs left to right: this team won, and here is their prize.

          The rail collapses under the podium on a narrow screen rather than
          squeezing beside it, because a podium three abreast has a width it
          cannot go below and still be read.
        */}
        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="rounded-[1.25rem] bg-paper px-8 py-10 ring-1 ring-rule">
            {results.map((result) => (
              <Podium key={result.track} places={result.places} marks={names} />
            ))}
          </div>

          {asset !== null && paidHere && prizeAsset !== null && (
            <CashOut asset={asset} token={prizeAsset} />
          )}
        </div>

        <div className="mt-6 grid gap-6">
          {results.map((result) => (
            <section
              key={result.track}
              className="rounded-[1.25rem] bg-paper p-8 ring-1 ring-rule sm:p-10"
            >
              <h3 className="text-[1.25rem] text-ink">{result.track}</h3>

              <div className="mt-6">
                <SpecRows>
                  {result.places.map((place) => (
                    <SpecRow
                      key={place.rank}
                      index={ordinal(place.rank)}
                      label={names.get(place.team)?.name ?? `team ${place.team}`}
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
                        {!place.paid &&
                          wallet !== null &&
                          payable.has(`${result.track}-${place.rank}`) && (
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
            </section>
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
