"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { arg, send, type Sent } from "../../../lib/send";
import { decideAll, reasonHash, type Applicant } from "../../../lib/applications";
import { linksOf, type Person } from "../../../lib/hackers";
import { shorten } from "../../components/wallet-context";

/**
 * A face, or the initial of one, or the shape where one would be.
 *
 * Held at one size whichever it is, so a queue does not reflow as the avatars
 * arrive and an organizer's press does not land on the row that moved.
 */
function Face({ person, address }: { person: Person | undefined; address: string }) {
  if (person?.avatarUrl != null) {
    return (
      <img
        src={person.avatarUrl}
        alt=""
        className="size-11 shrink-0 rounded-full object-cover ring-1 ring-rule"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid size-11 shrink-0 place-items-center rounded-full bg-paper-sunk text-[1rem] text-ink-faint"
    >
      {(person?.displayName ?? person?.username ?? address).trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * The whole key, on request.
 *
 * Folded away by default because fifty six characters is not something
 * anybody reads, and open because an organizer checking an applicant against
 * a list they were sent elsewhere needs the characters, not a summary of
 * them. Copying puts it on the clipboard rather than asking somebody to
 * select a monospace run by hand.
 */
function Address({ address }: { address: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => setShown(true)}
        className="mt-3 self-start text-[0.75rem] text-ink-faint underline-offset-4 hover:text-ink-soft hover:underline"
      >
        Show the full address
      </button>
    );
  }

  return (
    <div className="mt-3 grid gap-1.5 rounded-[0.75rem] bg-paper-sunk p-3">
      <p className="tabular break-all text-[0.75rem] leading-relaxed text-ink-soft">{address}</p>

      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(address).then(() => setCopied(true));
        }}
        className="self-start text-[0.75rem] text-ink-faint underline-offset-4 hover:text-ink-soft hover:underline"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/**
 * Deciding several at once.
 *
 * A reviewer facing forty applications had forty wallet prompts to get
 * through, and a wallet prompt is the one step in this product that cannot be
 * made faster. What that produced was not a slow afternoon; it was queues
 * nobody finished.
 *
 * The bar is quiet until something is ticked, and it says the count in every
 * label. Nobody should have to count checkboxes to find out what they are
 * about to sign for, and "Approve" over a selection somebody made three
 * scrolls ago is exactly the press that goes wrong.
 */
function Batch({
  waiting,
  ticked,
  busy,
  onAll,
  onDecide,
}: {
  waiting: Applicant[];
  ticked: Applicant[];
  busy: string | null;
  onAll: () => void;
  /** The words behind a refusal, or null to let them in. */
  onDecide: (reason: string | null) => void;
}) {
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");

  const all = ticked.length === waiting.length;
  const some = ticked.length > 0;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[1rem] bg-paper-sunk px-4 py-3">
      <label className="flex cursor-pointer items-center gap-2.5 text-[0.9375rem] text-ink">
        <input
          type="checkbox"
          checked={all}
          /* Some but not all reads as a third state, and it is one. Without
             it the box looks empty over a selection of nine out of ten. */
          ref={(box) => {
            if (box !== null) {
              box.indeterminate = some && !all;
            }
          }}
          onChange={onAll}
          className="size-4 accent-ink"
        />

        {some ? `${ticked.length} of ${waiting.length} selected` : `Select all ${waiting.length}`}
      </label>

      {some && !refusing && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => onDecide(null)}
            className="h-9 rounded-full bg-verified/12 px-4 text-[0.9375rem] font-semibold text-verified transition-colors duration-150 ease-settle hover:bg-verified hover:text-paper disabled:opacity-40 disabled:hover:bg-verified/12 disabled:hover:text-verified"
          >
            {busy === "batch" ? "Signing" : `Approve ${ticked.length}`}
          </button>

          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setRefusing(true)}
            className="h-9 rounded-full bg-broken/10 px-4 text-[0.9375rem] font-semibold text-broken transition-colors duration-150 ease-settle hover:bg-broken hover:text-paper disabled:opacity-40 disabled:hover:bg-broken/10 disabled:hover:text-broken"
          >
            Refuse {ticked.length}
          </button>
        </div>
      )}

      {/* One reason for the batch, because that is what somebody turning
          thirty people away actually has: a rule they all fell outside of.
          Anybody who needs to say something different to one of them refuses
          that one on their own card. */}
      {some && refusing && (
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            value={reason}
            autoFocus
            onChange={(event) => setReason(event.target.value)}
            placeholder={`Why all ${ticked.length} are being refused`}
            className="h-9 min-w-[16rem] flex-1 rounded-[0.5rem] bg-paper px-3 text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-2 focus:ring-ink"
          />

          <button
            type="button"
            disabled={busy !== null || reason.trim().length === 0}
            onClick={() => onDecide(reason.trim())}
            className="h-9 rounded-full bg-broken px-4 text-[0.9375rem] font-semibold text-paper transition-opacity duration-150 ease-settle hover:opacity-90 disabled:opacity-40"
          >
            {busy === "batch" ? "Signing" : `Refuse ${ticked.length}`}
          </button>

          <button
            type="button"
            onClick={() => setRefusing(false)}
            className="h-9 px-2 text-[0.9375rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            Cancel
          </button>

          <span className="basis-full text-[0.75rem] text-ink-faint">
            A hash of this goes on chain, against each of them, and stays there.
          </span>
        </div>
      )}

      {/* Said where the press happens, because it is the one thing about a
          batch that differs from deciding one at a time. */}
      {some && (
        <span className="basis-full text-[0.75rem] leading-relaxed text-ink-faint">
          One signature for all {ticked.length}. Anybody already decided in the
          meantime keeps the decision they have and the rest go through.
        </span>
      )}
    </div>
  );
}

