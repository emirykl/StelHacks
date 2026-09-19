"use client";

import { useState } from "react";

import { Button } from "../components/primitives";
import { SpecLabel, SpecRow, SpecRows, SpecValue } from "../components/spec";
import { connect, type Connection } from "../../lib/wallet";

/**
 * Attaching an address to yourself, in two steps that are not the same step.
 *
 * Connecting tells this page an address. It proves nothing: a page can be
 * handed any string, and a wallet extension answering is not evidence about who
 * is sitting in front of it. Proving is a signature over a challenge the server
 * issued, and only that may create the `wallet_links` row every profile and
 * earnings total in the product reads.
 *
 * So this shows an address and is careful never to call it yours.
 */

export function Wallet() {
  const [wallet, setWallet] = useState<Connection | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  async function pick() {
    setAsking(true);
    setRefused(null);

    try {
      /* Null means the picker was closed, which is somebody changing their
         mind rather than anything going wrong. Whatever was already connected
         stays connected. */
      const chosen = await connect();

      if (chosen !== null) {
        setWallet(chosen);
      }
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "your wallet refused without saying why");
    } finally {
      setAsking(false);
    }
  }

  return (
    <>
      <SpecLabel index="02">Wallet</SpecLabel>

      <div className="mt-8">
        <SpecRows>
          <SpecRow index="01" label="Address" mark={wallet !== null}>
            {wallet === null ? (
              <span className="label text-ink-faint">nothing connected</span>
            ) : (
              <SpecValue>{wallet.address}</SpecValue>
            )}
          </SpecRow>

          <SpecRow index="02" label="Wallet">
            {wallet === null ? (
              <span className="label text-ink-faint">—</span>
            ) : (
              <SpecValue>{wallet.wallet}</SpecValue>
            )}
          </SpecRow>

          <SpecRow index="03" label="Proved">
            <span className="label text-ink-faint">not yet</span>
          </SpecRow>
        </SpecRows>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button onClick={() => void pick()} disabled={asking}>
          {asking
            ? "Waiting for your wallet"
            : wallet === null
              ? "Connect a wallet"
              : "Use a different one"}
        </Button>

        {/* Only when there is something to say. A line of reassurance under
            every button is the kind of text that stops being read. */}
        {refused !== null && (
          <p className="max-w-[34rem] text-[0.875rem] leading-relaxed text-broken">
            {refused}
          </p>
        )}
      </div>
    </>
  );
}
