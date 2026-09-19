"use client";

import { useState } from "react";

import { Button, Eyebrow, Measure } from "../components/primitives";
import { SpecLabel, SpecRow, SpecRows, SpecValue } from "../components/spec";
import { connect, type Connection } from "../../lib/wallet";

/**
 * Where somebody attaches an address to themselves.
 *
 * Connecting and proving are two different things and the page keeps them
 * apart. Connecting tells this page an address, which proves nothing: a page
 * can be handed any string. Proving is a signature over a challenge the server
 * issued, and only that is allowed to create the link every profile and
 * earnings total in the product reads.
 *
 * So this page can show you an address today and cannot claim it is yours. The
 * proof step waits on sign in, because a challenge has to be issued to
 * somebody.
 */

export default function Account() {
  const [wallet, setWallet] = useState<Connection | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  async function pick() {
    setAsking(true);
    setRefused(null);

    try {
      setWallet(await connect());
    } catch (error) {
      /* Closing the picker is the ordinary way to change your mind, not a
         failure worth a red message. Anything else is worth saying. */
      const said = error instanceof Error ? error.message : String(error);
      setRefused(said.includes("chosen") || said.includes("closed") ? null : said);
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="flex-1">
      <section className="border-b border-rule">
        <Measure wide className="py-16 sm:py-20">
          <Eyebrow>Your account</Eyebrow>

          <h1 className="mt-4 text-[clamp(2rem,4.5vw,3rem)]">Wallet</h1>

          <p className="mt-5 max-w-[38rem] text-[1.0625rem] leading-relaxed text-ink-soft">
            Applying, forming a team and submitting a project all need a
            signature, so you need an address before you can do any of them.
            Connect the wallet you already use, or go and open one.
          </p>
        </Measure>
      </section>

      <section className="hatch">
        <Measure wide className="py-16">
          <SpecLabel index="01">Connected</SpecLabel>

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
            </SpecRows>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button onClick={() => void pick()} disabled={asking}>
              {asking ? "Waiting for your wallet" : wallet === null ? "Connect a wallet" : "Use a different one"}
            </Button>

            <p className="max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
              {refused ??
                "Connecting only reads your address. Nothing is signed and nothing is sent."}
            </p>
          </div>
        </Measure>
      </section>
    </main>
  );
}
