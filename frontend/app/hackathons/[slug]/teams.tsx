"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "../../components/primitives";
import { SpecHeading, SpecLabel, SpecRow, SpecRows } from "../../components/spec";
import { useWallet } from "../../components/wallet-context";
import { hasRoom, isOn, rosterOf, type Roster, type Team } from "../../../lib/teams";
import { signJoin, submitJoin } from "../../../lib/join";
import { ownersOf, teamNames, type Owner } from "../../../lib/team-names";
import {
  askToJoin,
  markAccepted,
  requestsFor,
  withdraw,
  type Request,
} from "../../../lib/team-requests";

/**
 * Finding a team, and answering the people who found yours.
 *
 * Both halves are here rather than on two pages because they are the same list
 * seen from two sides, and which side somebody is on is a fact about them
 * rather than a choice they should have to make from a menu: a captain sees the
 * requests to their team above the teams they could join, and everybody else
 * sees only the teams.
 *
 * Every seat count comes from the contract. Our copy of a roster can be a few
 * seconds behind, and the cost of that here is telling two people there is one
 * place left and watching the second one pay a fee to find out there was not.
 */

export function Teams({ contractId }: { contractId: string }) {
  const { wallet } = useWallet();
  const [roster, setRoster] = useState<Roster | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [owners, setOwners] = useState<Map<string, Owner>>(new Map());
  const [hunt, setHunt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const address = wallet?.address ?? null;

  const reread = useCallback(async () => {
    const [found, asked, titled] = await Promise.all([
      rosterOf(contractId),
      requestsFor(contractId),
      teamNames(contractId),
    ]);

    setRoster(found);
    setRequests(asked);
    setNames(titled);

    /* The captains looked up after the roster, because who they are is a
       question about the addresses it just returned. */
    setOwners(await ownersOf((found?.teams ?? []).map((team) => team.captain)));
  }, [contractId]);

  useEffect(() => {
    void reread();
  }, [reread]);

  if (roster === null) {
    return null;
  }

  /* The teams this address captains, which is what decides whether there is an
     inbox to draw. Read from the contract's own record of who founded what. */
  const mine = address === null ? [] : roster.teams.filter((team) => team.captain === address);
  const inbox = requests.filter((request) => mine.some((team) => team.id === request.teamId));
  const already = address !== null && roster.teams.some((team) => isOn(team, address));

  const matching = roster.teams.filter((team) => {
    const needle = hunt.trim().toLowerCase();

    if (needle.length === 0) {
      return true;
    }

    const owner = owners.get(team.captain);

    return (
      String(team.id).includes(needle) ||
      (names.get(team.id) ?? "").toLowerCase().includes(needle) ||
      (owner?.displayName ?? "").toLowerCase().includes(needle) ||
      (owner?.username ?? "").toLowerCase().includes(needle) ||
      team.captain.toLowerCase().includes(needle) ||
      team.members.some((member) => member.toLowerCase().includes(needle))
    );
  });

  async function ask(team: Team, note: string) {
    if (address === null) {
      return;
    }

    setBusy(`ask-${team.id}`);
    setSaid(null);

    const signed = await signJoin(contractId, team.id, address, team.captain);

    if (!("entry" in signed)) {
      setSaid({ ok: false, text: signed.why ?? "the wallet refused it" });
      setBusy(null);

      return;
    }

    const failed = await askToJoin(
      contractId,
      team.id,
      address,
      signed.entry,
      signed.expiresAtLedger,
      note,
    );

    setSaid(
      failed === null
        ? { ok: true, text: "Asked. The captain sees it on their side of this page." }
        : { ok: false, text: failed },
    );
    setBusy(null);

    if (failed === null) {
      await reread();
    }
  }

  async function accept(request: Request) {
    if (address === null) {
      return;
    }

    setBusy(`accept-${request.id}`);
    setSaid(null);

    const outcome = await submitJoin(
      contractId,
      request.teamId,
      request.applicant,
      request.authEntry,
      address,
    );

    if (outcome.ok) {
      await markAccepted(request.id);
      setSaid({ ok: true, text: "They are on the team, and the chain says so." });
      await reread();
    } else {
      setSaid({ ok: false, text: outcome.why ?? "the contract refused it" });
    }

    setBusy(null);
  }

  return (
    <section className="border-t border-rule">
      <div className="mx-auto w-full max-w-[96rem] px-6 py-16">
        {/* The inbox first, and only for somebody who has one. A captain with
            people waiting has something to do; everybody else has something to
            read, and the doing goes above the reading. */}
        {inbox.length > 0 && (
          <div className="mb-14">
            <SpecLabel index="3">Waiting on you</SpecLabel>

            <SpecHeading className="mt-3">
              {inbox.length === 1 ? "One person wants in" : `${inbox.length} people want in`}
            </SpecHeading>

            <div className="mt-8">
              <SpecRows>
                {inbox.map((request) => (
                  <SpecRow key={request.id} index={`T${request.teamId}`} label="asking" mark>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
                      <div className="min-w-0">
                        <p className="tabular break-all text-[0.875rem] text-ink">
                          {request.applicant}
                        </p>

                        {request.note !== null && (
                          <p className="mt-2 max-w-[34rem] text-[1rem] leading-relaxed text-ink-soft">
                            {request.note}
                          </p>
                        )}
                      </div>

                      <Button
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => void accept(request)}
                      >
                        {busy === `accept-${request.id}` ? "Signing" : "Add them"}
                      </Button>
                    </div>
                  </SpecRow>
                ))}
              </SpecRows>
            </div>
          </div>
        )}

        <SpecLabel index={inbox.length > 0 ? "04" : "03"}>Teams</SpecLabel>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <SpecHeading>Join one, or start your own</SpecHeading>

          {roster.teams.length > 3 && (
            <input
              value={hunt}
              onChange={(event) => setHunt(event.target.value)}
              placeholder="Team or person"
              aria-label="Search teams"
              className="h-10 w-full max-w-[18rem] bg-paper px-4 text-[1rem] text-ink outline-none ring-1 ring-inset ring-rule transition-shadow duration-150 ease-settle focus:ring-ink"
            />
          )}
        </div>

        <div className="mt-8">
          {matching.length === 0 ? (
            <p className="max-w-[38rem] text-[1rem] leading-relaxed text-ink-soft">
              {roster.teams.length === 0
                ? "Nobody has founded a team yet. Whoever goes first is its captain, and a team of one is a team."
                : "No team matches that."}
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {matching.map((team) => (
                <Card
                  key={team.id}
                  team={team}
                  name={names.get(team.id) ?? null}
                  owner={owners.get(team.captain) ?? null}
                  roster={roster}
                  address={address}
                  already={already}
                  busy={busy}
                  asked={requests.some(
                    (request) => request.teamId === team.id && request.applicant === address,
                  )}
                  onAsk={(note) => void ask(team, note)}
                />
              ))}
            </ul>
          )}
        </div>

        {said !== null && (
          <p
            className={`mt-8 max-w-[46rem] text-[1rem] leading-relaxed ${
              said.ok ? "text-verified" : "text-broken"
            }`}
          >
            {said.text}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * One team, as a card.
 *
 * A card rather than a row, because a team is a thing somebody picks from a
 * few, and picking is comparing: the name, who is running it and how much room
 * is left all have to be readable at a glance and side by side. As rows they
 * were a ledger, read top to bottom, with the count buried in a sentence.
 *
 * The count is the second largest thing on it. "2/5" is the single fact that
 * decides whether there is any point reading the rest.
 */
function Card({
  team,
  name,
  owner,
  roster,
  address,
  already,
  busy,
  asked,
  onAsk,
}: {
  team: Team;
  /** What the team called itself, or nothing if nobody has named it. */
  name: string | null;
  /** Who the captain is, when the address belongs to somebody with a profile. */
  owner: Owner | null;
  roster: Roster;
  /** Whether the reader is already on some team in this event. */
  already: boolean;
  address: string | null;
  busy: string | null;
  asked: boolean;
  onAsk: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const on = address !== null && isOn(team, address);
  const room = hasRoom(team, roster.maxSize);
  const canAsk = address !== null && !on && room && (!already || roster.multiTeamAllowed) && !asked;

  return (
    <li className="flex flex-col border border-rule bg-paper p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[1.125rem] text-ink">{name ?? `Team ${team.id}`}</p>

          <p className="mt-1 truncate text-[0.9375rem] text-ink-soft">
            {owner === null ? (
              /* Nobody has linked this address to an account, so there is no
                 name to give. The address is shown rather than a blank: it is
                 still who the captain is. */
              <span className="tabular text-[0.875rem]">
                {team.captain.slice(0, 4)}…{team.captain.slice(-4)}
              </span>
            ) : (
              (owner.displayName ?? `@${owner.username}`)
            )}
          </p>
        </div>

        <p
          className={`tabular shrink-0 text-[1.125rem] ${room ? "text-ink" : "text-ink-faint"}`}
        >
          {team.members.length}/{roster.maxSize}
        </p>
      </div>

      {/* Exactly one thing, and only when it would work. A team is yours, or
          full, or already asked, or joinable, and offering "ask to join" on a
          full one is a press that costs a signature to be refused. */}
      <div className="mt-5">
        {address === null ? (
          /* Nothing to press yet, and saying so beats an empty foot on every
             card or a button that turns out to mean "connect a wallet". */
          <p className="label text-ink-faint">Connect a wallet to ask</p>
        ) : on ? (
          <p className="label text-ink-faint">Yours</p>
        ) : asked ? (
          <p className="label text-ink-faint">Asked</p>
        ) : !room ? (
          <p className="label text-ink-faint">Full</p>
        ) : canAsk ? (
          <Button size="sm" intent="quiet" onClick={() => setOpen(!open)}>
            {open ? "Never mind" : "Ask to join"}
          </Button>
        ) : null}
      </div>

      {open && canAsk && (
        <div className="mt-4 border-t border-rule pt-4">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 280))}
            placeholder="Say something, if you like"
            aria-label="A note for the captain"
            className="h-10 w-full bg-paper-sunk px-3 text-[0.9375rem] text-ink outline-none ring-1 ring-inset ring-rule transition-shadow duration-150 ease-settle focus:ring-ink"
          />

          <Button
            size="sm"
            className="mt-3 w-full"
            disabled={busy !== null}
            onClick={() => onAsk(note)}
          >
            {busy === `ask-${team.id}` ? "Signing" : "Send the request"}
          </Button>

          {/* Said before the wallet opens rather than after. Somebody about to
              be asked for a signature deserves to know it is not the join
              itself. */}
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-faint">
            You sign your half now. The captain adds theirs when they accept.
          </p>
        </div>
      )}
    </li>
  );
}
