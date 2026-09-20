"use client";

import { useEffect, useState } from "react";

import { Button } from "../../components/primitives";
import { ImagePicker } from "../../create/image-picker";
import { TagField } from "../../components/tag-field";
import { challengeFor } from "../../../lib/organizer";
import { proveAddressHex } from "../../../lib/wallet";
import { useWallet } from "../../components/wallet-context";

/**
 * What the hackathon looks like, written after the rules are frozen.
 *
 * None of this decides an outcome, so none of it is in the constitution and
 * none of it is hashed: the name, the artwork and the description live beside
 * the contract and can be corrected. That is the whole reason they are kept
 * apart from the rules, and until now the only chance to write them was the
 * half second after creation. A hackathon whose name failed to save then was
 * nameless for good, invisible in the listing, and titled "Your hackathon"
 * here.
 *
 * Signed with the organizer's key even though it touches nothing on chain. The
 * handler reads the organizer off the contract and checks the signature against
 * that, so a session alone cannot rewrite somebody else's event.
 */

interface Written {
  name: string;
  tagline: string;
  location: string;
  tags: string;
  logo: string;
  banner: string;
}

const blank: Written = { name: "", tagline: "", location: "", tags: "", logo: "", banner: "" };

export function Details({
  contractId,
  userId,
  mine,
}: {
  contractId: string;
  /** Whose folder artwork lands in. Absent when nobody is signed in. */
  userId: string | null;
  /** Whether the connected wallet is the one the contract calls the organizer. */
  mine: boolean;
}) {
  const { wallet } = useWallet();
  const [written, setWritten] = useState<Written | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void fetch(`/api/hackathon?contract=${contractId}`)
      .then((answer) => (answer.ok ? answer.json() : null))
      .then((found: Record<string, unknown> | null) => {
        if (!alive) {
          return;
        }

        /* Nothing found is a hackathon whose description never saved rather
           than an error. The form opens empty and writing it is the fix. */
        setWritten(
          found === null
            ? blank
            : {
                name: String(found["name"] ?? ""),
                tagline: String(found["tagline"] ?? ""),
                location: String(found["location"] ?? ""),
                tags: Array.isArray(found["tags"]) ? (found["tags"] as string[]).join(", ") : "",
                logo: String(found["logo_url"] ?? ""),
                banner: String(found["banner_url"] ?? ""),
              },
        );
      })
      .catch(() => alive && setWritten(blank));

    return () => {
      alive = false;
    };
  }, [contractId]);

  if (written === null) {
    return <p className="label text-ink-faint">Reading what is written</p>;
  }

  if (!mine || wallet === null) {
    return (
      <p className="max-w-[40rem] text-[1rem] leading-relaxed text-ink-soft">
        Only the organizer's wallet can change how this hackathon is presented.
      </p>
    );
  }

  async function save() {
    if (wallet === null || written === null) {
      return;
    }

    setBusy(true);
    setSaid(null);

    const account = await accountId();

    if (account === null) {
      setSaid("Sign in again before saving. The account is half of what the handler checks.");
      setBusy(false);

      return;
    }

    /*
      Tried without a signature first.

      The handler takes a linked wallet as proof, because a link is a signature
      it already checked and kept. Somebody who has linked theirs saves a
      tagline without their extension opening at all; somebody who has not signs
      once, here, after the refusal.
    */
    if (await hand(null)) {
      setBusy(false);
      setSaid("Saved.");

      return;
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const signature = await proveAddressHex(
      wallet.address,
      challengeFor(contractId, account, issuedAt),
    ).catch(() => null);

    if (signature === null) {
      setSaid("The wallet did not sign it.");
      setBusy(false);

      return;
    }

    const saved = await hand({ issuedAt, signature });

    setBusy(false);
    setSaid(saved ? "Saved." : "It did not save. The rules on chain are untouched either way.");
  }

  /** One attempt at the handler, with whatever proof we are offering it. */
  async function hand(
    proof: { issuedAt: number; signature: string } | null,
  ): Promise<boolean> {
    if (written === null) {
      return false;
    }

    const answer = await fetch("/api/hackathon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contract: contractId,
        ...(proof ?? {}),
        name: written.name.trim(),
        tagline: written.tagline.trim(),
        location: written.location.trim(),
        logo_url: written.logo.trim(),
        banner_url: written.banner.trim(),
        /* The placeholder writes them with a hash because that is how everyone
           writes a tag, so the hash comes off here. Stored with it, the same tag
           typed both ways would be two tags in the listing's filter. */
        tags: written.tags
          .split(",")
          .map((tag) => tag.trim().replace(/^#+/, "").trim().toLowerCase())
          .filter((tag) => tag.length > 0)
          .slice(0, 8),
      }),
    }).catch(() => null);

    return answer !== null && answer.ok;
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[1.25rem] bg-paper p-6 ring-1 ring-rule sm:p-8">
        <h2 className="text-[1.25rem] font-semibold text-ink">How it is presented</h2>

        <p className="mt-2 max-w-[40rem] text-[0.9375rem] leading-relaxed text-ink-soft">
          Filled in from the create form, and here so it can be corrected. None
          of it is frozen: it is not in the rules and it decides nothing.
        </p>

        <div className="mt-7 grid gap-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              label="Hackathon name"
              value={written.name}
              onChange={(name) => setWritten({ ...written, name })}
              placeholder="Stellar Türkiye"
            />

            <Field
              label="Location"
              value={written.location}
              onChange={(location) => setWritten({ ...written, location })}
              placeholder="İstanbul, or Online"
            />
          </div>

          <Field
            label="Short description"
            value={written.tagline}
            onChange={(tagline) => setWritten({ ...written, tagline })}
            placeholder="What it does, and who it is for"
            note="Shown under the name on the listing."
          />

          <TagField
            value={written.tags}
            onChange={(tags) => setWritten({ ...written, tags })}
          />

          {userId === null ? (
            <p className="text-[0.9375rem] text-ink-soft">
              Sign in to upload artwork. The name and the rest save without it.
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              <ImagePicker
                label="Logo"
                shape="logo"
                userId={userId}
                value={written.logo}
                onChange={(logo) => setWritten({ ...written, logo })}
              />

              <ImagePicker
                label="Banner"
                shape="banner"
                userId={userId}
                value={written.banner}
                onChange={(banner) => setWritten({ ...written, banner })}
              />
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-5">
        <Button disabled={busy || written.name.trim().length === 0} onClick={() => void save()}>
          {busy ? "Signing" : "Save"}
        </Button>

        <p className="max-w-[34rem] text-[0.9375rem] leading-relaxed text-ink-soft">
          {said ?? "One signature, and it proves the key rather than moving anything on chain."}
        </p>
      </div>
    </div>
  );
}

/** One field, drawn the way the create form draws its own. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  note,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  note?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="label text-[0.875rem] text-ink">{label}</span>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-[0.625rem] bg-paper px-4 text-[1.0625rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-2 focus:ring-ink"
      />

      {note !== undefined && <span className="text-[0.875rem] text-ink-faint">{note}</span>}
    </label>
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
