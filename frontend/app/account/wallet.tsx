"use client";

import { useState } from "react";

import { Button } from "../components/primitives";
import { SpecLabel, SpecRow, SpecRows, SpecValue } from "../components/spec";
import { useWallet } from "../components/wallet-context";

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
 *
 * There is no button here for swapping wallets. Disconnecting lives in the
 * header badge, beside the address it undoes, and once disconnected this
 * section offers to connect again on its own.
 */

export function Wallet() {
  const { wallet, known, connect } = useWallet();
  const [refused, setRefused] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  async function pick() {
    setAsking(true);
    setRefused(null);

    try {
      await connect();
    } catch (error) {
      setRefused(
        error instanceof Error ? error.message : "your wallet refused without saying why",
      );
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
              <span className="label text-ink-faint">
                {known ? "nothing connected" : "checking"}
              </span>
            ) : (
              <SpecValue>{wallet.address}</SpecValue>
            )}
          </SpecRow>

          <SpecRow index="02" label="Proved">
            <span className="label text-ink-faint">not yet</span>
          </SpecRow>
        </SpecRows>
      </div>

      {/* Only when there is something to do. Once a wallet is connected the
          next step is proving it, and a second connect button here would
          compete with the disconnect that already lives in the header. */}
      {wallet === null && (
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button onClick={() => void pick()} disabled={asking || !known}>
            {asking ? "Waiting for your wallet" : "Connect a wallet"}
          </Button>

          {refused !== null && (
            <p className="max-w-[34rem] text-[0.875rem] leading-relaxed text-broken">
              {refused}
            </p>
          )}
        </div>
      )}
    </>
  );
}
