import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { fromHex, toHex } from "../src/hex.js";
import { build, leaf, node, verify } from "../src/merkle.js";

/**
 * The files the Rust contract tests assert against too.
 *
 * Reading them here is the whole point: if either language changes how it
 * hashes, one of the two suites goes red, and neither can move without the
 * other noticing.
 */
function fixture(name: string): Uint8Array {
  const path = join(import.meta.dirname, "..", "..", "fixtures", name);

  return fromHex(readFileSync(path, "utf8"));
}

const scorecardLeaf = fixture("scorecard-leaf.sha256");
const ballotLeaf = fixture("ballot-leaf.sha256");
const expectedRoot = fixture("merkle-root.sha256");

describe("the tree agrees with the contract", () => {
  /**
   * The handshake. Two leaves the contract produced, combined here, have to
   * reach the digest the contract reached.
   */
  it("combines the two canonical leaves into the canonical root", () => {
    expect(toHex(node(scorecardLeaf, ballotLeaf))).toBe(toHex(expectedRoot));
  });

  /**
   * A proof carries no direction bits because the pair is sorted first. A
   * client that sorted the other way, or not at all, would land elsewhere and
   * every inclusion proof it built would be rejected on chain.
   */
  it("hashes a pair the same way round either way", () => {
    expect(toHex(node(ballotLeaf, scorecardLeaf))).toBe(toHex(expectedRoot));
  });
});

describe("inclusion proofs", () => {
  const leaves = Array.from({ length: 6 }, (_, index) =>
    leaf(Uint8Array.from({ length: 8 }, () => index + 1)),
  );

  /**
   * Six is deliberate: three judges scoring two projects is six scorecards, and
   * six is not a power of two. A tree that only worked on balanced input would
   * fail on the first real hackathon.
   */
  it("gives every leaf a proof that verifies against the root", () => {
    const { root, proofs } = build(leaves);

    leaves.forEach((target, index) => {
      expect(verify(root, target, proofs[index]!)).toBe(true);
    });
  });

  it("refuses a leaf that was never in the tree", () => {
    const { root, proofs } = build(leaves);
    const stranger = leaf(Uint8Array.from({ length: 8 }, () => 99));

    expect(verify(root, stranger, proofs[0]!)).toBe(false);
  });

  it("refuses a proof built for a different position", () => {
    const { root, proofs } = build(leaves);

    expect(verify(root, leaves[2]!, proofs[0]!)).toBe(false);
  });

  it("refuses a proof with a step removed", () => {
    const { root, proofs } = build(leaves);

    expect(verify(root, leaves[0]!, proofs[0]!.slice(1))).toBe(false);
  });

  it("makes a lone leaf its own root", () => {
    const only = leaves[0]!;
    const { root, proofs } = build([only]);

    expect(toHex(root)).toBe(toHex(only));
    expect(verify(root, only, proofs[0]!)).toBe(true);
  });

  /**
   * The forgery the leaf and node tags exist to stop. An inner node is a real
   * digest sitting in the tree, so without separate tags it could be fed back
   * through the leaf function to prove membership of something nobody
   * submitted.
   */
  it("will not let an inner node pass as a leaf", () => {
    const { root } = build(leaves);
    const inner = node(leaves[0]!, leaves[1]!);
    const forged = leaf(inner);

    expect(toHex(forged)).not.toBe(toHex(inner));
    expect(verify(root, forged, [])).toBe(false);
  });
});
