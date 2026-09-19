"use client";

import { useMemo, useState } from "react";

import { Button } from "../components/primitives";
import { SpecHeading, SpecLabel } from "../components/spec";
import { useWallet } from "../components/wallet-context";
import { send, type Sent } from "../../lib/send";
import {
  WEIGHT_TOTAL_BPS,
  createArgs,
  toSmallestUnit,
  totalPrize,
  type Draft,
  type Track,
} from "../../lib/constitution";

/**
 * Writing the rules, before they are frozen.
 *
 * Everything on this form ends up inside one hashed object. After the lock it
 * cannot be edited, only cancelled, so the form's job is not to be quick: it is
 * to make the two things that decide an outcome impossible to get wrong without
 * noticing. Those are the prize table, which the vault has to match exactly,
 * and the rubric weights, which have to add up.
 *
 * Both are shown as running totals rather than validated on submit. A number
 * that goes wrong should look wrong while it is being typed.
 */

const CREATE_WASM_HINT = "the hackathon contract you deployed";

export function Wizard() {
  const { wallet, known } = useWallet();

  const [contractId, setContractId] = useState("");
  const [asset, setAsset] = useState("");
  const [tracks, setTracks] = useState<Track[]>([blankTrack()]);
  const [judges, setJudges] = useState<string[]>([""]);
  const [days, setDays] = useState({ registration: 7, building: 14, screening: 3, judging: 7 });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Sent | null>(null);

  const total = useMemo(() => totalPrize(tracks), [tracks]);

  const ready =
    contractId.length === 56 &&
    asset.length === 56 &&
    wallet !== null &&
    tracks.every(complete) &&
    judges.some((judge) => judge.length === 56);

  async function create() {
    if (wallet === null) {
      return;
    }

    setBusy(true);
    setResult(null);

    const now = Math.floor(Date.now() / 1000);
    const day = 86_400;
    const registrationCloses = now + days.registration * day;
    const submissionCloses = registrationCloses + days.building * day;
    const screeningCloses = submissionCloses + days.screening * day;

    const draft: Draft = {
      metadataHash: new Uint8Array(32),
      prizeAsset: asset,
      tracks,
      judges: judges.filter((judge) => judge.length === 56).map((address) => ({ address, tracks: [] })),
      judgeQuorum: 1,
      schedule: {
        registrationOpensAt: now,
        registrationClosesAt: registrationCloses,
        submissionOpensAt: now,
        submissionClosesAt: submissionCloses,
        screeningClosesAt: screeningCloses,
        judgingClosesAt: screeningCloses + days.judging * day,
      },
      /* One person, one project. The contract can allow more and says so in the
         constitution either way, but the default is the rule most events mean
         and the one somebody would be surprised to find switched off. */
      multiTeamAllowed: false,
      maxTeamSize: 5,
    };

    /* The organizer is the connected wallet, not the signed in account. The
       contract knows nothing about Google; what it records as the organizer is
       the address that will later lock the rules and move the phase. */
    const args = await createArgs(wallet.address, draft);

    setResult(
      await send(contractId, "create", args.map((value) => ({ value })), wallet.address),
    );
    setBusy(false);
  }

  if (!known) {
    return <p className="label text-ink-faint">Checking your wallet</p>;
  }

  if (wallet === null) {
    return (
      <p className="max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        Connect a wallet first. The address you connect is the one the contract
        will record as the organizer, and it is the only address that can lock
        these rules or move the event on afterwards.
      </p>
    );
  }

  return (
    <div className="space-y-16">
      <Section index="01" title="Where it lives">
        <Grid>
          <Field
            label="Hackathon contract"
            value={contractId}
            onChange={setContractId}
            placeholder="C…"
            note={CREATE_WASM_HINT}
            mono
          />

          <Field
            label="Prize asset"
            value={asset}
            onChange={setAsset}
            placeholder="C…"
            note="The token the prize is paid in"
            mono
          />
        </Grid>
      </Section>

      <Section index="02" title="Tracks">
        <div className="space-y-10">
          {tracks.map((track, index) => (
            <TrackForm
              key={index}
              track={track}
              index={index}
              removable={tracks.length > 1}
              onChange={(next) => setTracks(tracks.map((t, i) => (i === index ? next : t)))}
              onRemove={() => setTracks(tracks.filter((_, i) => i !== index))}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setTracks([...tracks, blankTrack()])}
          className="label mt-8 flex h-10 items-center gap-2 px-4 text-ink ring-1 ring-inset ring-rule transition-colors duration-150 ease-settle hover:bg-paper-sunk"
        >
          <span aria-hidden className="text-[1rem] leading-none">+</span>
          Add a track
        </button>
      </Section>

      <Section index="03" title="Judges">
        <div className="max-w-[40rem] space-y-3">
          {judges.map((judge, index) => (
            <div key={index} className="flex items-end gap-3">
              <div className="flex-1">
                <Field
                  label={`Judge ${String(index + 1).padStart(2, "0")}`}
                  value={judge}
                  onChange={(next) => setJudges(judges.map((j, i) => (i === index ? next : j)))}
                  placeholder="G…"
                  mono
                />
              </div>

              {judges.length > 1 && (
                <Remove onClick={() => setJudges(judges.filter((_, i) => i !== index))} />
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setJudges([...judges, ""])}
          className="label mt-6 flex h-10 items-center gap-2 px-4 text-ink ring-1 ring-inset ring-rule transition-colors duration-150 ease-settle hover:bg-paper-sunk"
        >
          <span aria-hidden className="text-[1rem] leading-none">+</span>
          Add a judge
        </button>
      </Section>

      <Section index="04" title="Schedule">
        <Grid>
          <Days label="Registration" value={days.registration} onChange={(v) => setDays({ ...days, registration: v })} unit="days" />
          <Days label="Building" value={days.building} onChange={(v) => setDays({ ...days, building: v })} unit="days" />
          <Days label="Screening" value={days.screening} onChange={(v) => setDays({ ...days, screening: v })} unit="days" />
          <Days label="Judging" value={days.judging} onChange={(v) => setDays({ ...days, judging: v })} unit="days" />
        </Grid>
      </Section>

      {/* The number the vault will have to match exactly before registration can
          open. Kept in view rather than computed at the end, because it is the
          one figure on this page somebody is committing real money to. */}
      <div className="hatch border-y border-rule">
        <div className="flex flex-wrap items-baseline justify-between gap-4 px-6 py-8">
          <SpecLabel index="05">Total prize</SpecLabel>

          <p className="tabular text-[clamp(1.5rem,4vw,2.5rem)] text-ink">
            {format(total)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <Button disabled={!ready || busy} onClick={() => void create()}>
          {busy ? "Signing" : "Create in draft"}
        </Button>

        <p className="max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
          Nothing is frozen yet. This writes the rules as a draft you can still
          edit; locking them is a separate step.
        </p>
      </div>

      {result !== null && (
        <p
          className={`max-w-[46rem] text-[0.875rem] leading-relaxed ${
            result.ok ? "text-verified" : "text-broken"
          }`}
        >
          {result.ok ? `Created. ${result.hash}` : result.why}
        </p>
      )}
    </div>
  );
}

function TrackForm({
  track,
  index,
  removable,
  onChange,
  onRemove,
}: {
  track: Track;
  index: number;
  removable: boolean;
  onChange: (next: Track) => void;
  onRemove: () => void;
}) {
  const weight = track.criteria.reduce((sum, c) => sum + c.weightBps, 0);
  const balanced = weight === WEIGHT_TOTAL_BPS;

  return (
    <div className="border-l-2 border-rule pl-6">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1 max-w-[24rem]">
          <Field
            label={`Track ${String(index + 1).padStart(2, "0")}`}
            value={track.id}
            onChange={(id) => onChange({ ...track, id: id.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
            placeholder="payments"
            note="Lowercase, no spaces. The contract stores it as written."
            mono
          />
        </div>

        {removable && <Remove onClick={onRemove} />}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div>
          <p className="label text-ink-faint">Prizes</p>

          <div className="mt-3 space-y-2">
            {track.prizes.map((prize, at) => (
              <div key={prize.rank} className="flex items-center gap-3">
                <span className="label w-12 text-ink-faint">{ordinal(prize.rank)}</span>

                <input
                  value={prize.amount}
                  onChange={(event) =>
                    onChange({
                      ...track,
                      prizes: track.prizes.map((p, i) =>
                        i === at ? { ...p, amount: event.target.value.replace(/[^0-9.]/g, "") } : p,
                      ),
                    })
                  }
                  inputMode="decimal"
                  placeholder="0"
                  className="tabular h-10 flex-1 bg-paper px-3 text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
                />

                {track.prizes.length > 1 && (
                  <Remove
                    onClick={() =>
                      onChange({
                        ...track,
                        prizes: track.prizes
                          .filter((_, i) => i !== at)
                          .map((p, i) => ({ ...p, rank: i + 1 })),
                      })
                    }
                  />
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              onChange({
                ...track,
                prizes: [...track.prizes, { rank: track.prizes.length + 1, amount: "" }],
              })
            }
            className="label mt-3 text-ink-soft transition-colors duration-150 ease-settle hover:text-ink"
          >
            + add a place
          </button>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <p className="label text-ink-faint">Rubric</p>

            {/* The weights have to add up exactly or the contract refuses the
                whole constitution. Saying so as it happens is the difference
                between fixing one number and rereading a rejected form. */}
            <p className={`label ${balanced ? "text-verified" : "text-ink-faint"}`}>
              {(weight / 100).toFixed(0)}%
            </p>
          </div>

          <div className="mt-3 space-y-2">
            {track.criteria.map((criterion, at) => (
              <div key={at} className="flex items-center gap-3">
                <input
                  value={criterion.id}
                  onChange={(event) =>
                    onChange({
                      ...track,
                      criteria: track.criteria.map((c, i) =>
                        i === at
                          ? { ...c, id: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }
                          : c,
                      ),
                    })
                  }
                  placeholder="impact"
                  className="h-10 flex-1 bg-paper px-3 text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
                />

                <input
                  value={criterion.weightBps === 0 ? "" : String(criterion.weightBps / 100)}
                  onChange={(event) =>
                    onChange({
                      ...track,
                      criteria: track.criteria.map((c, i) =>
                        i === at
                          ? { ...c, weightBps: Math.round(Number(event.target.value || 0) * 100) }
                          : c,
                      ),
                    })
                  }
                  inputMode="numeric"
                  placeholder="0"
                  className="tabular h-10 w-16 bg-paper px-3 text-center text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
                />

                {track.criteria.length > 1 && (
                  <Remove
                    onClick={() =>
                      onChange({ ...track, criteria: track.criteria.filter((_, i) => i !== at) })
                    }
                  />
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              onChange({ ...track, criteria: [...track.criteria, { id: "", weightBps: 0 }] })
            }
            className="label mt-3 text-ink-soft transition-colors duration-150 ease-settle hover:text-ink"
          >
            + add a criterion
          </button>

          {/* A hairline that fills as the weights approach a hundred. It is the
              only moving thing on the page and it moves for the one number that
              silently invalidates everything else. */}
          <div className="mt-4 h-px w-full bg-rule">
            <div
              className={`h-px transition-[width,background-color] duration-300 ease-settle ${
                balanced ? "bg-verified" : "bg-ink-faint"
              }`}
              style={{ width: `${Math.min(100, weight / 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <SpecLabel index={index}>{title}</SpecLabel>

      <SpecHeading className="mt-3 text-[clamp(1.25rem,2.5vw,1.75rem)]">{title}</SpecHeading>

      <div className="mt-8">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid max-w-[46rem] gap-5 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  note,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  note?: string;
  mono?: boolean;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="label text-ink-faint">{label}</span>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value.trim())}
        placeholder={placeholder}
        className={`h-10 bg-paper px-3 text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink ${
          mono ? "tabular text-[0.8125rem]" : ""
        }`}
      />

      {note !== undefined && <span className="text-[0.75rem] text-ink-faint">{note}</span>}
    </label>
  );
}

function Days({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  unit: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="label text-ink-faint">{label}</span>

      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => onChange(Math.max(1, Number(event.target.value || 1)))}
          inputMode="numeric"
          className="tabular h-10 w-20 bg-paper px-3 text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
        />

        <span className="label text-ink-faint">{unit}</span>
      </div>
    </label>
  );
}

function Remove({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove"
      className="grid size-10 shrink-0 place-items-center text-ink-faint transition-colors duration-150 ease-settle hover:text-broken"
    >
      <span aria-hidden className="text-[1.125rem] leading-none">×</span>
    </button>
  );
}

function blankTrack(): Track {
  return {
    id: "",
    criteria: [{ id: "", weightBps: 0 }],
    prizes: [{ rank: 1, amount: "" }],
    noAwardAllowed: false,
  };
}

function complete(track: Track): boolean {
  return (
    track.id.length > 0 &&
    track.prizes.every((prize) => toSmallestUnit(prize.amount) > BigInt(0)) &&
    track.criteria.every((criterion) => criterion.id.length > 0) &&
    track.criteria.reduce((sum, c) => sum + c.weightBps, 0) === WEIGHT_TOTAL_BPS
  );
}

function ordinal(rank: number): string {
  return ["1st", "2nd", "3rd"][rank - 1] ?? `${rank}th`;
}

/** The prize table as a person reads it, not as the ledger stores it. */
function format(amount: bigint): string {
  const whole = amount / BigInt(10_000_000);

  return whole.toLocaleString("en-US");
}
