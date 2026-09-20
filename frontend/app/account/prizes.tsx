"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CashOut } from "../hackathons/[slug]/cash-out";
import { useWallet } from "../components/wallet-context";
import { amountOf, codeFor, prizesFor, type Prize } from "../../lib/prizes";
import { assetOf, type PrizeAsset } from "../../lib/trustline";
import { titleOf } from "../../lib/words";

/**
 * What this wallet has won, and the way to spend it.
 *
 * The results page offers a winner the same button, and that is the right place
 * to meet it: somebody who has just won is looking at the event. It is the
 * wrong place to come back to. A withdrawal runs for days, through an identity
 * check and a bank, and the person who left one half finished will not remember
 * which of three hackathons it was. They will look at their account.
 *
 * So this is the same panel with a different way in, reading the payments the
 * contract actually made rather than the rankings that earned them. A team can
 * be first and unpaid; what can be cashed out is money that moved.
 */

export function Prizes() {
  const { wallet, known } = useWallet();
  const address = wallet?.address ?? null;

  const [prizes, setPrizes] = useState<Prize[] | null>(null);

  /* The asset each prize was paid in, worked out once per contract rather than
     once per prize: two wins at the same event share an asset. */
  const [assets, setAssets] = useState<Map<string, PrizeAsset>>(new Map());

  useEffect(() => {
    if (address === null) {
      setPrizes(null);

      return;
    }

    let alive = true;

    void prizesFor(address).then(async (found) => {
      if (!alive) {
        return;
      }

      setPrizes(found);

      const contracts = [...new Set(found.map((prize) => prize.assetContract))].filter(
        (one): one is string => one !== null,
      );

      const read = await Promise.all(contracts.map(async (one) => [one, await assetOf(one)] as const));

      if (alive) {
        setAssets(new Map(read));
      }
    });

    return () => {
      alive = false;
    };
  }, [address]);

  if (!known || address === null || prizes === null) {
    return null;
  }

  if (prizes.length === 0) {
    return (
      <p className="max-w-[38rem] text-[1rem] leading-relaxed text-ink-soft">
        Nothing yet. Prizes appear here once a hackathon settles and the contract
        pays this wallet.
      </p>
    );
  }

  /* One panel, under the newest prize that has an asset an anchor might take.
     A card per prize would offer the same wallet the same withdrawal several
     times over: cashing out empties the balance, not one prize. */
  const cashable = prizes
    .map((prize) => prize.assetContract)
    .find((contract): contract is string => contract !== null && assets.has(contract));

  const asset = cashable === undefined ? undefined : assets.get(cashable);

  return (
    <div className="grid gap-6">
      <ul className="grid gap-3">
        {prizes.map((prize) => (
          <li
            key={`${prize.contractId}-${prize.track}-${prize.rank}-${prize.when}`}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule pb-3"
          >
            <span className="min-w-0">
              {prize.slug === null ? (
                <span className="text-[1rem] text-ink">{prize.name}</span>
              ) : (
                <Link
                  href={`/hackathons/${prize.slug}?tab=results`}
                  className="text-[1rem] text-ink underline decoration-rule underline-offset-4 transition-colors duration-150 ease-settle hover:decoration-ink"
                >
                  {prize.name}
                </Link>
              )}

              <span className="label ml-3 text-ink-faint">
                {ordinal(prize.rank)} · {titleOf(prize.track)}
              </span>
            </span>

            <span className="tabular text-[1rem] font-medium text-verified">
              {amountOf(prize.amount)} {codeFor(prize.assetContract) ?? ""}
            </span>
          </li>
        ))}
      </ul>

      {asset !== undefined && cashable !== undefined && (
        <CashOut asset={asset} token={cashable} />
      )}
    </div>
  );
}

function ordinal(rank: number): string {
  return ["1st", "2nd", "3rd"][rank - 1] ?? `${rank}th`;
}
