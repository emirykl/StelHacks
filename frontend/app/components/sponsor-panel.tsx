"use client";

import { useEffect, useState } from "react";

import { Button } from "./primitives";
import { Celebration } from "./celebration";
import { Modal } from "./modal";
import { useWallet } from "./wallet-context";
import { claimCredit, digestOf } from "../../lib/backers";
import { toSmallestUnit } from "../../lib/constitution";
import { explorerFor } from "../../lib/explorer";
import { units } from "../../lib/money";
import {
  alreadyRunning,
  feeOn,
  placeName,
  sharesOf,
  sponsorPlaces,
  sponsorTier,
  EVERY_PLACE,
  type Position,
  type Split,
} from "../../lib/sponsor";
import { accept, assetOf, balanceOf, type PrizeAsset } from "../../lib/trustline";
import type { Rules } from "../../lib/rules";
import { titleOf } from "../../lib/words";

/**
 * Putting money into somebody else's prize pool.
 *
 * The panel exists because a contribution is four decisions and a person should
 * make them in one place: which prize, how much, what it costs on top, and
 * whether it is still worth doing this late. Splitting them across a page and a
 * wallet prompt is how somebody ends up signing for a number they did not
 * expect.
 *
 * The cut is on screen before anything is signed, in the same figures the
 * contract will charge. It is charged **on top** of the contribution, so the
 * prize grows by exactly what was typed and the sponsor pays a little more than
 * that. Showing only the total, or only the contribution, would each hide one
 * half of a bargain the sponsor is entitled to see whole.
 */

type Step =
  | { at: "choosing" }
  | { at: "warned" }
  | { at: "signing" }
  | { at: "done"; hash: string }
  | { at: "failed"; why: string };

