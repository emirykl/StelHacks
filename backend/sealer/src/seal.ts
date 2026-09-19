import { merkle, toHex, fromHex, type Digest } from "@stelhacks/sdk";

import { verify as verifyReceipt, type Receipt } from "./receipt.js";

/**
 * Building the tree, and answering for what is in it.
 *
 * The service holds entries nobody else can see until the root is published.
 * Everything here is deliberately a pure function of the leaves it is given, so
 * that the same set produces the same root every time and anybody holding the
 * leaves can rebuild it without asking.
 */

/**
 * The order leaves are hashed in.
 *
 * Sorted, and that matters more than it looks. The service decides nothing
 * about the tree this way: hand the same entries to anybody and they build the
 * same root, so a root that does not match the entries is visibly the service's
 * doing rather than a matter of who put what where.
 */
export function order(leaves: readonly Digest[]): Digest[] {
  return [...leaves].map(toHex).sort().map(fromHex);
}

export interface Sealed {
  root: Digest;
  /** The proof for each leaf, in the same order as `order` returns them. */
  proofs: Digest[][];
  leaves: Digest[];
}

export function seal(leaves: readonly Digest[]): Sealed {
  const ordered = order(leaves);
  const { root, proofs } = merkle.build(ordered);

  return { root, proofs, leaves: ordered };
}

/** The proof for one leaf, or nothing when it is not in the tree. */
export function proofFor(sealed: Sealed, leaf: Digest): Digest[] | null {
  const at = sealed.leaves.findIndex((candidate) => toHex(candidate) === toHex(leaf));

  return at === -1 ? null : sealed.proofs[at]!;
}

/**
 * Whether a published root left out something the service admitted taking.
 *
 * This is the check the whole trust argument turns on, and it is written here
 * rather than left as a description because it is the thing a wronged judge
 * needs to be able to run. A receipt says the service holds a leaf. A root says
 * what it committed to. If the receipt verifies and the leaf has no proof under
 * the root, the service dropped it, and no explanation reconciles the two.
 */
export function omitted(receipt: Receipt, root: Digest, proof: readonly Digest[] | null): boolean {
  if (!verifyReceipt(receipt)) {
    return false;
  }

  const leaf = fromHex(receipt.leaf);

  return proof === null || !merkle.verify(root, leaf, proof);
}
