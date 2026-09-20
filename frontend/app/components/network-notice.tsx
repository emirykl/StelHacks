"use client";

import { useWallet } from "./wallet-context";

/**
 * Said here, once, rather than discovered at the wallet prompt.
 *
 * A wallet extension carries its own network setting, and a hackathon is
 * created against ours. When the two disagree the extension still opens, still
 * shows the transaction, and then refuses it with a sentence about signing not
 * being possible at the moment. That arrives after a long form and reads as our
 * fault at the last step, which is the worst place to learn a setting is wrong.
 *
 * Nothing is blocked from here. The person may be reading a page rather than
 * signing anything, and a banner that took the site away from them over a
 * setting they will fix in ten seconds would be the louder mistake.
 */
export function NetworkNotice() {
  const { wrongNetwork } = useWallet();

  if (wrongNetwork === null) {
    return null;
  }

  return (
    <div className="sticky top-18 z-10 border-b border-signal-deep/30 bg-signal">
      <p className="mx-auto max-w-[96rem] px-6 py-2.5 text-[0.9375rem] text-signal-ink">
        Your wallet is on {named(wrongNetwork)} and this site runs on{" "}
        {named(process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"] ?? "")}. Switch
        the network in your wallet, or nothing here will sign.
      </p>
    </div>
  );
}

/**
 * A passphrase as the name the wallet's own settings use.
 *
 * The passphrase is what the protocol compares and it is a sentence with a date
 * in it; "Test Net" is what somebody has to go and click. Anything unrecognised
 * is shown whole rather than guessed at, because a network we cannot name is
 * exactly the case where the raw string is the useful thing.
 */
function named(passphrase: string): string {
  if (passphrase.startsWith("Public Global Stellar Network")) {
    return "Main Net";
  }

  if (passphrase.startsWith("Test SDF Network")) {
    return "Test Net";
  }

  if (passphrase.startsWith("Test SDF Future Network")) {
    return "Futurenet";
  }

  return passphrase;
}
