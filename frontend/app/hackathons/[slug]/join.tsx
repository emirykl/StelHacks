"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "../../components/primitives";
import { SpecHeading, SpecLabel } from "../../components/spec";
import { useWallet } from "../../components/wallet-context";
import { arg, send, type Sent } from "../../../lib/send";
import { metadataHash, standingOf, type Standing } from "../../../lib/participate";

/**
 * Taking part, as three steps in the order the contract enforces them.
 *
 * The contract will refuse an out of order call, so the surface refuses first:
 * only the step somebody can actually do is live, and the ones behind and ahead
 * of it say where they stand. A page full of buttons that all fail is a page
 * that teaches people the product is broken.
 *
 * Where a step stands is read from the contract rather than from our database.
 * The indexer is allowed to be a few seconds behind; a person who applied ten
 * seconds ago and is shown the apply button again will pay a fee to be told
 * they already applied.
 */

type Step = 1 | 2 | 3;

export function Join({ contractId }: { contractId: string }) {
  const { wallet, known } = useWallet();
  const [standing, setStanding] = useState<Standing | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Sent | null>(null);

  const address = wallet?.address ?? null;

  const reread = useCallback(async () => {
    if (address === null) {
      setStanding(null);
      return;
    }

    setStanding(await standingOf(contractId, address));
  }, [contractId, address]);

  useEffect(() => {
    void reread();
  }, [reread]);

  /* Open is the only phase in which any of this is allowed, and which phase
     that is comes from the contract along with everything else here. Outside
     it the contract refuses all three steps, so the section is absent rather
     than offering them. */
  if (standing !== null && standing.phase !== 2) {
    return null;
  }

  async function run(work: () => Promise<Sent>) {
    setBusy(true);
    setResult(null);

    const outcome = await work();

    /* Declining in the wallet is a decision, not a failure, and gets no
       message. Anything else does. */
    setResult(outcome.ok || !outcome.refused ? outcome : null);
    setBusy(false);

    if (outcome.ok) {
      await reread();
    }
  }

  return (
    <section className="border-t border-rule">
      <div className="mx-auto w-full max-w-[76rem] px-6 py-16">
        <SpecLabel index="02">Take part</SpecLabel>

        <SpecHeading className="mt-3">Three steps</SpecHeading>

        {!known ? null : address === null ? (
          <p className="mt-8 max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
            Connect a wallet to take part. Every step below is signed by it.
          </p>
        ) : standing === null ? (
          <p className="mt-8 label text-ink-faint">Reading the contract</p>
        ) : (
          <ol className="mt-10 border-t border-rule">
            <Row
              number={1}
              title="Apply"
              at={placeOf(standing)}
              done={standing.application === "approved"}
              waiting={
                standing.application === "pending"
                  ? "Waiting for the organizer"
                  : standing.application === "rejected"
                    ? "Refused"
                    : null
              }
            >
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => send(contractId, "apply", [await arg.address(address)], address))
                }
              >
                {busy ? "Signing" : "Apply"}
              </Button>
            </Row>

            <Row
              number={2}
              title="Team"
              at={placeOf(standing)}
              done={standing.teams.length > 0}
              waiting={standing.teams.length > 0 ? `Team ${standing.teams[0]}` : null}
            >
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () =>
                    send(contractId, "create_team", [await arg.address(address)], address),
                  )
                }
              >
                {busy ? "Signing" : "Create a team"}
              </Button>

              {/* Joining somebody else's team is deliberately absent rather
                  than broken. `add_member` needs the captain's signature and
                  the member's on one transaction, which is a flow two people
                  drive together, and half of it would be worse than none. */}
              <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-faint">
                Joining an existing team needs both you and the captain to sign
                the same transaction, and that is not built yet.
              </p>
            </Row>

            <Row
              number={3}
              title="Submit"
              at={placeOf(standing)}
              done={standing.submitted}
              waiting={standing.submitted ? "Submitted" : null}
            >
              <Submit
                contractId={contractId}
                address={address}
                team={standing.teams[0] ?? 0}
                busy={busy}
                run={run}
              />
            </Row>
          </ol>
        )}

        {result !== null && (
          <p
            className={`mt-8 max-w-[42rem] text-[0.875rem] leading-relaxed ${
              result.ok ? "text-verified" : "text-broken"
            }`}
          >
            {result.ok ? `Recorded on chain. ${result.hash}` : result.why}
          </p>
        )}
      </div>
    </section>
  );
}

/** The step somebody is on, which is the first one they have not finished. */
function placeOf(standing: Standing): Step {
  if (standing.application !== "approved") {
    return 1;
  }

  return standing.teams.length === 0 ? 2 : 3;
}

/**
 * One step, and only one of them is ever live.
 *
 * A finished step keeps its place in the list rather than disappearing, so the
 * shape of what is left to do does not change under somebody halfway through.
 */
function Row({
  number,
  title,
  at,
  done,
  waiting,
  children,
}: {
  number: Step;
  title: string;
  at: Step;
  done: boolean;
  waiting: string | null;
  children: React.ReactNode;
}) {
  const live = number === at && !done;

  return (
    <li className="grid gap-3 border-b border-rule py-7 sm:grid-cols-[3rem_10rem_1fr] sm:gap-6">
      <span className={`label ${done ? "text-verified" : live ? "text-signal-deep dark:text-signal" : "text-ink-faint"}`}>
        {done ? "done" : String(number).padStart(2, "0")}
      </span>

      <span className={`label ${live || done ? "text-ink" : "text-ink-faint"}`}>{title}</span>

      <div className={live ? "" : "text-ink-faint"}>
        {live ? children : <span className="label">{waiting ?? "not yet"}</span>}
      </div>
    </li>
  );
}

/**
 * The submission, which is a link and a hash of what was said about it.
 *
 * The contract stores neither the project nor the description: it stores the
 * digest of these fields, so the text can live anywhere and still be shown to
 * be the text that was pinned. Hashing happens here, in the browser, from
 * exactly what was typed.
 */
function Submit({
  contractId,
  address,
  team,
  busy,
  run,
}: {
  contractId: string;
  address: string;
  team: number;
  busy: boolean;
  run: (work: () => Promise<Sent>) => Promise<void>;
}) {
  const [track, setTrack] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const ready = track.length > 0 && name.length > 0 && url.length > 0;

  return (
    <div className="max-w-[34rem]">
      <div className="grid gap-3">
        <Field label="Track" value={track} onChange={setTrack} placeholder="payments" />
        <Field label="Project" value={name} onChange={setName} placeholder="What it is called" />
        <Field label="Link" value={url} onChange={setUrl} placeholder="https://" />
      </div>

      <Button
        className="mt-4"
        disabled={busy || !ready}
        onClick={() =>
          void run(async () =>
            send(
              contractId,
              "submit_project",
              [
                await arg.address(address),
                await arg.u32(team),
                await arg.symbol(track),
                await arg.bytes32(await metadataHash({ name, url, track })),
                await arg.text(url),
              ],
              address,
            ),
          )
        }
      >
        {busy ? "Signing" : "Submit"}
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="label text-ink-faint">{label}</span>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 bg-paper px-3 text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
      />
    </label>
  );
}
