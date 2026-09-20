"use client";

import { ButtonLink } from "../../components/primitives";
import { useWallet } from "../../components/wallet-context";

/**
 * The organizer's way back into their own event.
 *
 * An organizer arriving at the hackathon they created was offered "Register as
 * a hacker", which is not merely useless — it is the contract refusing them.
 * The panel that runs the event existed the whole time at `/manage`, reachable
 * only from the avatar menu, which is not where somebody is standing when they
 * open their own hackathon to check on it.
 *
 * Like the judge's door beside it, this can only be decided in the browser: the
 * organizer is an address the chain recorded, not a role on the account that is
 * signed in, so nothing rendered on the server knows who is reading.
 *
 * It outranks the judge's door rather than sitting beside it. The two are not
 * exclusive — the rules may name the organizer a judge as well — but the panel
 * this leads to carries its own link to the scoring console, so the organizer
 * loses nothing by being sent there first, while the reverse would strand them
 * on a page with no way to the controls.
 */
export function Organizing({
  contractId,
  organizer,
  children,
}: {
  contractId: string;
  /** The address the chain recorded as running this event. */
  organizer: string | null;
  /** What the banner offers everybody who is not one. */
  children: React.ReactNode;
}) {
  const { wallet } = useWallet();

  if (organizer === null || wallet === null || wallet.address !== organizer) {
    return <>{children}</>;
  }

  return (
    <ButtonLink href={`/manage/${contractId}`} className="shrink-0">
      Manage this hackathon
    </ButtonLink>
  );
}
