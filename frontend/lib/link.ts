/**
 * Tying the connected wallet to the signed in account, from the browser.
 *
 * `wallet_links` is the only join between the two halves of somebody's
 * identity: the contract knows an address and our database knows a person, and
 * every surface that puts a name beside an application, a team or a submission
 * reads this table to get from one to the other. Without a row there, somebody
 * who signed in, connected their wallet and entered a hackathon still shows up
 * to the organizer as "Unnamed builder" beside their own address.
 *
 * The proof is two calls and neither can be skipped: a GET asks the server for
 * a nonce bound to this account and this address, and a POST answers it with a
 * signature. A signature over a message the browser chose would prove only that
 * somebody can sign their own words.
 *
 * It lives apart from `lib/wallet.ts` on purpose. That file connects and signs
 * and writes nothing; this one asks the server to write something down.
 */

import { browserClient } from "./supabase/client";
import { proveAddressHex } from "./wallet";

export type Linked =
  /** Written, or already there. The name will appear from here on. */
  | "linked"
  /** Nobody is signed in, so there is no account to link it to. */
  | "signed-out"
  /** The wallet said no, which is a decision rather than a fault. */
  | "refused"
  /** Anything else: the server, the network, a wallet without message signing. */
  | "failed";

/**
 * Whether this address has already been proved to belong to somebody.
 *
 * Asked before offering the proof, because a wallet that is already linked
 * should not be asked to sign again. Read with the visitor's own key, which is
 * enough: the row is public, and it is the existence of one that matters here
 * rather than whose it is.
 */
export async function isLinked(address: string): Promise<boolean> {
  const db = browserClient();

  if (db === null) {
    return false;
  }

  const { data } = await db
    .from("wallet_links")
    .select("address")
    .eq("address", address)
    .maybeSingle();

  return data !== null;
}

/** Ask for a challenge, sign it, hand it back. One wallet prompt, no fee. */
export async function linkWallet(address: string): Promise<Linked> {
  try {
    const asked = await fetch(`/api/wallet?address=${address}`);
    const issued = (await asked.json()) as { message?: string; error?: string };

    if (asked.status === 401) {
      return "signed-out";
    }

    if (!asked.ok || issued.message === undefined) {
      return "failed";
    }

    let signature: string;

    try {
      signature = await proveAddressHex(address, issued.message);
    } catch {
      /* Declining is not a failure to report as one. Somebody who would rather
         stay an address is allowed to, and everything they did on chain stands
         whether or not their name is beside it. */
      return "refused";
    }

    const answered = await fetch("/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, signature }),
    });

    return answered.ok ? "linked" : "failed";
  } catch {
    return "failed";
  }
}
