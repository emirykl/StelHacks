"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "../../components/primitives";
import { backersOf, claimedName, decideCredit, short, type Backer } from "../../../lib/backers";
import { explorerFor } from "../../../lib/explorer";
import { units } from "../../../lib/money";
import { challengeFor } from "../../../lib/organizer";
import { contributionsOf, placeName, type Contribution } from "../../../lib/sponsor";
import { proveAddressHex } from "../../../lib/wallet";
import { titleOf } from "../../../lib/words";
import { useWallet } from "../../components/wallet-context";

/**
 * Sponsors asking to be named, waiting on an answer.
 *
 * The money is not waiting on anything. It went into the vault when they signed
 * for it and it reaches the winner whichever way this goes; what is being
 * decided is a line on the organizer's own page, and that is why the organizer
 * decides it. Anybody can pay into a public vault, which would otherwise mean
 * anybody can put a display name on somebody else's event.
 *
 * Both answers are a write rather than a signature — nothing here touches the
 * chain. The organizer's key is still proved, the same way the description form
 * proves it: a linked wallet counts, and whoever has not linked one signs once.
 *
 * Absent when nobody is waiting, like the track queue above it. Most events
 * will never see this section.
 *
 * What each of them gave, and to which prizes, is read from the contract and
 * shown beside the answer. It was missing entirely, which left an organizer
 * agreeing to put a name on their page without being told whether that name
 * had paid ten units or ten thousand — and anybody at all can claim a credit
 * here, so "nothing on the chain from this address" is an answer this queue
 * has to be able to give.
 */

