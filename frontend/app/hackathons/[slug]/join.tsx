"use client";

import { useState } from "react";

import { Button } from "../../components/primitives";
import { arg, send, type Sent } from "../../../lib/send";
import { metadataHash } from "../../../lib/participate";

/**
 * The submission, which is a link and a hash of what was said about it.
 *
 * The contract stores neither the project nor the description: it stores the
 * digest of these fields, so the text can live anywhere and still be shown to
 * be the text that was pinned. Hashing happens here, in the browser, from
 * exactly what was typed.
 */
export function Submit({
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
