"use client";

import { useEffect, useState } from "react";

import { Button } from "../../components/primitives";
import { SpecRow, SpecRows, SpecValue } from "../../components/spec";
import { useWallet } from "../../components/wallet-context";
import { arg, send, type Sent } from "../../../lib/send";
import { decisions, resultsOf, tracksOf, type Results } from "../../../lib/results";
import { rulesFor } from "../../../lib/rules";
import { runningOf } from "../../../lib/running";
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
 * Paying is here rather than on a page of its own because this is where the
 * result is: handing out the prizes is the last reading of the board, not a
 * separate errand. The contract lets anybody pay a winner, since the amount and
 * the recipient were both frozen at the lock and nobody paying can change
 * either. This page still offers it to the organizer alone. A visitor meeting
 * buttons that move somebody else's prize money has no way to tell that they
 * are harmless, and reads them as a hackathon anyone can reach into.
 */

export function ResultsBoard({ contractId }: { contractId: string }) {
  const { wallet } = useWallet();
  const [results, setResults] = useState<Results[] | null>(null);
  /* Only what went wrong is held. A run that worked is reported by the board
     changing, so there is nothing for this to say. */
  const [outcome, setOutcome] = useState<Extract<Sent, { ok: false }> | null>(null);

  /* Who is allowed to hand the prizes out here. Read from the contract rather
     than from our tables, because a row claiming somebody organizes an event is
     a claim and the contract's answer is the fact. */
  const [organizer, setOrganizer] = useState<string | null>(null);

  /* Whether the platform's cut has left the vault, because it goes out with the
     prizes and `complete` will not close the event until it has. */
  const [feeSettled, setFeeSettled] = useState(true);

  /* How far through the payments we are, so a table of winners does not sit
     still while five wallet prompts go past. Null when none is running. */
  const [paying, setPaying] = useState<{ done: number; of: number } | null>(null);

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
      const [found, rules, state] = await Promise.all([
        resultsOf(contractId, tracks),
        rulesFor(contractId),
        runningOf(contractId),
      ]);

      if (!alive) {
        return;
      }

      setResults(found);
      setOrganizer(state.organizer);
      setFeeSettled(state.feeSettled);
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

  /*
    Something to read before there is anything to read.

    This drew nothing until a ranking existed, so the tab a reader clicked on
    the first day was an empty page — indistinguishable from one that had failed
    to load. A hackathon spends most of its life in that state.
  */
  if (results === null || results.length === 0) {
    return (
      <section className="border-t border-rule">
        <div className="mx-auto w-full max-w-[96rem] px-6 py-16">
          <h2 className="text-[2rem] leading-tight">Results</h2>

          <p className="mt-4 max-w-[38rem] text-[1rem] leading-relaxed text-ink-soft">
            Nothing is ranked yet. When judging closes, the contract works out
            the placings and they appear here — the scores, what settled each
            tie, and what was paid.
          </p>
        </div>
      </section>
    );
  }

  /*
    Where this wallet's own team came, whether or not that place pays.

    The podium holds three and a prize table often holds fewer. Everybody else
    read the board looking for a row about themselves, which is the reading the
    board is worst at: it is sorted by rank and they do not know their rank.
  */
  const mine = address === null
    ? null
    : results
        .flatMap((result) => result.places.map((place) => ({ ...place, track: result.track })))
        .find((place) => place.members.includes(address)) ?? null;

  /* Whose hackathon this is. The payout card is theirs; everybody else reads
     the same board without it. */
  const organizing = address !== null && address === organizer;

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

  /*
    Every share still owed, in the order the board reads.

    Per person rather than per place, because a team prize is split equally and
    each share goes straight to its own member: nobody is handed somebody else's
    money to pass on. That is also why this is a list and not a single call —
    the contract has no "pay everybody", and inventing one would mean a contract
    that holds a list of people to pay in the order a website decided.
  */
  const shares =
    results === null
      ? []
      : results.flatMap((result) =>
          result.places
            .filter((place) => !place.paid && payable.has(`${result.track}-${place.rank}`))
            .flatMap((place) =>
              place.members.map((member) => ({
                track: result.track,
                rank: place.rank,
                member,
              })),
            ),
        );

  /*
    The platform's cut, last in the same queue.

    It had a button of its own on the manage page, and asking an organizer to
    settle our fee as a separate errand was never defensible: they deposited it
    with the prize money when the rules were locked, the rate was frozen there
    too, and there is nothing for them to decide. It is one more thing the vault
    owes, so it leaves with everything else the vault owes.

    Last rather than first so a run that stops part way has paid winners and not
    us. The contract charges the fee on top of the prize table and never out of
    it, so the order cannot change what anybody receives; it only decides who is
    still waiting if something goes wrong.
  */
  const owing: ({ fee: true } | { fee: false; track: string; rank: number; member: string })[] = [
    ...shares.map((share) => ({ fee: false as const, ...share })),
    ...(feeSettled ? [] : [{ fee: true as const }]),
  ];

  async function payWinners() {
    if (wallet === null || results === null) {
      return;
    }

    setOutcome(null);
    setPaying({ done: 0, of: owing.length });

    let paid = 0;
    let stopped: Extract<Sent, { ok: false }> | null = null;

    for (const share of owing) {
      const sent = share.fee
        ? await send(contractId, "settle_platform_fee", [], wallet.address)
        : await send(
            contractId,
            "settle_prize",
            [
              await arg.symbol(share.track),
              await arg.u32(share.rank),
              await arg.address(share.member),
            ],
            wallet.address,
          );

      if (sent.ok) {
        paid += 1;
        setPaying({ done: paid, of: owing.length });

        continue;
      }

      /*
        One refusal ends the run rather than moving to the next winner.

        Declining in the wallet is the common one, and carrying on would put the
        next prompt up immediately: somebody who changed their mind would have
        to decline once per winner to get out of it. A failure is worth stopping
        on too, since the usual cause is the whole run failing for one reason —
        a paused settlement, a vault short of funds — and finding that out once
        is enough.
      */
      stopped = sent.refused ? null : sent;

      break;
    }

    setPaying(null);
    setOutcome(stopped);

    if (paid > 0) {
      /* Both, because the fee is the last thing in the run and the board would
         otherwise keep offering a payment that has already gone. */
      const [again, state] = await Promise.all([
        resultsOf(contractId, results.map((result) => result.track)),
        runningOf(contractId),
      ]);

      setResults(again);
      setFeeSettled(state.feeSettled);
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

        {/* Said before the podium, because somebody who did not make it onto one
            is still looking for themselves and should not have to search a
            table sorted by a number they do not know. */}
        {mine !== null && (
          <p className="mt-3 text-[1.0625rem] leading-relaxed text-ink">
            {mine.rank <= 3 ? "Congratulations. " : ""}
            Your team placed{" "}
            <span className="font-medium">{ordinal(mine.rank)}</span> in{" "}
            {mine.track}
            {mine.paid ? " and the prize has been paid." : "."}
          </p>
        )}

        {/*
          Handing out the prizes, on the page that says who won them.

          The organizer's card and nobody else's. It disappears the moment there
          is nothing outstanding rather than greying out, because an empty
          payout card on a finished hackathon is a job that looks undone.
        */}
        {organizing && owing.length > 0 && (
          <section className="mt-10 max-w-[46rem] rounded-[1.25rem] bg-paper p-8 ring-1 ring-rule">
            <h3 className="text-[1.3125rem] text-ink">
              {shares.length === 0
                ? "One payment left"
                : shares.length === 1
                  ? "One winner to pay"
                  : `${shares.length} winners to pay`}
            </h3>

            <p className="mt-3 text-[1rem] leading-relaxed text-ink-soft">
              {shares.length === 0 ? (
                <>
                  Every winner has been paid. What is left in the vault is the
                  platform fee you deposited alongside the prizes, and the
                  hackathon cannot close until it is out.
                </>
              ) : (
                <>
                  The money goes from the vault straight to each winner's wallet,
                  at the amount their place was promised when the rules were
                  frozen. A team prize is split equally between its members, so
                  this is one signature per person and none of it passes through
                  you.
                  {!feeSettled && (
                    <> The platform fee you deposited goes out with them, last.</>
                  )}
                </>
              )}
            </p>

            <div className="mt-6">
              <Button disabled={paying !== null} onClick={() => void payWinners()}>
                {paying === null
                  ? "Pay the winners"
                  : `Paying ${Math.min(paying.done + 1, paying.of)} of ${paying.of}`}
              </Button>
            </div>
          </section>
        )}

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
            <h3 className="text-[1.3125rem] text-ink">Accept {asset.code} to be paid</h3>

            <p className="mt-3 text-[1rem] leading-relaxed text-ink-soft">
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
              <p className="mt-4 text-[0.875rem] leading-relaxed text-broken">{refused}</p>
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
              <h3 className="text-[1.3125rem] text-ink">{result.track}</h3>

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

                      </div>
                    </SpecRow>
                  ))}
                </SpecRows>
              </div>
            </section>
          ))}
        </div>

        {/* Only ever a failure now. What went right is said by the board
            itself: the rows say paid and the card asking for the payment is
            gone, which is a better confirmation than a transaction hash. */}
        {outcome !== null && (
          <p className="mt-8 max-w-[46rem] text-[0.9375rem] leading-relaxed text-broken">
            {outcome.why}
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
