"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "../../components/primitives";
import { SpecHeading, SpecLabel, SpecRow, SpecRows, SpecValue } from "../../components/spec";
import { useWallet } from "../../components/wallet-context";
import { arg, deploy, send, type Sent } from "../../../lib/send";
import { prizeAssetOf, runningOf, type Running } from "../../../lib/running";
import { PHASES, phaseName } from "../../../lib/phase";
import { Applications } from "./applications";

/**
 * Getting a hackathon from written to open, one legal call at a time.
 *
 * The contract allows exactly one thing at each point and refuses everything
 * else, so this offers exactly one thing. A console of buttons that mostly fail
 * would be faster to build and would teach an organizer to distrust all of
 * them.
 *
 * What is shown comes from the contract rather than from our database, for the
 * same reason the participant flow does: a button that is wrong here costs a
 * signature and a fee to find out.
 */

/** The vault wasm already uploaded to the network, from `docs/deployments.md`. */
const VAULT_WASM = "afc98888d9321be76160951ce072b52f08c7f3a6a0e29ee1ac9e3c0aa4783ffb";

export function Console({ contractId }: { contractId: string }) {
  const { wallet, known } = useWallet();
  const [running, setRunning] = useState<Running | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(Sent & { contractId?: string }) | null>(null);
  const [amount, setAmount] = useState("");

  const reread = useCallback(async () => {
    setRunning(await runningOf(contractId));
  }, [contractId]);

  useEffect(() => {
    void reread();
  }, [reread]);

  async function run(work: () => Promise<Sent & { contractId?: string }>) {
    setBusy(true);
    setResult(null);

    const outcome = await work();

    setResult(outcome.ok || !outcome.refused ? outcome : null);
    setBusy(false);

    if (outcome.ok) {
      await reread();
    }
  }

  if (!known || running === null) {
    return <p className="label text-ink-faint">Reading the contract</p>;
  }

  if (running.phase === null) {
    return (
      <p className="max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        Nothing has been created at this address yet. A hackathon starts on the
        create page, and this is where it continues afterwards.
      </p>
    );
  }

  /* Past the check above the phase is known, and saying so once here saves
     every reader below from re-establishing it. */
  const state = { ...running, phase: running.phase };

  const mine = wallet !== null && wallet.address === state.organizer;
  const funded = state.held >= state.required && state.required > BigInt(0);

  return (
    <div className="space-y-14">
      <section>
        <SpecLabel index="01">Where it stands</SpecLabel>

        <div className="mt-8">
          <SpecRows>
            <SpecRow index="01" label="Stage" mark>
              <SpecValue>{phaseName(running.phase)}</SpecValue>
            </SpecRow>

            <SpecRow index="02" label="Rules">
              <SpecValue>{running.locked ? "locked" : "still editable"}</SpecValue>
            </SpecRow>

            <SpecRow index="03" label="Vault">
              <SpecValue>{running.vault ?? "not bound yet"}</SpecValue>
            </SpecRow>

            <SpecRow index="04" label="Prize held" mark>
              <SpecValue>
                {units(running.held)} of {units(running.required)}
              </SpecValue>
            </SpecRow>
          </SpecRows>
        </div>
      </section>

      <section>
        <SpecLabel index="02">Next</SpecLabel>

        <SpecHeading className="mt-3 text-[clamp(1.25rem,2.5vw,1.75rem)]">
          {headline(state, funded)}
        </SpecHeading>

        <div className="mt-8">
          {!mine && state.phase < 2 ? (
            <p className="max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
              Only the organizer can move this on, and that is{" "}
              <span className="tabular text-[0.8125rem]">{state.organizer}</span>. Connect
              that wallet to continue.
            </p>
          ) : (
            <Next
              running={state}
              funded={funded}
              contractId={contractId}
              address={wallet?.address ?? null}
              busy={busy}
              amount={amount}
              setAmount={setAmount}
              run={run}
            />
          )}
        </div>
      </section>

      {/* Only once registration is open. Before that there is nothing to
          review, and a queue that is empty because the event has not started
          reads the same as one that is empty because nobody came. */}
      {state.phase >= 2 && state.phase <= 3 && (
        <Applications
          contractId={contractId}
          reviewer={mine ? (wallet?.address ?? null) : null}
        />
      )}

      {result !== null && (
        <p
          className={`max-w-[46rem] text-[0.875rem] leading-relaxed ${
            result.ok ? "text-verified" : "text-broken"
          }`}
        >
          {result.ok
            ? result.contractId === undefined
              ? `Done. ${result.hash}`
              : `Vault deployed at ${result.contractId}`
            : result.why}
        </p>
      )}
    </div>
  );
}

