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
  missingFields,
  quote,
  readTransfer,
  register,
  settled,
  startDirectWithdraw,
  startWithdraw,
  type Anchor,
  type Transfer,
} from "../../../lib/anchor";
import { balanceOf, type PrizeAsset } from "../../../lib/trustline";

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
 * Two standards do this and an anchor may publish either, so both are here.
 *
 * SEP-24 hosts the whole thing. Its page opens in a tab rather than an iframe,
 * deliberately: someone is about to type an identity number and a bank account
 * into it, and they should be able to read the domain in the address bar while
 * they do. Framing it would teach exactly the habit that makes phishing work.
 *
 * SEP-6 has no page. The anchor answers with an account and a memo and the rest
 * is a payment, so nothing opens and the panel says so rather than promising a
 * tab that never appears. Whatever identity that anchor wants is asked for
 * through SEP-12, and if it wants more than this page can ask for, it says so
 * instead of half starting something.
 */

type Stage =
  | { at: "closed" }
  | { at: "starting" }
  | { at: "running"; transfer: Transfer }
  | { at: "sending"; transfer: Transfer }
  | { at: "failed"; why: string };

export function CashOut({ asset, token: assetContract }: { asset: PrizeAsset; token: string }) {
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

  /* What is actually there, and what it is worth locally. Both read rather than
     described, because "your prize" is a phrase and "10 USDC, about 4,800 TRY"
     is the thing somebody is deciding about. */
  const [held, setHeld] = useState<string | null>(null);
  const [worth, setWorth] = useState<{ amount: string; rate: string } | null>(null);

  /* Why the panel cannot offer anything, when it cannot. Held rather than
     returned early, because a winner reading a page that simply omits the way
     to their money has no way to tell that from a page that has not loaded. */
  const [unavailable, setUnavailable] = useState<string | null>(null);

  useEffect(() => {
    if (ANCHOR_DOMAIN === undefined) {
      setUnavailable("This deployment has no anchor configured.");

      return;
    }

    let alive = true;

    void discover(ANCHOR_DOMAIN)
      .then((found) => alive && setAnchor(found))
      .catch((thrown: unknown) => {
        if (alive) {
          setUnavailable(
            `${ANCHOR_DOMAIN} could not be reached: ${
              thrown instanceof Error ? thrown.message : "no answer"
            }`,
          );
        }
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

  useEffect(() => {
    if (anchor === null || address === null || asset.kind !== "issued") {
      return;
    }

    let alive = true;

    void balanceOf(assetContract, address).then(async (balance) => {
      if (!alive || balance === null) {
        return;
      }

      setHeld(balance);

      /* Indicative, and said as such wherever it is drawn. A firm quote is held
         for two minutes and would go stale while somebody reads it; the anchor's
         own figure at payout is the one that counts. */
      const local = await quote(
        anchor,
        `stellar:${asset.code}:${asset.issuer}`,
        "iso4217:TRY",
        balance,
      );

      if (alive) {
        setWorth(local);
      }
    });

    return () => {
      alive = false;
    };
  }, [anchor, address, asset, assetContract]);

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
      A tab is opened now, on the press, and pointed somewhere afterwards — but
      only for the standard that has somewhere to point it.

      Proving the wallet takes a signature, and by the time that returns this is
      no longer inside the gesture a browser will open a window for. Opened
      first and navigated later, it is never blocked.

      Not with `noopener`, which was the first version of this and does not
      work: it makes `window.open` return null by design, so there was no handle
      to navigate and none to close either. The reference is dropped after the
      tab has been sent on its way instead.

      And not at all for SEP-6, which answers with an account and a memo rather
      than a page. That opened a tab that could never be given a destination and
      could not be closed, so pressing the button produced a blank tab and
      nothing else.
    */
    const opened = anchor.hosted === undefined ? null : window.open("", "_blank");

    setStage({ at: "starting" });

    try {
      const [{ authenticate }, { onTheSameNetwork }] = await Promise.all([
        import("../../../lib/anchor"),
        import("../../../lib/wallet"),
      ]);

      /*
        Checked before anything is signed.

        A wallet on a different network than this deployment fails several steps
        later, inside a library, with a message about the shape of some bytes.
        Asking first turns that into the sentence somebody can act on, which is
        that their extension is on the wrong network.
      */
      if (!(await onTheSameNetwork())) {
        throw new Error("Your wallet is on a different network. Switch it to testnet and try again.");
      }

      token.current ??= await authenticate(anchor, address);

      /* Somebody may have started this and closed the tab. Picking that up is
         better than starting a second transfer beside the first. */
      const open = (await listTransfers(anchor, token.current, code)).find(
        (one) => !settled(one.status),
      );

      const transfer =
        open ?? (await open_(anchor, token.current, code, address, assetContract));

      if (opened !== null) {
        if (transfer.url === undefined) {
          opened.close();
        } else {
          opened.location.href = transfer.url;

          /* Dropped once it has gone, so the anchor's page cannot reach back
             through `window.opener` to the page that sent somebody there. */
          opened.opener = null;
        }
      }

      setStage({ at: "running", transfer });
    } catch (thrown) {
      opened?.close();

      /* The token is dropped as well as the stage. It is bound to the wallet
         that proved itself, so a failure somebody fixes by switching accounts
         or networks would otherwise be retried with the old one. */
      token.current = null;

      /* The whole thing to the console, the sentence to the page. A message
         like "maximum call stack size exceeded" says nothing without the frames
         under it, and the person who needs those frames is looking at a
         developer console rather than at this card. */
      console.error("cash out failed", thrown);

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

  /*
    Said rather than omitted.

    Every one of these used to render nothing at all, which is the same page a
    winner sees when the prize was never paid — so somebody whose anchor was
    down, or whose wallet was on the wrong account, was left comparing an empty
    space against an empty space. The prize is theirs on chain in every case
    below; what is missing is only the way to spend it from here.
  */
  if (address === null) {
    return <Unavailable>Connect the wallet the prize was paid to.</Unavailable>;
  }

  if (unavailable !== null) {
    return <Unavailable>{unavailable}</Unavailable>;
  }

  if (anchor === null) {
    return null;
  }

  if (code === null || !dealt) {
    return (
      <Unavailable>
        {anchor.domain} does not exchange {code ?? "this asset"}, so it cannot be
        cashed out here. It is still yours on chain.
      </Unavailable>
    );
  }

  return (
    <section className="rounded-[1.25rem] bg-paper p-8 ring-1 ring-rule">
      <h3 className="text-[1.25rem] text-ink">Cash out</h3>

      {/* The numbers first, because they are what somebody is deciding about,
          and the arrangement after, because that is what they are agreeing to.
          "Your prize" is a phrase; "10 USDC leaves, about 4,800 TRY arrives" is
          the thing. */}
      {held !== null && (
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink">
          You hold <span className="tabular font-medium">{held}</span> {codeOf(asset)}.
          {worth !== null && (
            <>
              {" "}
              Today that is worth about{" "}
              <span className="tabular font-medium">{money(worth.amount)} TRY</span>.
            </>
          )}
        </p>
      )}

      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
        {anchor.hosted === undefined
          ? `${anchor.domain} takes it back and pays the money to a bank account. They decide who may withdraw; this page only sends them the asset.`
          : `${anchor.domain} takes it back and pays the money out. They handle the identity checks on their own site, which opens in a new tab; this page never sees your documents.`}
      </p>

      {/* The one thing people get wrong about this, said before they press it.
          A balance does not become lira: it leaves, and lira arrives somewhere
          else that is not on this network at all. */}
      <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-faint">
        The {codeOf(asset)} leaves your wallet. Lira never arrives on Stellar —
        it reaches a bank. Keeping the {codeOf(asset)} instead is a fine answer;
        it is yours either way.
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
 * Open a withdrawal by whichever standard this anchor speaks.
 *
 * The hosted flow sends somebody to the anchor's page and identity never
 * touches this product. The programmatic one has no page, so the account is
 * registered from here first — and what that registration needs is asked for
 * rather than assumed, so an anchor that wants more than a sandbox does is
 * refused honestly instead of half attempted.
 */
async function open_(
  anchor: Anchor,
  token: string,
  code: string,
  address: string,
  assetContract: string,
): Promise<Transfer> {
  if (anchor.hosted !== undefined) {
    return startWithdraw(anchor, token, code, address);
  }

  await register(anchor, token, address);

  const wanted = await missingFields(anchor, token, address);

  if (wanted.length > 0) {
    throw new Error(`${anchor.domain} needs more than this page can ask for: ${wanted.join(", ")}`);
  }

  const opened = await startDirectWithdraw(anchor, token, code, address);

  /*
    The whole balance, because a prize is a number nobody chose.

    The anchor takes whatever arrives and names no figure of its own, so the
    amount has to come from somewhere and an input box would be asking a person
    to decide something they have no reason to have an opinion about. What they
    have is what they won.
  */
  const balance = await balanceOf(assetContract, address);

  if (balance === null || Number(balance) <= 0) {
    throw new Error("there is nothing in this wallet to cash out");
  }

  return { ...opened, amountIn: balance };
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

/** Why there is no button, in the frame the button would have been in. */
function Unavailable({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[1.25rem] bg-paper p-8 ring-1 ring-rule">
      <h3 className="text-[1.25rem] text-ink">Cash out</h3>

      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">{children}</p>
    </section>
  );
}

/** The code an asset is known by, or a word that stands in for one. */
function codeOf(asset: PrizeAsset): string {
  return asset.kind === "issued" ? asset.code : asset.kind === "native" ? "XLM" : "the asset";
}

/** Lira, grouped, because five figures unbroken is a number nobody reads. */
function money(amount: string): string {
  const [whole = "0", fraction] = amount.split(".");

  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${
    fraction === undefined ? "" : `.${fraction.slice(0, 2)}`
  }`;
}