export function BackerQueue({
  contractId,
  /** The signing address, or null when this console is somebody else's. */
  organizer,
  /** The prize token's ticker, or empty when it is not one we recognise. */
  code,
}: {
  contractId: string;
  organizer: string | null;
  code: string;
}) {
  const { wallet } = useWallet();
  const [waiting, setWaiting] = useState<Backer[]>([]);
  const [given, setGiven] = useState<Contribution[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);

  const reread = useCallback(() => {
    void backersOf(contractId).then((found) =>
      setWaiting(found.filter((backer) => backer.status === "waiting")),
    );
  }, [contractId]);

  useEffect(reread, [reread]);

  /* Read once for the whole queue rather than per row. The contract answers
     with every contribution the event has taken, and a queue of five would
     otherwise walk the same list five times. */
  useEffect(() => {
    let alive = true;

    void contributionsOf(contractId).then((found) => alive && setGiven(found));

    return () => {
      alive = false;
    };
  }, [contractId]);

  async function decide(address: string, shown: boolean) {
    if (organizer === null || wallet === null) {
      return;
    }

    setBusy(address);
    setWhy(null);

    /* Tried without a signature first, because a linked wallet is a signature
       this server already checked and kept. A refusal is the only thing that
       opens the extension. */
    let outcome = await decideCredit(contractId, address, shown, null);

    if (!outcome.ok && outcome.why === null) {
      const account = await accountId();

      if (account === null) {
        setBusy(null);
        setWhy("Sign in again. The account is half of what the handler checks.");

        return;
      }

      const issuedAt = Math.floor(Date.now() / 1000);
      const signature = await proveAddressHex(
        wallet.address,
        challengeFor(contractId, account, issuedAt),
      ).catch(() => null);

      if (signature === null) {
        setBusy(null);
        setWhy("The wallet did not sign it.");

        return;
      }

      outcome = await decideCredit(contractId, address, shown, { issuedAt, signature });
    }

    setBusy(null);

    if (outcome.ok) {
      setWaiting((were) => were.filter((backer) => backer.address !== address));

      return;
    }

    setWhy(outcome.why ?? "That is not the organizer's key.");
  }

  if (waiting.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[1.25rem] bg-paper p-7 ring-1 ring-rule sm:p-9">
      <h3 className="text-[1.25rem] font-semibold text-ink">
        {waiting.length === 1
          ? "A backer wants to be named"
          : `${waiting.length} backers want to be named`}
      </h3>

      <p className="mt-2 max-w-[40rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        Their contribution is already in the vault and is on the page either
        way. This decides whether it carries their name instead of their
        address.
      </p>

      <div className="mt-6 grid gap-4">
        {waiting.map((backer) => {
          const theirs = (given ?? []).filter((one) => one.sponsor === backer.address);
          const total = theirs.reduce((sum, one) => sum + one.amount, BigInt(0));
          const showing = open === backer.address;

          return (
            <div key={backer.address} className="border-t border-rule pt-4">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
                <div className="flex min-w-0 items-center gap-3">
                  {backer.avatarUrl !== null && (
                    <img
                      src={backer.avatarUrl}
                      alt=""
                      className="size-9 shrink-0 rounded-full object-cover"
                    />
                  )}

                  <div className="min-w-0">
                    {/* The name they would be printed as, shown as it would be
                        printed. An organizer answering this is answering about a
                        line on their page, not about a row in a table. */}
                    <p className="truncate text-[1.0625rem] font-semibold text-ink">
                      {claimedName(backer, backer.address)}
                    </p>

                    {/* Everything else they typed, because this is the whole of
                        what is being agreed to. An organizer shown only a name
                        would be approving a website and a sentence unseen. */}
                    {backer.sponsorNote !== null && (
                      <p className="mt-1 max-w-[32rem] text-[0.9375rem] leading-relaxed text-ink-soft">
                        {backer.sponsorNote}
                      </p>
                    )}

                    <p className="tabular mt-0.5 text-[0.875rem] text-ink-faint">
                      {/* What they gave, first. It is the fact the answer turns
                          on and it was the one fact this row did not carry. */}
                      {given === null ? (
                        "reading the chain"
                      ) : theirs.length === 0 ? (
                        <span className="text-broken">nothing on the chain from this address</span>
                      ) : (
                        <span className="font-semibold text-verified">
                          {units(total)}
                          {code === "" ? "" : ` ${code}`}
                        </span>
                      )}
                      {" · "}
                      {short(backer.address)}
                      {backer.sponsorUrl !== null && <> · {backer.sponsorUrl}</>}
                      {backer.username !== null && (
                        <>
                          {" · "}
                          <Link
                            href={`/u/${backer.username}`}
                            className="underline-offset-4 hover:underline"
                          >
                            profile
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Before the two answers rather than after them, because it
                      is what the two answers are supposed to be based on. It
                      is absent when there is nothing to open. */}
                  {theirs.length > 0 && (
                    <Button
                      size="sm"
                      intent="quiet"
                      onClick={() => setOpen(showing ? null : backer.address)}
                    >
                      {showing ? "Hide the detail" : "What they backed"}
                    </Button>
                  )}

                  <Button
                    size="sm"
                    disabled={organizer === null || busy !== null}
                    onClick={() => void decide(backer.address, true)}
                  >
                    {busy === backer.address ? "Saving" : "Show the name"}
                  </Button>

                  <Button
                    size="sm"
                    intent="quiet"
                    disabled={organizer === null || busy !== null}
                    onClick={() => void decide(backer.address, false)}
                  >
                    Keep the address
                  </Button>
                </div>
              </div>

              {showing && <Backing contributions={theirs} code={code} />}
            </div>
          );
        })}
      </div>

      {why !== null && (
        <p className="mt-5 text-[0.9375rem] leading-relaxed text-broken">{why}</p>
      )}
    </section>
  );
}

/**
 * Where one backer's money actually went, from the contract.
 *
 * A contribution is not one number — it names a track, and either a place in it
 * or the whole table — and those are the terms the organizer is being asked to
 * put a name next to. The platform's cut is beside each line rather than folded
 * into it, because the figure that reaches the winners is the one the wall is
 * claiming credit for.
 *
 * Rank zero is the contract's word for "spread over the track". No real rank is
 * zero, so the two can never be read as each other.
 */
function Backing({
  contributions,
  code,
}: {
  contributions: Contribution[];
  code: string;
}) {
  const ticker = code === "" ? "" : ` ${code}`;

  return (
    <dl className="mt-4 grid gap-2 rounded-[0.75rem] bg-paper-sunk px-4 py-3">
      {contributions.map((one) => (
        <div
          key={`${one.track}-${one.rank}-${one.at}`}
          className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1"
        >
          <dt className="text-[0.9375rem] text-ink">
            {titleOf(one.track)}
            <span className="text-ink-faint">
              {" · "}
              {one.rank === 0 ? "every place" : placeName(one.rank)}
            </span>
          </dt>

          <dd className="tabular text-[0.9375rem] text-ink">
            <span className="font-semibold text-verified">
              {units(one.amount)}
              {ticker}
            </span>

            {one.fee > BigInt(0) && (
              <span className="ml-2 text-[0.8125rem] text-ink-faint">
                + {units(one.fee)} fee
              </span>
            )}
          </dd>
        </div>
      ))}

      {/* The account the contributions came from, opened where they can be
          checked against the ledger rather than against this page. */}
      <a
        href={explorerFor("account", contributions[0].sponsor)}
        target="_blank"
        rel="noreferrer"
        className="mt-1 text-[0.875rem] font-bold text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
      >
        See it on the chain ↗
      </a>
    </dl>
  );
}

/**
 * Which signed in account this is, from the browser's own session.
 *
 * The challenge has to name the account the server will check it against, and
 * the server takes that from the cookie rather than from anything the page
 * sends.
 */
async function accountId(): Promise<string | null> {
  const { browserClient } = await import("../../../lib/supabase/client");
  const db = browserClient();

  if (db === null) {
    return null;
  }

  const { data } = await db.auth.getUser();

  return data.user?.id ?? null;
}