/** The single thing that can be done right now, and nothing else. */
function Next({
  running,
  funded,
  contractId,
  address,
  busy,
  amount,
  setAmount,
  run,
}: {
  running: Running & { phase: number };
  funded: boolean;
  contractId: string;
  address: string | null;
  busy: boolean;
  amount: string;
  setAmount: (next: string) => void;
  run: (work: () => Promise<Sent & { contractId?: string }>) => Promise<void>;
}) {
  if (address === null) {
    return (
      <p className="max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        Connect a wallet to continue.
      </p>
    );
  }

  /* Draft. The rules can still be edited, and locking is the door out. */
  if (running.phase === 0) {
    return (
      <div className="flex flex-wrap items-center gap-5">
        <Button
          disabled={busy}
          onClick={() => void run(() => send(contractId, "lock_rules", [], address))}
        >
          {busy ? "Signing" : "Lock the rules"}
        </Button>

        <p className="max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
          This hashes everything and freezes it. After this the rules cannot be
          edited, only the event cancelled.
        </p>
      </div>
    );
  }

  /* Funding, and the vault is the thing that does not exist yet. */
  if (running.phase === 1 && running.vault === null) {
    return (
      <div className="flex flex-wrap items-center gap-5">
        <Button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const asset = await prizeAssetOf(contractId);

              if (asset === null) {
                return { ok: false, why: "the rules do not name a prize asset", refused: false };
              }

              /*
                Three calls, in this order, because each one needs the last.

                The vault is deployed empty: its `create` is an ordinary entry
                point rather than a constructor, so passing the arguments to
                the deployment fails inside the wasm. Then it is told which
                hackathon and which token it serves. Only then can the core be
                pointed at it, and the core checks the binding from both sides,
                so a vault built for a different hackathon is refused here
                rather than discovered later.
              */
              const built = await deploy(VAULT_WASM, [], address);

              if (!built.ok || built.contractId === undefined) {
                return built;
              }

              const initialised = await send(
                built.contractId,
                "create",
                [await arg.address(contractId), await arg.address(asset)],
                address,
              );

              if (!initialised.ok) {
                return initialised;
              }

              return send(
                contractId,
                "bind_vault",
                [await arg.address(built.contractId)],
                address,
              );
            })
          }
        >
          {busy ? "Signing" : "Create and bind the vault"}
        </Button>

        <p className="max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
          Three signatures: one to put the vault on chain, one to tell it what
          it holds, one to point this hackathon at it.
        </p>
      </div>
    );
  }

  /* Funding, vault bound, and short of the prize table. */
  if (running.phase === 1 && !funded) {
    const short = running.required - running.held;

    return (
      <div className="max-w-[34rem]">
        <label className="grid gap-1.5">
          <span className="label text-ink-faint">Deposit</span>

          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
            placeholder={units(short)}
            inputMode="decimal"
            className="tabular h-10 bg-paper px-3 text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
          />
        </label>

        <Button
          className="mt-4"
          disabled={busy || amount.length === 0 || running.vault === null}
          onClick={() =>
            void run(async () =>
              send(
                running.vault!,
                "deposit",
                [await arg.address(address), await arg.i128(toStroops(amount))],
                address,
              ),
            )
          }
        >
          {busy ? "Signing" : "Deposit"}
        </Button>

        <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-soft">
          {units(short)} still to go. Anyone can top a vault up, and nobody can
          take anything out of it.
        </p>
      </div>
    );
  }

  /* Funded. Anyone may publish, which is deliberate: it stops an organizer
     sitting on a hackathon whose prize is already committed. */
  if (running.phase === 1) {
    return (
      <div className="flex flex-wrap items-center gap-5">
        <Button
          disabled={busy}
          onClick={() => void run(() => send(contractId, "publish", [], address))}
        >
          {busy ? "Signing" : "Publish"}
        </Button>

        <p className="max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
          The prize is fully in the vault, so registration can open.
        </p>
      </div>
    );
  }

  /* Running. The phase only moves when its deadline has passed, and the
     contract is the one that decides that. */
  if (running.phase < PHASES.length - 2) {
    return (
      <div className="flex flex-wrap items-center gap-5">
        <Button
          disabled={busy}
          onClick={() => void run(() => send(contractId, "advance_phase", [], address))}
        >
          {busy ? "Signing" : `Move to ${PHASES[running.phase + 1]}`}
        </Button>

        <p className="max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
          Only once this stage's deadline has passed. The contract refuses
          early, so pressing this before then costs a fee and changes nothing.
        </p>
      </div>
    );
  }

  return (
    <p className="max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
      This hackathon has come to rest. Nothing can change it now.
    </p>
  );
}

function headline(running: Running & { phase: number }, funded: boolean): string {
  if (running.phase === 0) {
    return "Lock the rules";
  }

  if (running.phase === 1) {
    return running.vault === null ? "Set up the vault" : funded ? "Publish" : "Fund the prize";
  }

  return running.phase >= PHASES.length - 2 ? "Finished" : "Move it on";
}

/**
 * Seven decimals, shown as a person would write the amount.
 *
 * The fraction is kept when there is one. Rounding to whole units printed a
 * prize of ten thousand stroops as "0", which is the one number on this page
 * that must never read as nothing when it is not.
 */
function units(amount: bigint): string {
  const scale = BigInt(10_000_000);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(7, "0").replace(/0+$/, "");

  return fraction.length === 0
    ? whole.toLocaleString("en-US")
    : `${whole.toLocaleString("en-US")}.${fraction}`;
}

function toStroops(amount: string): bigint {
  const [whole, fraction = ""] = amount.trim().split(".");

  return BigInt(`${whole || "0"}${fraction.padEnd(7, "0").slice(0, 7)}`);
}
