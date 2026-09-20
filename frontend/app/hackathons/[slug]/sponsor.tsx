"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "../../components/primitives";
import { ProposeTrackPanel } from "../../components/propose-track-panel";
import { SponsorPanel } from "../../components/sponsor-panel";
import { creditFor, nameOf, short, type Backer } from "../../../lib/backers";
import { units } from "../../../lib/money";
import {
  alreadyRunning,
  canProposeTrack,
  placeName,
  type Contribution,
  type Position,
} from "../../../lib/sponsor";
import type { Rules } from "../../../lib/rules";
import { titleOf } from "../../../lib/words";

/**
 * The offer to put money into somebody else's prizes, and the wall of people
 * who already did.
 *
 * It sits under the prize table rather than beside the sign-up button, because
 * it answers a different question from the rest of the page. Everything above
 * is somebody deciding whether to enter; this is somebody deciding whether to
 * back it, and the two are rarely the same person.
 *
 * The wall is read from the contract rather than from our own tables. It names
 * people who paid real money into a public pool, and a list a backend assembled
 * is a list a backend could be wrong about.
 */

export function Sponsor({
  contractId,
  rules,
  phase,
  positions,
  contributions,
  backers,
  code,
}: {
  contractId: string;
  rules: Rules;
  phase: number | null;
  positions: Position[];
  contributions: Contribution[];
  /** The names the organizer has agreed to, and the ones still waiting. */
  backers: Backer[];
  code: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);

  /* A card can link straight to the action rather than merely dropping the
     reader beside it. Kept in the URL so the destination can be shared, then
     removed when the panel closes so an ordinary refresh does not reopen it. */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("donate") === "1") {
      setOpen(true);
    }
  }, []);

  function closeSponsor() {
    setOpen(false);

    const url = new URL(window.location.href);
    if (url.searchParams.has("donate")) {
      url.searchParams.delete("donate");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  const added = contributions.reduce((sum, one) => sum + one.amount, BigInt(0));

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button onClick={() => setOpen(true)}>Add to the prize</Button>

        {/* Offered only where the rules allowed a category and the build is
            still running. A project names one track, so a category opened after
            the last entry landed would be a prize nothing could reach, and the
            contract refuses it on the same line. */}
        {canProposeTrack(rules, phase) && (
          <Button intent="quiet" onClick={() => setAsking(true)}>
            Ask for your own category
          </Button>
        )}

        <p className="max-w-[30rem] text-[0.9375rem] leading-relaxed text-ink-soft">
          {added > BigInt(0) ? (
            <>
              Sponsors have added{" "}
              <span className="tabular font-semibold text-verified">
                {units(added)} {code}
              </span>{" "}
              to this pool. It goes to the winners along with the rest.
            </>
          ) : (
            <>
              Anyone can add to a prize on this table. It goes into the same vault
              and comes out the same way, to whoever wins that position.
            </>
          )}
        </p>
      </div>

      {/* Said on the page as well as in the panel, because somebody deciding
          whether to click should already know what they are walking into. */}
      {alreadyRunning(phase) && (
        <p className="text-[0.875rem] leading-relaxed text-ink-faint">
          This one has already started, so a contribution now will not have drawn
          anybody in — but it still reaches whoever wins.
        </p>
      )}

      {contributions.length > 0 && (
        <Wall contributions={contributions} backers={backers} code={code} />
      )}

      <SponsorPanel
        open={open}
        onClose={closeSponsor}
        onComplete={() => router.refresh()}
        contractId={contractId}
        rules={rules}
        phase={phase}
        positions={positions}
        code={code}
      />

      <ProposeTrackPanel
        open={asking}
        onClose={() => setAsking(false)}
        contractId={contractId}
        rules={rules}
        code={code}
      />
    </div>
  );
}

/**
 * Who paid, what for, and how much.
 *
 * Every line is the contract's. The amounts, the positions and the addresses
 * are read from it, and this list is the same length whatever our own database
 * says — a backer nobody has named is an address, not an absence.
 *
 * The name, where there is one, is the part the chain cannot hold. It comes
 * from the account behind a wallet that proved itself, and only after the
 * organizer agreed to print it, which is what stops a stranger's display name
 * from landing on somebody else's page for the price of one stroop.
 */
function Wall({
  contributions,
  backers,
  code,
}: {
  contributions: Contribution[];
  backers: Backer[];
  code: string;
}) {
  return (
    <div className="border-t border-rule pt-5">
      <p className="label text-[0.8125rem] text-ink-faint">Who backed this</p>

      <ul className="mt-3 grid gap-0">
        {contributions.map((one, at) => {
          const credit = creditFor(backers, one.sponsor);
          const named = credit !== undefined && credit.status === "shown";
          const goes = credit === undefined ? null : destination(credit);

          return (
            <li
              key={`${one.sponsor}-${one.at}-${at}`}
              className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5 ${
                at === contributions.length - 1 ? "" : "border-b border-rule"
              }`}
            >
              {/* A name is a person and reads as one; an address is a key and
                  stays in the chain's own type. The two are never dressed
                  alike, so nobody has to wonder which they are looking at. */}
              {named ? (
                <span className="flex min-w-0 items-center gap-2">
                  {credit.avatarUrl !== null && (
                    <img
                      src={credit.avatarUrl}
                      alt=""
                      className="size-6 shrink-0 rounded-full object-cover"
                    />
                  )}

                  {/* Their own site first, then their profile here, then
                      nothing. A sponsor who gave a website gave it to be
                      followed, and it is the more useful of the two. */}
                  {goes === null ? (
                    <span className="truncate text-[0.9375rem] font-semibold text-ink">
                      {nameOf(credit, one.sponsor)}
                    </span>
                  ) : (
                    <Link
                      href={goes}
                      className="truncate text-[0.9375rem] font-semibold text-ink underline-offset-4 hover:underline"
                    >
                      {nameOf(credit, one.sponsor)}
                    </Link>
                  )}
                </span>
              ) : (
                <span className="tabular text-[0.9375rem] text-ink">{short(one.sponsor)}</span>
              )}

              <span className="flex items-baseline gap-3">
                <span className="text-[0.875rem] text-ink-faint">
                  {titleOf(one.track)} &middot; {placeName(one.rank)}
                </span>

                <span className="tabular text-[0.9375rem] font-semibold text-verified">
                  {units(one.amount)} {code}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Where a credited name points, or nowhere.
 *
 * Only `http` and `https`. A sponsor types this into a box and it is printed as
 * a link on somebody else's page, so a `javascript:` URL would be a script the
 * organizer never agreed to run. Their own site comes before their profile
 * here: it is the one they gave to be followed.
 */
function destination(backer: Backer): string | null {
  if (backer.sponsorUrl !== null && /^https?:\/\//i.test(backer.sponsorUrl)) {
    return backer.sponsorUrl;
  }

  return backer.username === null ? null : `/u/${backer.username}`;
}