/**
 * The queue, and the two things that can be done with each row.
 *
 * A refusal needs a written reason. That is the contract's rule, not this
 * page's: `reject_application` will not take a call without a digest, because a
 * refusal that leaves no trace is exactly the quiet back door the rest of the
 * product is built to close. So the field is required here and the words are
 * hashed in the browser before anything is signed.
 */

export function Applications({
  contractId,
  reviewer,
  applicants,
  reread,
  reviewed,
}: {
  contractId: string;
  reviewer: string | null;
  /**
   * The queue, read by the panel and handed down.
   *
   * Read here as well it would be read twice on every visit, and this is the
   * expensive one: it walks the contract's event log in passes of ten thousand
   * ledgers. Null means the panel has not finished the walk yet.
   */
  applicants: Applicant[] | null;
  /** Re-reads the queue after a decision, so the panel's count follows it. */
  reread: () => Promise<void>;
  /**
   * Whether the frozen rules put anybody in front of a decision at all.
   *
   * An open hackathon has applicants and no queue: they were admitted as they
   * arrived, and the buttons would offer a decision the contract has already
   * made and would refuse. The list stays, because who turned up is the
   * question this tab answers either way.
   */
  reviewed: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  /* Only the failing arm, because success is no longer reported here. Typed as
     that arm rather than as `Sent` so nothing can quietly start putting a
     succeeded call back into it. */
  const [result, setResult] = useState<Extract<Sent, { ok: false }> | null>(null);

  /* Who these addresses belong to, when they belong to anybody. An applicant
     with no account here still applies and is still decided on; what they lack
     is a face, not a right. */
  const [people, setPeople] = useState<Record<string, Person>>({});

  /* Ticked for a decision in bulk. Held as addresses rather than as indexes,
     because the queue is re-read after every decision and a position in it is
     not the same row twice. */
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (applicants === null || applicants.length === 0) {
      return;
    }

    let alive = true;
    const addresses = applicants.map((applicant) => applicant.address).join(",");

    void fetch(`/api/people?addresses=${addresses}`)
      .then((answer) => answer.json() as Promise<{ people: Record<string, Person> }>)
      .then((said) => alive && setPeople(said.people))
      .catch(() => null);

    return () => {
      alive = false;
    };
  }, [applicants]);

  async function decide(address: string, work: () => Promise<Sent>) {
    setBusy(address);
    setResult(null);

    const outcome = await work();

    /* Only what went wrong is kept. A decision that landed says so by the card
       turning green in front of whoever pressed it; a line under the queue
       reading "Recorded." is the same news a second time, in a place nobody was
       looking, and it stayed on screen long after the thing it described. */
    setResult(outcome.ok || outcome.refused ? null : outcome);
    setBusy(null);

    if (outcome.ok) {
      setRefusing(null);
      setReason("");
      /* Cleared, because every name in it has just been decided and a tick
         left behind would be a tick against a row that is no longer waiting. */
      setPicked(new Set());
      await reread();
    }
  }

  if (applicants === null) {
    return (
      <section>
        <p className="label text-ink-faint">Reading the log</p>
      </section>
    );
  }

  const waiting = applicants.filter((applicant) => applicant.status === "pending");
  /* Only what is both selected and still waiting. A queue re-read under a
     selection can decide a name somebody ticked a minute ago, and the contract
     would take the whole batch down over it. */
  const ticked = waiting.filter((applicant) => picked.has(applicant.address));

  return (
    <section>
      {!reviewed && (
        <p className="mb-6 max-w-[38rem] text-[1rem] leading-relaxed text-ink-soft">
          Your rules let anybody in, so everybody here was admitted as they
          applied. There is nothing to approve.
        </p>
      )}

      {applicants.length === 0 ? (
        <p className="max-w-[38rem] text-[1rem] leading-relaxed text-ink-soft">
          Nobody has applied yet.
        </p>
      ) : (
        <>
          {/* Offered only where there is a queue and a key to sign with, and
              only once there is more than one name in it. A "select all" over
              a single application is a second way to do what the card below
              already does in one press. */}
          {reviewed && reviewer !== null && waiting.length > 1 && (
            <Batch
              waiting={waiting}
              ticked={ticked}
              busy={busy}
              onAll={() =>
                setPicked(
                  ticked.length === waiting.length
                    ? new Set()
                    : new Set(waiting.map((applicant) => applicant.address)),
                )
              }
              onDecide={(reason) =>
                void decide("batch", async () =>
                  decideAll(
                    contractId,
                    reviewer,
                    ticked.map((applicant) => applicant.address),
                    reason,
                  ),
                )
              }
            />
          )}

          {/* Three across where there is room. One applicant is a name, an
              address and two decisions, which is a card rather than a row: laid
              out full width, a queue of ten was ten strips of mostly empty paper
              with the buttons a screen away from the name they belong to. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {applicants.map((applicant) => {
              const person = people[applicant.address];
              const pending = applicant.status === "pending";
              const selectable = pending && reviewed && reviewer !== null;
              const chosen = picked.has(applicant.address);

              return (
                <div
                  key={applicant.address}
                  className={`flex flex-col rounded-[1rem] bg-paper p-4 ring-1 transition-shadow duration-150 ease-settle ${
                    chosen && selectable ? "ring-2 ring-ink" : "ring-rule"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Beside the face rather than in a corner. The thing
                        being ticked is a person, and a box floated away from
                        their name is a box somebody ticks against the wrong
                        row. */}
                    {selectable && (
                      <input
                        type="checkbox"
                        checked={chosen}
                        aria-label={`Select ${person?.displayName ?? person?.username ?? applicant.address}`}
                        onChange={() =>
                          setPicked((were) => {
                            const next = new Set(were);

                            if (!next.delete(applicant.address)) {
                              next.add(applicant.address);
                            }

                            return next;
                          })
                        }
                        className="size-4 shrink-0 accent-ink"
                      />
                    )}

                    <Face person={person} address={applicant.address} />

                    {/* A name when there is one, and the key itself when there
                        is not. "Unnamed builder" read as somebody who had not
                        filled in a profile; what is actually missing is the
                        link between their wallet and an account here, which
                        nobody applying has any reason to have made. The address
                        is the identity in that case, so it is the heading. */}
                    <div className="min-w-0 flex-1">
                      {person === undefined ? (
                        <>
                          <p className="tabular truncate text-[1rem] font-semibold text-ink">
                            {shorten(applicant.address)}
                          </p>

                          <p className="truncate text-[0.8125rem] text-ink-faint">
                            No account linked to this wallet
                          </p>
                        </>
                      ) : (
                        <>
                          {/* The name goes to their profile. This card is
                              where somebody is being let into an event or
                              turned away from it, and a name that cannot be
                              followed is a decision taken on a string. */}
                          <Link
                            href={`/u/${person.username}`}
                            target="_blank"
                            className="block truncate text-[1rem] font-semibold text-ink underline-offset-4 hover:underline"
                          >
                            {person.displayName ?? person.username}
                          </Link>

                          {/* The address under the name rather than instead of
                              it. Whoever the contract approves is a key, so an
                              organizer should see both the person and the key;
                              what they never need is all fifty six
                              characters. */}
                          <p className="tabular truncate text-[0.8125rem] text-ink-faint">
                            {shorten(applicant.address)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Whatever they said about themselves elsewhere. Nothing
                      on this card is our judgement of an applicant — these
                      are the three links their own profile carries, put where
                      the decision is being made rather than a page away. */}
                  {person !== undefined && linksOf(person).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                      {linksOf(person).map((link) => (
                        <a
                          key={link.key}
                          href={link.href}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-[0.8125rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                        >
                          {link.title}
                        </a>
                      ))}
                    </div>
                  )}

                  {/* The key in full, once, for the organizer who is checking
                      it against something. Shortened everywhere else because
                      fifty six characters is not a thing anybody reads, but an
                      organizer who needs to compare one has nowhere else to
                      get it. */}
                  <Address address={applicant.address} />

                  {pending && reviewed && reviewer !== null ? (
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          void decide(applicant.address, async () =>
                            send(
                              contractId,
                              "approve_application",
                              [await arg.address(reviewer), await arg.address(applicant.address)],
                              reviewer,
                            ),
                          )
                        }
                        className="h-9 flex-1 rounded-full bg-verified/12 text-[0.9375rem] font-semibold text-verified transition-colors duration-150 ease-settle hover:bg-verified hover:text-paper disabled:opacity-40 disabled:hover:bg-verified/12 disabled:hover:text-verified"
                      >
                        {busy === applicant.address ? "Signing" : "Approve"}
                      </button>

                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          setRefusing(refusing === applicant.address ? null : applicant.address)
                        }
                        className="h-9 flex-1 rounded-full bg-broken/10 text-[0.9375rem] font-semibold text-broken transition-colors duration-150 ease-settle hover:bg-broken hover:text-paper disabled:opacity-40 disabled:hover:bg-broken/10 disabled:hover:text-broken"
                      >
                        {refusing === applicant.address ? "Cancel" : "Refuse"}
                      </button>
                    </div>
                  ) : (
                    <p
                      className={`label mt-4 ${
                        applicant.status === "approved" ? "text-verified" : "text-ink-faint"
                      }`}
                    >
                      {applicant.status}
                    </p>
                  )}

                  {refusing === applicant.address && reviewer !== null && (
                    <div className="mt-3 grid gap-3 rounded-[0.75rem] bg-paper-sunk p-3">
                      <input
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Why, in writing"
                        className="h-10 w-full rounded-[0.5rem] bg-paper px-3 text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-2 focus:ring-ink"
                      />

                      <button
                        type="button"
                        disabled={busy !== null || reason.trim().length === 0}
                        onClick={() =>
                          void decide(applicant.address, async () =>
                            send(
                              contractId,
                              "reject_application",
                              [
                                await arg.address(reviewer),
                                await arg.address(applicant.address),
                                await arg.bytes32(await reasonHash(reason.trim())),
                              ],
                              reviewer,
                            ),
                          )
                        }
                        className="h-9 rounded-full bg-broken text-[0.9375rem] font-semibold text-paper transition-opacity duration-150 ease-settle hover:opacity-90 disabled:opacity-40"
                      >
                        {busy === applicant.address ? "Signing" : "Refuse them"}
                      </button>

                      {/* Said plainly, because it is the part somebody would
                          otherwise learn afterwards: the words are hashed and
                          the hash is permanent. */}
                      <p className="text-[0.75rem] leading-relaxed text-ink-faint">
                        A hash of this goes on chain and stays there.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {waiting.length > 0 && (
            <p className="label mt-5 text-ink-faint">{waiting.length} waiting</p>
          )}
        </>
      )}

      {result !== null && (
        <p className="mt-6 max-w-[46rem] text-[0.9375rem] leading-relaxed text-broken">
          {result.why}
        </p>
      )}
    </section>
  );
}
