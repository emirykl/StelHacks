"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "../../components/primitives";
import { useWallet } from "../../components/wallet-context";
import {
  ANCHOR_DOMAIN,
  awaitingTransfer,
  completeWithdraw,
  discover,
  listTransfers,
  readTransfer,
  settled,
  startWithdraw,
  type Anchor,
  type Transfer,
} from "../../../lib/anchor";
import type { PrizeAsset } from "../../../lib/trustline";

/**
 * Turning a prize that has been paid into money that can be spent.
 *
 * The last step of the product's whole argument. Everything before this proves
 * the result was not tampered with; this is where the winner gets something
 * they can use, and without it the promise stops one hop short.
 *
 * The work is the anchor's. It takes identity documents, decides who may
 * withdraw, and moves the fiat. This panel does four small things around that:
 * proves the wallet to the anchor, opens the anchor's own page, sends the asset
 * when the anchor says it is ready, and reports what the anchor says. It never
 * sees a document and never holds the money.
 *
 * The anchor's page opens in a tab rather than an iframe, deliberately. Someone
 * is about to type an identity number and a bank account into it, and they
 * should be able to read the domain in the address bar while they do. Framing
 * it would teach exactly the habit that makes phishing work.
 */

type Stage =
  | { at: "closed" }
  | { at: "starting" }
  | { at: "running"; transfer: Transfer }
  | { at: "sending"; transfer: Transfer }
  | { at: "failed"; why: string };

