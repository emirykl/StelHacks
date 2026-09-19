import { Keypair } from "@stellar/stellar-sdk";
import { toHex, fromHex, type Digest } from "@stelhacks/sdk";

/**
 * The promise the service makes when it takes an entry.
 *
 * This is the whole of what bounds the one piece of trust the product does not
 * remove. Between a judge submitting a scorecard and the root going on chain,
 * the service holds something nobody else can see, and three things stop that
 * mattering:
 *
 *   It cannot change an entry, because the judge signed the leaf and the tree
 *   commits to that same leaf.
 *
 *   It cannot deny receiving one, because of this receipt.
 *
 *   It cannot quietly leave one out, because a receipt plus a published root
 *   that does not contain the leaf is a proof of omission that anybody can
 *   check.
 *
 * So the worst it can do is refuse an entry to your face, which is a different
 * kind of problem and a visible one.
 */

export interface Receipt {
  /** The leaf the service undertakes to include. */
  leaf: string;
  /** When it was taken, as a UTC timestamp in seconds. */
  received_at: number;
  /** The service address that signed, so a holder knows what to check against. */
  sealer: string;
  signature: string;
}

/**
 * What a receipt actually covers.
 *
 * The timestamp is inside the signature rather than beside it. A receipt whose
 * time could be edited afterwards would let the service claim an entry arrived
 * after the deadline and drop it on those grounds, which is omission wearing a
 * better excuse.
 */
function covered(leaf: Digest, receivedAt: number): Buffer {
  return Buffer.from(`stelhacks.v1.receipt:${toHex(leaf)}:${receivedAt}`, "utf8");
}

export function issue(leaf: Digest, sealer: Keypair, receivedAt: number): Receipt {
  return {
    leaf: toHex(leaf),
    received_at: receivedAt,
    sealer: sealer.publicKey(),
    signature: toHex(new Uint8Array(sealer.sign(covered(leaf, receivedAt)))),
  };
}

/**
 * Whether a receipt really was issued by the address it names.
 *
 * Anybody can run this, which is the point: a judge checks their own receipt
 * without asking the service, and so does anybody they show it to.
 */
export function verify(receipt: Receipt): boolean {
  try {
    return Keypair.fromPublicKey(receipt.sealer).verify(
      covered(fromHex(receipt.leaf), receipt.received_at),
      Buffer.from(fromHex(receipt.signature)),
    );
  } catch {
    return false;
  }
}
