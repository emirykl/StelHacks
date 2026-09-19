import { hash } from "@stellar/stellar-sdk";

/**
 * Tags that keep a leaf and an inner node from ever hashing the same way.
 *
 * These have to match `merkle.rs` byte for byte. Without them the tree has a
 * known forgery: an attacker who can choose data shaped like a pair of digests
 * can present an inner node as though it were a leaf, and prove membership of
 * something that was never submitted.
 */
const LEAF_TAG = 0x00;
const NODE_TAG = 0x01;

/** A 32 byte digest. */
export type Digest = Uint8Array;

/**
 * The digest of a leaf.
 *
 * Callers pass the already serialized payload, so the tree stays indifferent to
 * what it is carrying: a scorecard in one place, a ballot in another, each with
 * its own domain tag applied before it gets here.
 */
export function leaf(payload: Uint8Array): Digest {
  return sha256(concat(Uint8Array.of(LEAF_TAG), payload));
}

/**
 * The digest of two children.
 *
 * The pair is sorted before hashing, which is why a proof carries only sibling
 * digests and no direction bits. That halves the proof and, more usefully,
 * removes the class of bug where a client and a contract disagree about which
 * way to walk the tree.
 */
export function node(a: Digest, b: Digest): Digest {
  const [first, second] = compare(a, b) <= 0 ? [a, b] : [b, a];

  return sha256(concat(Uint8Array.of(NODE_TAG), first, second));
}

/**
 * Whether `target` sits under `root`, given the sibling digests along the way.
 *
 * This is what a judge uses to check their own scorecard was counted, and what
 * a voter uses to check their ballot was. A collection service can publish a
 * root that leaves someone out, but it cannot produce a proof for a leaf it
 * excluded, so the omission is detectable by exactly the person it harmed.
 */
export function verify(root: Digest, target: Digest, proof: readonly Digest[]): boolean {
  const computed = proof.reduce((acc, sibling) => node(acc, sibling), target);

  return compare(computed, root) === 0;
}

/**
 * The root of a tree over every leaf, alongside a proof for each one.
 *
 * A level with an odd count promotes its last node unchanged rather than
 * duplicating it. Duplicating would let a tree of three leaves produce the same
 * root as a tree of four, which is a real attack rather than an inelegance.
 */
export function build(leaves: readonly Digest[]): { root: Digest; proofs: Digest[][] } {
  if (leaves.length === 0) {
    throw new Error("a tree needs at least one leaf");
  }

  const proofs: Digest[][] = leaves.map(() => []);
  let positions = leaves.map((_, index) => index);
  let level = [...leaves];

  while (level.length > 1) {
    positions = positions.map((position, index) => {
      const sibling = position % 2 === 0 ? position + 1 : position - 1;
      const digest = level[sibling];

      // An odd node at the end of a level has no sibling and is promoted
      // untouched, so nothing is added to its proof at this height.
      if (digest !== undefined) {
        proofs[index]!.push(digest);
      }

      return Math.floor(position / 2);
    });

    const next: Digest[] = [];
    for (let at = 0; at < level.length; at += 2) {
      const left = level[at]!;
      const right = level[at + 1];
      next.push(right === undefined ? left : node(left, right));
    }

    level = next;
  }

  return { root: level[0]!, proofs };
}

function sha256(payload: Uint8Array): Digest {
  return new Uint8Array(hash(Buffer.from(payload)));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);

  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }

  return out;
}

function compare(a: Uint8Array, b: Uint8Array): number {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index]! - b[index]!;
    if (difference !== 0) {
      return difference;
    }
  }

  return a.length - b.length;
}
