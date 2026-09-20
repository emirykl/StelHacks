"use client";

import { ButtonLink } from "../../components/primitives";
import { useWallet } from "../../components/wallet-context";

/**
 * The judge's way in, from the page they were already looking at.
 *
 * A judge is an address in a frozen document rather than an account with a role
 * on it, so nothing rendered on the server knows whether the reader is one.
 * Only the wallet can say, which is why this is a client component wrapped
 * around whatever the banner would otherwise have offered.
 *
 * It outranks the ballot for the same reason the ballot outranks registering:
 * of the people who can still act during judging, the judge is the one the
 * result actually waits on. Until this existed their only way through was a row
 * inside the avatar menu, which is a place nobody looks when they are standing
 * on the hackathon itself.
 */
export function Scoring({
  contractId,
  judges,
  children,
}: {
  contractId: string;
  /** Every address the frozen rules name as a judge. */
  judges: string[];
  /** What the banner offers everybody who is not one. */
  children: React.ReactNode;
}) {
  const { wallet } = useWallet();

  if (wallet === null || !judges.includes(wallet.address)) {
    return <>{children}</>;
  }

  return (
    <ButtonLink href={`/judge/${contractId}`} className="shrink-0">
      Score the projects
    </ButtonLink>
  );
}
