"use client";

import { useState } from "react";

import { Button } from "./primitives";
import { Modal } from "./modal";
import { useWallet } from "./wallet-context";
import { toSmallestUnit } from "../../lib/constitution";
import { units } from "../../lib/money";
import { feeOn, proposeTrack } from "../../lib/sponsor";
import type { Rules } from "../../lib/rules";
import { symbolOf } from "../../lib/words";

/**
 * Asking for a category of your own, and paying for it up front.
 *
 * The money goes in with the request rather than after the answer, which is
 * what makes the organizer's side a single decision: they are never accepting a
 * category that might turn out to have nothing behind it. A refusal sends all
 * of it back in the same call that refuses.
 *
 * What a sponsor is not buying is worth saying on the panel, because it is the
 * question they will ask next. The category is scored against the rubric the
 * rules froze and by the judges the rules named. Bringing a judge is not on
 * offer at any price, and a page that left that to be discovered later would be
 * selling something it cannot deliver.
 */

type Step =
  | { at: "writing" }
  | { at: "signing" }
  | { at: "done" }
  | { at: "failed"; why: string };

export function ProposeTrackPanel({
  open,
  onClose,
  contractId,
  rules,
  code,
}: {
  open: boolean;
  onClose: () => void;
  contractId: string;
  rules: Rules;
  code: string;
}) {
  const { wallet } = useWallet();
  const address = wallet?.address ?? null;

  const [name, setName] = useState("");
  const [typed, setTyped] = useState("");
  const [step, setStep] = useState<Step>({ at: "writing" });

  const amount = typed.trim() === "" ? BigInt(0) : toSmallestUnit(typed);
  const fee = feeOn(amount, rules.platformFeeBps);
  const floor = rules.sponsorship.minBounty;

  /* The contract's own limit on an identifier, and it is not cosmetic: a
     Soroban symbol is at most thirty two characters and only letters, digits
     and underscores. A name outside that is refused at encoding, which arrives
     as a failure with nothing useful in it.

     Through `symbolOf` rather than a regex of its own, because the organizer's
     wizard reduces a track name the same way and two nearly identical rules
     are how a name accepted in one form is refused in the other. */
  const id = symbolOf(name);
  const named = id.length > 0;
  const taken = rules.tracks.some((track) => track.id === id);
  const belowFloor = amount > BigInt(0) && amount < floor;

  const ready = address !== null && named && !taken && amount > BigInt(0) && !belowFloor;

  async function ask() {
    if (address === null) {
      return;
    }

    setStep({ at: "signing" });

    const outcome = await proposeTrack(contractId, address, id, amount, new Uint8Array(32));

    setStep(
      outcome.ok
        ? { at: "done" }
        : { at: "failed", why: outcome.why ?? "the wallet refused it" },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Ask for a category">
      {step.at === "done" ? (
        <div className="grid gap-5">
          <div>
            <p className="label flex items-center gap-2 text-[0.8125rem] text-verified">
              <span aria-hidden className="size-1.5 rounded-full bg-verified" />
              On the chain
            </p>

            <h2 className="display mt-1 text-[1.5rem] font-bold text-ink">
              The organizer has your request
            </h2>
          </div>

          <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
            The bounty is in the vault and the category is waiting on their
            answer. If they say no, every unit of it comes straight back to this
            wallet, the platform fee included.
          </p>

          <div>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6">
          <div>
            <h2 className="display text-[1.5rem] font-bold text-ink">Ask for a category</h2>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
              Teams can enter it like any other, and the winner is paid out of
              the same vault. It is scored against this hackathon&rsquo;s own
              rubric by this hackathon&rsquo;s own judges — you are putting up a
              prize, not picking who wins it.
            </p>
          </div>

          <div className="grid gap-2">
            <label htmlFor="track-name" className="label text-[0.8125rem] text-ink-faint">
              What to call it
            </label>

            <input
              id="track-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="best use of payments"
              className="w-full border border-rule bg-paper px-4 py-3 text-[1.0625rem] text-ink outline-none focus:border-ink"
            />

            {named && (
              <p className="tabular text-[0.8125rem] text-ink-faint">
                The chain will call it <span className="text-ink">{id}</span>.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <label htmlFor="track-bounty" className="label text-[0.8125rem] text-ink-faint">
              What it pays
            </label>

            <input
              id="track-bounty"
              inputMode="decimal"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={units(floor)}
              className="tabular w-full border border-rule bg-paper px-4 py-3 text-[1.125rem] text-ink outline-none focus:border-ink"
            />

            <p className="text-[0.8125rem] text-ink-faint">
              One winner takes it. The rules set the smallest bounty at{" "}
              {units(floor)} {code}.
            </p>
          </div>

          <dl className="grid gap-2 border-t border-rule pt-4 text-[0.9375rem]">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">Goes to the winner</dt>
              <dd className="tabular text-ink-soft">
                {units(amount)} {code}
              </dd>
            </div>

            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">
                Platform fee ({(rules.platformFeeBps / 100).toFixed(1)}%)
              </dt>
              <dd className="tabular text-ink-soft">
                {units(fee)} {code}
              </dd>
            </div>

            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink">You pay now</dt>
              <dd className="tabular font-semibold text-ink">
                {units(amount + fee)} {code}
              </dd>
            </div>
          </dl>

          <Trouble
            address={address}
            taken={taken}
            belowFloor={belowFloor}
            floor={`${units(floor)} ${code}`}
            step={step}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!ready || step.at === "signing"} onClick={() => void ask()}>
              {step.at === "signing" ? "Signing" : "Put it forward"}
            </Button>

            <Button intent="quiet" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Trouble({
  address,
  taken,
  belowFloor,
  floor,
  step,
}: {
  address: string | null;
  taken: boolean;
  belowFloor: boolean;
  floor: string;
  step: Step;
}) {
  const said =
    step.at === "failed"
      ? step.why
      : address === null
        ? "Connect a wallet to put a category forward."
        : taken
          ? "This hackathon already has a category by that name."
          : belowFloor
            ? `The rules set the smallest bounty at ${floor}.`
            : null;

  if (said === null) {
    return null;
  }

  return <p className="text-[0.9375rem] leading-relaxed text-broken">{said}</p>;
}