export function CashOut({ asset }: { asset: PrizeAsset }) {
  const { wallet } = useWallet();
  const address = wallet?.address ?? null;

  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [stage, setStage] = useState<Stage>({ at: "closed" });

  /*
    The anchor's bearer token, kept in a ref rather than in state or storage.

    Whoever holds it is this account for as long as it lasts, so it should live
    in memory and die with the page. A ref also keeps it out of the render path,
    where a careless log or a serialised prop could carry it somewhere it should
    never go.
  */
  const token = useRef<string | null>(null);

  useEffect(() => {
    if (ANCHOR_DOMAIN === undefined) {
      return;
    }

    let alive = true;

    void discover(ANCHOR_DOMAIN)
      .then((found) => alive && setAnchor(found))
      .catch(() => {
        /* Left silent. An anchor that cannot be reached is not the winner's
           problem to read about: the prize is theirs on chain either way, and
           this panel simply does not appear. */
      });

    return () => {
      alive = false;
    };
  }, []);

  /** The asset code the anchor knows this by. */
  const code = asset.kind === "issued" ? asset.code : asset.kind === "native" ? "native" : null;

  /* Whether the anchor deals in it at all. A panel offering to cash out
     something the anchor has never heard of is a promise it cannot keep. */
  const dealt =
    anchor !== null && code !== null && anchor.currencies.some((one) => one.code === code);

  const resume = useCallback(async () => {
    if (anchor === null || address === null || code === null || token.current === null) {
      return;
    }

    const open = (await listTransfers(anchor, token.current, code)).find(
      (one) => !settled(one.status),
    );

    if (open !== undefined) {
      setStage({ at: "running", transfer: open });
    }
  }, [anchor, address, code]);

  /* Polled only while something is in flight, and stopped the moment it
     settles. A poll that does not know when to stop runs until the tab does. */
  useEffect(() => {
    if (stage.at !== "running" || anchor === null || token.current === null) {
      return;
    }

    let alive = true;

    const timer = window.setInterval(() => {
      void readTransfer(anchor, token.current!, stage.transfer.id)
        .then((now) => {
          if (alive && now.status !== stage.transfer.status) {
            setStage({ at: "running", transfer: { ...now, url: stage.transfer.url } });
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

  async function begin() {
    if (anchor === null || address === null || code === null) {
      return;
    }

    /*
      The tab is opened now, on the press, and pointed somewhere afterwards.

      Proving the wallet takes a signature, and by the time that returns this is
      no longer inside the gesture that a browser will open a window for. Opened
      first and navigated later, it is the same tab either way and never blocked.
    */
    const opened = window.open("", "_blank", "noopener,noreferrer");

    setStage({ at: "starting" });

    try {
      const { authenticate } = await import("../../../lib/anchor");

      token.current ??= await authenticate(anchor, address);

      /* Somebody may have started this and closed the tab. Picking that up is
         better than starting a second transfer beside the first. */
      const open = (await listTransfers(anchor, token.current, code)).find(
        (one) => !settled(one.status),
      );

      const transfer = open ?? (await startWithdraw(anchor, token.current, code, address));

      if (transfer.url !== undefined && opened !== null) {
        opened.location.href = transfer.url;
      }

      setStage({ at: "running", transfer });
    } catch (thrown) {
      opened?.close();
      setStage({ at: "failed", why: thrown instanceof Error ? thrown.message : "that did not work" });
    }
  }

  async function send() {
    if (stage.at !== "running" || address === null) {
      return;
    }

    setStage({ at: "sending", transfer: stage.transfer });

    const done = await completeWithdraw(
      stage.transfer,
      asset.kind === "issued" ? { code: asset.code, issuer: asset.issuer } : "native",
      address,
    );

    if (done.ok) {
      setStage({ at: "running", transfer: stage.transfer });
      await resume();

      return;
    }

    /* Declining in the wallet leaves the transfer exactly where it was, which
       is somewhere it can be finished later. */
    setStage(
      done.refused ? { at: "running", transfer: stage.transfer } : { at: "failed", why: done.why },
    );
  }

  if (address === null || anchor === null || !dealt) {
    return null;
  }

  return (
    <section className="mt-6 max-w-[46rem] rounded-[1.25rem] bg-paper p-8 ring-1 ring-rule">
      <h3 className="text-[1.25rem] text-ink">Cash out</h3>

      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
        {anchor.domain} exchanges this back for money. They handle the identity
        checks and the payout on their own site, which opens in a new tab. This
        page never sees your documents.
      </p>

      <div className="mt-6">
        <Body
          stage={stage}
          onBegin={() => void begin()}
          onSend={() => void send()}
          onRetry={() => setStage({ at: "closed" })}
        />
      </div>
    </section>
  );
}

/**
 * What the panel says, which is one thing at a time.
 *
 * Every branch here is a state the anchor put us in rather than one this
 * invented, so a person comparing this page with the anchor's own tab sees the
 * same story told twice rather than two accounts of it.
 */
function Body({
  stage,
  onBegin,
  onSend,
  onRetry,
}: {
  stage: Stage;
  onBegin: () => void;
  onSend: () => void;
  onRetry: () => void;
}) {
  if (stage.at === "closed") {
    return <Button onClick={onBegin}>Cash out</Button>;
  }

  if (stage.at === "starting") {
    return <Button disabled>Opening</Button>;
  }

  if (stage.at === "failed") {
    return (
      <div className="grid gap-4">
        <p className="text-[0.8125rem] leading-relaxed text-broken">{stage.why}</p>

        <div>
          <Button intent="quiet" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const { transfer } = stage;

  if (settled(transfer.status)) {
    return (
      <div className="grid gap-2">
        <p
          className={`flex items-center gap-2 text-[0.9375rem] ${
            transfer.status === "completed" ? "text-verified" : "text-ink-soft"
          }`}
        >
          <span
            aria-hidden
            className={`size-1.5 shrink-0 rounded-full ${
              transfer.status === "completed" ? "bg-verified" : "bg-ink-faint"
            }`}
          />
          {finished[transfer.status] ?? transfer.status}
        </p>

        {/* The anchor's own words, printed rather than interpreted. They know
            why they refused and we would only be guessing. */}
        {transfer.message !== undefined && (
          <p className="text-[0.8125rem] leading-relaxed text-ink-soft">{transfer.message}</p>
        )}
      </div>
    );
  }

  if (awaitingTransfer(transfer.status)) {
    return (
      <div className="grid gap-4">
        <p className="text-[0.9375rem] leading-relaxed text-ink">
          {anchorReady(transfer)}
        </p>

        <div>
          <Button disabled={stage.at === "sending"} onClick={onSend}>
            {stage.at === "sending" ? "Signing" : "Send it"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-2 text-[0.9375rem] text-signal-deep dark:text-signal">
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-signal-deep dark:bg-signal"
        />
        {waiting[transfer.status] ?? "Waiting on the anchor"}
      </p>

      {transfer.url !== undefined && (
        <a
          href={transfer.url}
          target="_blank"
          rel="noopener noreferrer"
          className="justify-self-start text-[0.8125rem] text-ink-soft underline decoration-rule underline-offset-4 transition-colors duration-150 ease-settle hover:text-ink hover:decoration-ink"
        >
          Open their page again
        </a>
      )}
    </div>
  );
}

/** The amount and where it is going, said before somebody signs it away. */
function anchorReady(transfer: Transfer): string {
  const amount = transfer.amountIn ?? "";
  const out = transfer.amountOut;

  return out === undefined
    ? `They are ready. Sending ${amount} finishes it.`
    : `They are ready. Sending ${amount} pays out ${out}.`;
}

/* The standard's own statuses, in the words somebody waiting would use. Only
   the ones a withdrawal actually passes through are named; anything else is
   printed as it came, because inventing a friendly sentence for a status we do
   not know would be inventing what is happening. */
const waiting: Record<string, string> = {
  incomplete: "Finish the form in their tab",
  pending_user_transfer_complete: "They have it. Paying out now",
  pending_anchor: "They are processing it",
  pending_external: "On its way through the banking system",
  pending_customer_info_update: "They need something more from you",
  on_hold: "They have put it on hold",
};

const finished: Record<string, string> = {
  completed: "Paid out",
  refunded: "Refunded, and the asset is back in your wallet",
  expired: "This expired before it was finished",
  error: "They could not complete this",
};