export function SponsorPanel({
  open,
  onClose,
  onComplete,
  contractId,
  rules,
  phase,
  positions,
  code,
}: {
  open: boolean;
  onClose: () => void;
  /** Refreshes chain-backed totals after a contribution lands. */
  onComplete?: () => void;
  contractId: string;
  rules: Rules;
  phase: number | null;
  positions: Position[];
  /** The prize token's ticker, or empty when it is not one we recognise. */
  code: string;
}) {
  const { wallet } = useWallet();
  const address = wallet?.address ?? null;

  /*
    The track first, then the position inside it.

    One flat list of "track · rank" was right while every event had a single
    track. With a sponsored category or two it becomes a dozen rows in which the
    same three words repeat, and the sponsor's actual first decision — which
    competition they are backing — is left to be inferred from a prefix. Asked
    in order, each question has one short answer.
  */
  const tracks = [...new Set(positions.map((one) => one.track))];
  const [track, setTrack] = useState(tracks[0] ?? "");
  /*
    Every place, until somebody narrows it.

    The old default was first place, because it was the top row of a list that
    had to have something in it. That made the commonest sponsor — somebody
    with a hundred dollars who wants the prizes to be bigger — answer a
    question about which of four strangers benefits, and answer it by pressing
    whatever was already selected. Spreading it is the answer they meant, so
    it is the one already filled in.
  */
  const [choice, setChoice] = useState<number | typeof EVERY_PLACE>(EVERY_PLACE);
  const [split, setSplit] = useState<Split>("evenly");
  const [typed, setTyped] = useState("");
  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [about, setAbout] = useState("");
  const [step, setStep] = useState<Step>({ at: "choosing" });
  const [asset, setAsset] = useState<PrizeAsset | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const inTrack = positions.filter((one) => one.track === track);
  /* A track that pays one place has nothing to spread over. Offering the
     choice anyway would be asking somebody to divide a hundred among one. */
  const only = inTrack.length === 1 ? inTrack[0] : undefined;
  const spreading = only === undefined && choice === EVERY_PLACE;
  /* Falling back to every place rather than to the first row, so changing
     track never leaves a rank selected that the new one does not have. */
  const position = only ?? (spreading ? undefined : inTrack.find((one) => one.rank === choice));
  const amount = typed.trim() === "" ? BigInt(0) : toSmallestUnit(typed);
  const fee = feeOn(amount, feeBps(rules));
  const floor = rules.sponsorship.minBounty;

  /* What each place would get, worked out the way the contract works it out.
     Shown on the rows themselves, because "spread it evenly" is a promise and
     the figures are what make it one somebody can check before signing. */
  const shares = sharesOf(spreading ? amount : BigInt(0), inTrack, split);
  const trackWorth = inTrack.reduce((sum, one) => sum + one.worth, BigInt(0));

  useEffect(() => {
    if (rules.prizeAsset === null) {
      return;
    }

    let alive = true;
    void assetOf(rules.prizeAsset).then((found) => alive && setAsset(found));

    return () => {
      alive = false;
    };
  }, [rules.prizeAsset]);

  useEffect(() => {
    if (address === null || rules.prizeAsset === null) {
      return;
    }

    let alive = true;
    void balanceOf(rules.prizeAsset, address).then((found) => alive && setHeld(found));

    return () => {
      alive = false;
    };
  }, [address, rules.prizeAsset, step]);

  /* A wallet that has never agreed to hold the prize token cannot be sent it,
     and cannot send it either. `null` is no trustline at all, which is a
     different answer from a balance of zero. */
  const needsTrustline = held === null && asset !== null && asset.kind === "issued";
  const short = held !== null && toSmallestUnit(held) < amount + fee;
  const belowFloor = amount > BigInt(0) && amount < floor;

  /* Trimmed and capped here rather than only on the way into the database,
     because these three strings are what the digest is taken over and what the
     row is written from. Hashing one spelling and storing another would leave a
     note on chain that nothing on our side can reproduce. */
  const said = {
    name: name.trim().slice(0, 80),
    url: site.trim().slice(0, 200),
    note: about.trim().slice(0, 500),
  };

  const ready =
    address !== null &&
    (spreading ? inTrack.length > 0 : position !== undefined) &&
    amount > BigInt(0) &&
    !belowFloor &&
    !short &&
    !needsTrustline &&
    /* A name is asked for because it is the line that goes on somebody else's
       page. The other two are theirs to leave empty. */
    said.name.length > 0;

  async function acceptAsset() {
    if (address === null || asset === null) {
      return;
    }

    setAccepting(true);
    const outcome = await accept(address, asset);
    setAccepting(false);

    if (!outcome.ok && !outcome.refused) {
      setStep({ at: "failed", why: outcome.why });
    }

    if (outcome.ok && rules.prizeAsset !== null) {
      setHeld(await balanceOf(rules.prizeAsset, address));
    }
  }

  async function give() {
    if (address === null || (position === undefined && !spreading)) {
      return;
    }

    setStep({ at: "signing" });

    /* The note the contract has always taken, now over something. It is a
       digest of exactly the three fields below, so anybody can take the row we
       store, hash it themselves, and see whether it is what the sponsor signed
       for — which is what keeps a name on a sponsor wall from being ours to
       change afterwards. */
    const note = await digestOf(said);

    /* Two calls rather than one taking an optional rank. Spreading files as a
       single contribution over a whole table and naming a place files against
       that place, and a contract entry point that did both would be deciding
       which from the shape of its own arguments. */
    const outcome =
      position === undefined
        ? await sponsorPlaces(contractId, address, track, amount, split, note)
        : await sponsorTier(
            contractId,
            address,
            position.track,
            position.rank,
            amount,
            note,
          );

    if (!outcome.ok) {
      setStep({ at: "failed", why: outcome.why ?? "the wallet refused it" });

      return;
    }

    /* Asks to be named for it, and does not wait. The money is on the chain
       either way; a credit request that failed to reach us is a line missing
       from a wall, not a donation that went wrong. */
    void claimCredit(contractId, address, said);

    setStep({ at: "done", hash: outcome.hash });
  }

  /* The warning is a step rather than a sentence, because it is asking a
     question. A track's teams chose what to build against the prize that was on
     the page when they started, and a sponsor arriving in the last week should
     decide knowingly rather than read a line of grey text. */
  function begin() {
    if (alreadyRunning(phase) && step.at === "choosing") {
      setStep({ at: "warned" });

      return;
    }

    void give();
  }

  function finish() {
    onClose();
    onComplete?.();
  }

  return (
    <>
      {/* Outside the modal rather than on its last screen. The panel scrolls
          its own overflow and is animated with a transform, and both of those
          are things a fixed, full screen canvas inside it would be measured
          and clipped against. Out here it covers the window, which is the
          whole idea. */}
      <Celebration fire={step.at === "done"} />

      <Modal open={open} onClose={onClose} title="Become a Sponsor for Hackathon">
        {step.at === "done" ? (
          <Done hash={step.hash} amount={units(amount)} code={code} onClose={finish} />
        ) : step.at === "warned" ? (
          <Warning
            onGoBack={() => setStep({ at: "choosing" })}
            onCarryOn={() => void give()}
          />
        ) : (
          /* Headings and figures, and nothing between them.

             Every line this form used to carry was true and none of it was being
             read: somebody arrives here having already pressed Donate, and what
             they need is which prize, how much, and what it costs. The one thing
             that is genuinely a decision rather than a description — that a late
             contribution will not have drawn anybody in — is a step of its own
             below, where it has to be answered instead of scrolled past. */
          <div className="grid gap-6">
            <h2 className="display text-[1.5rem] font-bold text-ink">
              Become a Sponsor for Hackathon
            </h2>

            {/* Shown even when there is only one, which looks like asking
                somebody to confirm the only answer and is not. The rank rows
                below say "1st", not "main · 1st", so with this row hidden a
                single track event never names the competition being backed
                anywhere on the form. One chip, already chosen, is the label
                that was missing. */}
            <div className="grid gap-2">
              <p className="label text-[0.8125rem] text-ink-faint">Track</p>

              <div className="flex flex-wrap gap-1">
                {tracks.map((one) => (
                  <button
                    key={one}
                    type="button"
                    onClick={() => {
                      setTrack(one);
                      setChoice(EVERY_PLACE);
                    }}
                    className={`border px-4 py-2.5 text-[0.9375rem] transition-colors ${
                      one === track
                        ? "border-ink bg-paper-sunk text-ink"
                        : "border-rule text-ink-soft hover:border-ink-faint"
                    }`}
                  >
                    {titleOf(one)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <p className="label text-[0.8125rem] text-ink-faint">Which prize</p>

              <div className="grid gap-1">
                {/* First, and selected by default. A sponsor who wants one
                    place can still say so; what they should not have to do is
                    pick a winner in order to give. */}
                {only === undefined && (
                  <button
                    type="button"
                    onClick={() => setChoice(EVERY_PLACE)}
                    className={`flex items-baseline justify-between gap-4 border px-4 py-3 text-left transition-colors ${
                      spreading ? "border-ink bg-paper-sunk" : "border-rule hover:border-ink-faint"
                    }`}
                  >
                    <span className="text-[0.9375rem] text-ink">
                      Every place{" "}
                      <span className="text-ink-faint">· {inTrack.length} prizes</span>
                    </span>

                    <span className="tabular text-[0.9375rem] font-semibold text-verified">
                      {units(trackWorth)} {code}

                      {spreading && amount > BigInt(0) && (
                        <span className="ml-2 text-[0.8125rem] font-semibold text-signal-deep dark:text-signal">
                          + {units(amount)}
                        </span>
                      )}
                    </span>
                  </button>
                )}

                {inTrack.map((one, at) => {
                  const gets = spreading ? (shares[at] ?? BigInt(0)) : BigInt(0);

                  return (
                    <button
                      key={`${one.track}-${one.rank}`}
                      type="button"
                      onClick={() => setChoice(one.rank)}
                      className={`flex items-baseline justify-between gap-4 border px-4 py-3 text-left transition-colors ${
                        one.rank === position?.rank
                          ? "border-ink bg-paper-sunk"
                          : "border-rule hover:border-ink-faint"
                      }`}
                    >
                      <span className="text-[0.9375rem] text-ink">{placeName(one.rank)}</span>

                      <span className="tabular text-[0.9375rem] font-semibold text-verified">
                        {units(one.worth)} {code}
                        {/* The share this place would get, on the place
                            itself. "Split evenly" is a promise; these are the
                            figures that let somebody check it before they
                            sign rather than afterwards. */}
                        {gets > BigInt(0) ? (
                          <span className="ml-2 text-[0.8125rem] font-semibold text-signal-deep dark:text-signal">
                            + {units(gets)}
                          </span>
                        ) : (
                          one.worth > one.frozen && (
                            <span className="ml-2 text-[0.8125rem] font-normal text-ink-faint">
                              was {units(one.frozen)}
                            </span>
                          )
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Only where it decides something. With one place in the track
                the two rules agree, and with nothing typed there is nothing
                to divide yet. */}
            {spreading && (
              <div className="grid gap-2">
                <p className="label text-[0.8125rem] text-ink-faint">How to divide it</p>

                <div className="flex flex-wrap gap-1">
                  <Divide
                    chosen={split === "evenly"}
                    onPick={() => setSplit("evenly")}
                    name="Equally"
                    says="The same amount behind every place"
                  />

                  <Divide
                    chosen={split === "byWorth"}
                    onPick={() => setSplit("byWorth")}
                    name="By prize size"
                    says="Keeps the table's shape, so first stays ahead"
                  />
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <label
                htmlFor="sponsor-amount"
                className="label text-[0.8125rem] text-ink-faint"
              >
                How much
              </label>

              {/* The floor is the placeholder rather than a line under the box.
                  It is the smallest thing that can be typed here, so the field
                  showing it says as much as a sentence did, and it stops saying
                  it the moment somebody types. The refusal still spells it out
                  if they go under. */}
              <input
                id="sponsor-amount"
                inputMode="decimal"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={units(floor)}
                className="tabular w-full border border-rule bg-paper px-4 py-3 text-[1.125rem] text-ink outline-none focus:border-ink"
              />
            </div>

            {/* Who is backing it, which the chain cannot hold and the page has
                to be told. The three of them are hashed together into the note
                the contract stores against this contribution, so what ends up
                on the wall is what was signed for rather than whatever a row
                said later. The name is asked for; the other two are offered. */}
            <Field
              id="sponsor-name"
              label="Company or name"
              value={name}
              onChange={setName}
              placeholder="Who should the wall credit"
            />

            <Field
              id="sponsor-site"
              label="Website"
              value={site}
              onChange={setSite}
              placeholder="https://"
            />

            <div className="grid gap-2">
              <label htmlFor="sponsor-about" className="label text-[0.8125rem] text-ink-faint">
                About
              </label>

              <textarea
                id="sponsor-about"
                rows={3}
                value={about}
                onChange={(event) => setAbout(event.target.value)}
                placeholder="One line about who you are"
                className="w-full resize-y border border-rule bg-paper px-4 py-3 text-[0.9375rem] leading-relaxed text-ink outline-none focus:border-ink"
              />
            </div>

            {/* The bargain, whole. Three lines rather than one total, because the
                middle one is the only place anybody learns what we take, and a
                fee folded into a sum is a fee nobody read. */}
            <dl className="grid gap-2 border-t border-rule pt-4 text-[0.9375rem]">
              <Line name={spreading ? "Goes to the winners" : "Goes to the winner"}>
                {units(amount)} {code}
              </Line>

              <Line name={`Platform fee (${(feeBps(rules) / 100).toFixed(1)}%)`}>
                {units(fee)} {code}
              </Line>

              <Line name="You pay" strong>
                {units(amount + fee)} {code}
              </Line>
            </dl>

            <Trouble
              address={address}
              belowFloor={belowFloor}
              floor={units(floor)}
              short={short}
              held={held}
              code={code}
              named={said.name.length > 0}
              step={step}
            />

            <div className="flex flex-wrap items-center gap-3">
              {needsTrustline && asset?.kind === "issued" ? (
                <Button disabled={accepting} onClick={() => void acceptAsset()}>
                  {accepting ? "Signing" : `Accept ${asset.code} first`}
                </Button>
              ) : (
                <Button disabled={!ready || step.at === "signing"} onClick={begin}>
                  {step.at === "signing" ? "Signing" : "Add to the prize"}
                </Button>
              )}

              <Button intent="quiet" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/**
 * One of the two ways to divide a contribution over a table.
 *
 * The second line is the whole reason this control can be offered at all.
 * "Equally" and "by prize size" are not self explanatory to somebody who has
 * never thought about it, and a choice nobody understands is a choice nobody
 * should be made to make.
 */
function Divide({
  chosen,
  onPick,
  name,
  says,
}: {
  chosen: boolean;
  onPick: () => void;
  name: string;
  says: string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex-1 basis-[13rem] border px-4 py-2.5 text-left transition-colors ${
        chosen ? "border-ink bg-paper-sunk" : "border-rule hover:border-ink-faint"
      }`}
    >
      <span className="block text-[0.9375rem] text-ink">{name}</span>
      <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-faint">{says}</span>
    </button>
  );
}

/** One labelled line, because three of them in a row is three of the same thing. */
function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="label text-[0.8125rem] text-ink-faint">
        {label}
      </label>

      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full border border-rule bg-paper px-4 py-3 text-[0.9375rem] text-ink outline-none focus:border-ink"
      />
    </div>
  );
}

/** Whatever is stopping this from going through, said once. */
function Trouble({
  address,
  belowFloor,
  floor,
  short,
  held,
  code,
  named,
  step,
}: {
  address: string | null;
  belowFloor: boolean;
  floor: string;
  short: boolean;
  held: string | null;
  code: string;
  /** Whether the sponsor has given a name to be credited under. */
  named: boolean;
  step: Step;
}) {
  const said =
    step.at === "failed"
      ? step.why
      : address === null
        ? "Connect a wallet to add to this prize."
        : belowFloor
          ? `The rules set the smallest contribution at ${floor} ${code}.`
          : short
            ? `This wallet holds ${held ?? "0"} ${code}, which does not cover the contribution and the fee.`
            : !named
              ? "Say who to credit. It goes on the wall once the organizer agrees to it."
              : null;

  if (said === null) {
    return null;
  }

  return <p className="text-[0.9375rem] leading-relaxed text-broken">{said}</p>;
}

/**
 * The question a late contribution deserves to be asked.
 *
 * Borrowed in substance from what every hackathon platform has learned to say,
 * and worth saying: teams pick what to build against the prize that was on the
 * page the day they started. Money arriving afterwards reaches the winner all
 * the same, but it did not draw anybody in, and a sponsor paying for reach
 * should know which one they are buying.
 */
function Warning({
  onGoBack,
  onCarryOn,
}: {
  onGoBack: () => void;
  onCarryOn: () => void;
}) {
  return (
    <div className="grid gap-5">
      <div>
        <p className="label text-[0.8125rem] text-signal-deep dark:text-signal">Before you do</p>
        <h2 className="display mt-1 text-[1.5rem] font-bold text-ink">
          This hackathon has already started
        </h2>
      </div>

      <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
        Teams chose what to build against the prize that was on the page when
        they signed up. Your contribution still reaches whoever wins, and it
        cannot be taken back out, but it will not have brought anybody in.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onCarryOn}>Add it anyway</Button>
        <Button intent="quiet" onClick={onGoBack}>
          Go back
        </Button>
      </div>
    </div>
  );
}

/**
 * The one screen in this product that throws something in the air.
 *
 * What it is celebrating is worth being plain about: somebody has just put
 * their own money into a prize for strangers, and it cannot be taken back out.
 * Every other confirmation here is a digest and a sentence, which is right for
 * a receipt and wrong for this.
 *
 * What is left is the figure, the one thing that has not happened yet, and a
 * way to go and look. The heading said in words what the figure says in
 * numbers, and the sixty four characters under it were a transaction hash
 * printed for somebody to copy by hand — both went, and the hash came back as
 * the link it always wanted to be.
 */
function Done({
  hash,
  amount,
  code,
  onClose,
}: {
  hash: string;
  amount: string;
  code: string;
  onClose: () => void;
}) {
  return (
    <div className="grid gap-5">
      <p className="label flex items-center gap-2 text-[0.8125rem] text-verified">
        <span aria-hidden className="size-1.5 rounded-full bg-verified" />
        On the chain
      </p>

      <p className="tabular text-[2rem] font-bold leading-none text-verified">
        {amount}
        {code === "" ? "" : ` ${code}`} donated
      </p>

      <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
        Your name goes on the wall once the organizer says yes. The money is
        already there either way.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onClose}>Done</Button>

        {/* The receipt, where a receipt can actually be read. This is the one
            claim on the screen that is not ours to make, so it opens at
            somebody else's record of it rather than restating ours. */}
        <a
          href={explorerFor("tx", hash)}
          target="_blank"
          rel="noreferrer"
          className="text-[0.9375rem] font-bold text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
        >
          View the transaction ↗
        </a>
      </div>
    </div>
  );
}

function Line({
  name,
  strong,
  children,
}: {
  name: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "text-ink" : "text-ink-soft"}>{name}</dt>
      <dd className={`tabular ${strong ? "font-semibold text-ink" : "text-ink-soft"}`}>
        {children}
      </dd>
    </div>
  );
}

/**
 * The cut this event announced, read from its own frozen rules.
 *
 * The constitution carries it and the contract charges it; a constant here
 * would be a second opinion about somebody's money. Zero is a real answer and
 * the common one for community events.
 */
function feeBps(rules: Rules): number {
  return rules.platformFeeBps;
}
