"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "../../components/primitives";
import { useWallet } from "../../components/wallet-context";
import {
  ANCHOR_DOMAIN,
  authenticate,
  discover,
  readTransfer,
  register,
  settled,
  startDeposit,
  type Anchor,
  type Transfer,
} from "../../../lib/anchor";
import { accept, assetOf, balanceOf, holds, type PrizeAsset } from "../../../lib/trustline";

/**
 * Buying the prize before locking it away.
 *
 * The funding step asks an organizer to move the prize asset into the vault and
 * assumes they have it. Nobody funding their first hackathon does: they have
 * lira, and a token they have never held. Until now the product's answer was to
 * fail at the deposit with a balance error, which is a true statement about the
 * wrong problem.
 *
 * So this is the deposit half of the same ramp the winner uses to go the other
 * way. Money in, asset out, and the asset the anchor issues is the one the
 * winner will hand back — not another token that shares its code.
 *
 * The instructions are the anchor's own words, printed rather than reworded. A
 * bank reference this page paraphrased is a transfer they cannot match.
 */

type Stage =
  | { at: "closed" }
  | { at: "starting" }
  | { at: "waiting"; transfer: Transfer }
  | { at: "failed"; why: string };

export function TopUp({ assetContract, needed }: { assetContract: string; needed: string }) {
  const { wallet } = useWallet();
  const address = wallet?.address ?? null;

  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [asset, setAsset] = useState<PrizeAsset | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ at: "closed" });
  const [accepting, setAccepting] = useState(false);

  /* In memory and nowhere else, for the reason `cash-out.tsx` gives: whoever
     holds this token is this account for as long as it lasts. */
  const token = useRef<string | null>(null);

  useEffect(() => {
    if (ANCHOR_DOMAIN === undefined) {
      return;
    }

    let alive = true;

    void discover(ANCHOR_DOMAIN)
      .then((found) => alive && setAnchor(found))
      .catch(() => {
        /* No anchor is not the organizer's problem to read about here. They can
           still fund the vault from a wallet that already holds the asset. */
      });

    void assetOf(assetContract).then((found) => alive && setAsset(found));

    return () => {
      alive = false;
    };
  }, [assetContract]);

  const done = stage.at === "waiting" && settled(stage.transfer.status);

  useEffect(() => {
    if (address === null) {
      return;
    }

    let alive = true;

    void balanceOf(assetContract, address).then((found) => alive && setHeld(found));

    return () => {
      alive = false;
    };
  }, [address, assetContract, done]);

  /* Polled only while the anchor is still working, and stopped when it is not. */
  useEffect(() => {
    if (stage.at !== "waiting" || anchor === null || token.current === null) {
      return;
    }

    if (settled(stage.transfer.status)) {
      return;
    }

    let alive = true;

    const timer = window.setInterval(() => {
      void readTransfer(anchor, token.current!, stage.transfer.id)
        .then((now) => {
          if (alive && now.status !== stage.transfer.status) {
            setStage({ at: "waiting", transfer: { ...now, how: stage.transfer.how } });
          }
        })
        .catch(() => {
          /* One failed poll is a network blip, not an answer. */
        });
    }, 5_000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [anchor, stage]);

  async function acceptAsset() {
    if (address === null || asset === null) {
      return;
    }

    setAccepting(true);

    const outcome = await accept(address, asset);

    setAccepting(false);

    if (!outcome.ok && !outcome.refused) {
      setStage({ at: "failed", why: outcome.why });
    }

    if (outcome.ok) {
      setHeld(await balanceOf(assetContract, address));
    }
  }

  async function buy() {
    if (anchor === null || address === null || asset?.kind !== "issued") {
      return;
    }

    setStage({ at: "starting" });

    try {
      token.current ??= await authenticate(anchor, address);
      await register(anchor, token.current, address);

      const transfer = await startDeposit(anchor, token.current, asset.code, address, needed);

      setStage({ at: "waiting", transfer });
    } catch (thrown) {
      token.current = null;
      console.error("top up failed", thrown);
      setStage({ at: "failed", why: thrown instanceof Error ? thrown.message : "that did not work" });
    }
  }

  /* Nothing to offer when the wallet already holds enough, which is the case
     for anybody funding a second event. */
  if (
    address === null ||
    anchor === null ||
    asset?.kind !== "issued" ||
    (held !== null && Number(held) >= Number(needed))
  ) {
    return null;
  }

  return (
    <section className="rounded-[1.25rem] bg-paper p-8 ring-1 ring-rule">
      <h3 className="text-[1.3125rem] text-ink">Buy the prize with lira</h3>

      <p className="mt-3 text-[1rem] leading-relaxed text-ink-soft">
        The vault needs <span className="tabular">{needed}</span> {asset.code} and this
        wallet holds <span className="tabular">{held ?? "0"}</span>. {anchor.domain}{" "}
        issues it against a bank transfer, and it is the same {asset.code} a winner
        will hand back to them.
      </p>

      <div className="mt-6">
        <Body
          stage={stage}
          code={asset.code}
          accepting={accepting}
          /* Accepting comes first, because an anchor cannot deliver an asset to
             a wallet that has not agreed to hold it. */
          needsTrustline={held === null}
          onAccept={() => void acceptAsset()}
          onBuy={() => void buy()}
          onRetry={() => setStage({ at: "closed" })}
        />
      </div>
    </section>
  );
}

function Body({
  stage,
  code,
  accepting,
  needsTrustline,
  onAccept,
  onBuy,
  onRetry,
}: {
  stage: Stage;
  code: string;
  accepting: boolean;
  needsTrustline: boolean;
  onAccept: () => void;
  onBuy: () => void;
  onRetry: () => void;
}) {
  if (needsTrustline) {
    return (
      <Button disabled={accepting} onClick={onAccept}>
        {accepting ? "Signing" : `Accept ${code} first`}
      </Button>
    );
  }

  if (stage.at === "closed") {
    return <Button onClick={onBuy}>Buy {code}</Button>;
  }

  if (stage.at === "starting") {
    return <Button disabled>Asking</Button>;
  }

  if (stage.at === "failed") {
    return (
      <div className="grid gap-4">
        <p className="text-[0.875rem] leading-relaxed text-broken">{stage.why}</p>

        <div>
          <Button intent="quiet" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (settled(stage.transfer.status)) {
    return (
      <p className="flex items-center gap-2 text-[1rem] text-verified">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-verified" />
        {stage.transfer.status === "completed"
          ? `${code} is in the wallet. Fund the vault below.`
          : stage.transfer.status}
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {/* Their words. A reference this page reworded is a transfer the anchor
          cannot match to anybody. */}
      {stage.transfer.how !== undefined && (
        <p className="rounded-[0.75rem] bg-paper-sunk p-4 text-[0.9375rem] leading-relaxed text-ink">
          {stage.transfer.how}
        </p>
      )}

      <p className="flex items-center gap-2 text-[0.9375rem] text-signal-deep dark:text-signal">
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-signal-deep dark:bg-signal"
        />
        Waiting for the transfer to arrive
      </p>
    </div>
  );
}
