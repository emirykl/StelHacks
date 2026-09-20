"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "../components/primitives";
import { useWallet } from "../components/wallet-context";
import { browserClient } from "../../lib/supabase/client";
import { proveAddressHex } from "../../lib/wallet";

/**
 * Proving that the connected wallet is this account's.
 *
 * Connecting and proving are different things and the product only ever did the
 * first. An address in the header says a browser extension answered; it says
 * nothing about who is holding the key. `wallet_links` is the one join between
 * the two halves, every surface that shows a name reads it, and until now
 * nothing wrote it — so every hacker in every list said "no account attached"
 * while sitting next to their own profile.
 *
 * The proof is a signature over a nonce the server issued. A signature over
 * anything the browser chose would show only that somebody can sign their own
 * words.
 */

type Standing = "reading" | "linked" | "unlinked";

export function WalletLink() {
  const { wallet, known } = useWallet();
  const [standing, setStanding] = useState<Standing>("reading");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const address = wallet?.address ?? null;

  const reread = useCallback(async () => {
    const db = browserClient();

    if (db === null || address === null) {
      setStanding("unlinked");

      return;
    }

    const { data } = await db
      .from("wallet_links")
      .select("address")
      .eq("address", address)
      .maybeSingle();

    setStanding(data === null ? "unlinked" : "linked");
  }, [address]);

  useEffect(() => {
    void reread();
  }, [reread]);

  async function link() {
    if (address === null) {
      return;
    }

    setBusy(true);
    setFailed(null);

    try {
      const asked = await fetch(`/api/wallet?address=${address}`);
      const issued = (await asked.json()) as { message?: string; error?: string };

      if (!asked.ok || issued.message === undefined) {
        setFailed(issued.error ?? "could not ask for a challenge");

        return;
      }

      const signature = await proveAddressHex(address, issued.message);

      const answered = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });

      if (!answered.ok) {
        const said = (await answered.json()) as { error?: string };
        setFailed(said.error ?? "that did not check out");

        return;
      }

      await reread();
    } catch (thrown) {
      setFailed(thrown instanceof Error ? thrown.message : "your wallet refused");
    } finally {
      setBusy(false);
    }
  }

  if (!known || address === null || standing === "reading") {
    return null;
  }

  if (standing === "linked") {
    return (
      <p className="flex items-center gap-2 text-[0.9375rem] text-verified">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-verified" />
        This wallet is yours, and everybody can see it.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="max-w-[38rem] text-[1rem] leading-relaxed text-ink-soft">
        Your wallet is connected but not yet proved to be yours. Until it is,
        hackathons show your address rather than your name.
      </p>

      <div>
        <Button size="sm" disabled={busy} onClick={() => void link()}>
          {busy ? "Signing" : "Prove this wallet is mine"}
        </Button>
      </div>

      {failed !== null && <p className="text-[0.875rem] text-broken">{failed}</p>}
    </div>
  );
}
