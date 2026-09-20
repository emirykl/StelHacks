"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ButtonLink } from "../../../components/primitives";
import { Opening as Setup } from "../opening";
import { PRIZE_ASSETS } from "../../../../lib/money";
import { rulesFor, type Rules } from "../../../../lib/rules";
import { runningOf, type Running } from "../../../../lib/running";
import { useWallet } from "../../../components/wallet-context";

/**
 * What this page needs before it can offer the one thing it exists for.
 *
 * The same two reads the panel makes, and made here rather than passed down,
 * because the page has no other reason to be dynamic and an organizer arriving
 * from the form should not wait on a panel they are about to leave.
 */

export function Opening({ contractId }: { contractId: string }) {
  const { wallet, known } = useWallet();
  const router = useRouter();
  const [running, setRunning] = useState<Running | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);

  const reread = useCallback(async () => {
    const [state, written] = await Promise.all([
      runningOf(contractId),
      rulesFor(contractId).catch(() => null),
    ]);

    setRunning(state);
    setRules(written);

    /* Opened. Everything from here is the panel's, and there is nothing left on
       this page to look at. */
    if (state.phase !== null && state.phase >= 2) {
      router.push(`/manage/${contractId}`);
    }
  }, [contractId, router]);

  useEffect(() => {
    void reread();
  }, [reread]);

  if (!known || running === null) {
    return <p className="label text-ink-faint">Reading the contract</p>;
  }

  if (running.phase === null) {
    return (
      <Note>
        Nothing has been created at this address yet. A hackathon starts on the
        create page, and this is where it continues afterwards.
      </Note>
    );
  }

  if (running.phase >= 2) {
    return (
      <div className="grid gap-5">
        <Note>This hackathon is already open. Everything else happens in the panel.</Note>

        <ButtonLink href={`/manage/${contractId}`}>Open the panel</ButtonLink>
      </div>
    );
  }

  if (wallet === null) {
    return <Note>Connect the organizer's wallet to open this hackathon.</Note>;
  }

  if (wallet.address !== running.organizer) {
    return (
      <Note>
        Only the organizer can open this, and that is{" "}
        <span className="tabular text-[0.875rem]">{running.organizer}</span>. Connect
        that wallet to continue.
      </Note>
    );
  }

  /*
    The prize asset comes from the rules here, not from the state.

    `runningOf` leaves `prizeAsset` null on purpose — it asks the contract seven
    cheap questions and the asset is not one of them — and this page was reading
    that null as "a token we do not recognise". So every figure on the summary
    was printed as a bare number with no ticker beside it, and the ramp that
    offers to buy the shortfall never appeared at all. The document this page is
    about to freeze names the asset, and it has already been read.
  */
  const prizeAsset = running.prizeAsset ?? rules?.prizeAsset ?? null;
  const code = PRIZE_ASSETS.find((asset) => asset.contract === prizeAsset)?.code ?? "";

  return (
    <Setup
      contractId={contractId}
      running={{ ...running, phase: running.phase, prizeAsset }}
      rules={rules}
      code={code}
      address={wallet.address}
      reread={reread}
    />
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-[40rem] text-[1rem] leading-relaxed text-ink-soft">{children}</p>
  );
}
