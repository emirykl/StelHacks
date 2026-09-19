import { Keypair } from "@stellar/stellar-sdk";
import {
  merkle,
  scorecardLeaf,
  signScorecard,
  verifyScorecard,
  type Scorecard,
} from "@stelhacks/sdk";
import { describe, expect, it } from "vitest";

import { issue, verify } from "../src/receipt.js";
import { omitted, order, proofFor, seal } from "../src/seal.js";

/**
 * What a dishonest collection service can and cannot get away with.
 *
 * This is the one place the product asks anybody to trust a server, so the
 * tests are written from the attacker's side: each one is the service trying
 * something, and passing means it was caught. The three it might try are
 * changing an entry, denying it ever arrived, and quietly leaving it out of the
 * tree.
 */

const JUDGES = [Keypair.random(), Keypair.random(), Keypair.random()];
const SERVICE = Keypair.random();
const NOW = 1_787_000_000;

function scorecard(judge: Keypair, team: number, technical: number): Scorecard {
  return {
    judge: judge.publicKey(),
    team,
    scores: [
      { criterion: "technical", score: technical },
      { criterion: "novelty", score: 60 },
    ],
  };
}

/** Three judges scoring one project, each signing their own card. */
function submitted(): Scorecard[] {
  return JUDGES.map((judge, index) => scorecard(judge, 1, 80 + index));
}

describe("the receipt", () => {
  it("verifies against the address that issued it", () => {
    const card = submitted()[0]!;
    const receipt = issue(scorecardLeaf(card), SERVICE, NOW);

    expect(receipt.sealer).toBe(SERVICE.publicKey());
    expect(verify(receipt)).toBe(true);
  });

  /**
   * A receipt whose time could be edited afterwards would let the service claim
   * an entry arrived after the deadline and drop it on those grounds, which is
   * omission wearing a better excuse.
   */
  it("stops verifying when the time it claims is changed", () => {
    const receipt = issue(scorecardLeaf(submitted()[0]!), SERVICE, NOW);

    expect(verify({ ...receipt, received_at: NOW - 3_600 })).toBe(false);
  });

  it("stops verifying when the leaf it covers is changed", () => {
    const receipt = issue(scorecardLeaf(submitted()[0]!), SERVICE, NOW);
    const other = scorecardLeaf(submitted()[1]!);

    expect(verify({ ...receipt, leaf: Buffer.from(other).toString("hex") })).toBe(false);
  });

  /**
   * Anybody can run this without asking the service anything, which is what
   * makes a receipt worth holding.
   */
  it("cannot be forged by somebody who is not the service", () => {
    const receipt = issue(scorecardLeaf(submitted()[0]!), Keypair.random(), NOW);

    expect(verify({ ...receipt, sealer: SERVICE.publicKey() })).toBe(false);
  });
});

describe("a service that changes an entry", () => {
  /**
   * It cannot. The judge signs the leaf and the tree commits to that same leaf,
   * so a card altered after submission no longer matches the signature the
   * judge gave for it.
   */
  it("is caught by the judge's own signature", () => {
    const judge = JUDGES[0]!;
    const original = scorecard(judge, 1, 80);
    const signed = signScorecard(original, judge);

    const altered = scorecard(judge, 1, 20);

    expect(verifyScorecard(original, signed)).toBe(true);
    expect(verifyScorecard(altered, signed)).toBe(false);
  });
});

describe("a service that leaves an entry out", () => {
  /**
   * The test the whole trust argument turns on. The service takes three
   * scorecards, hands out three receipts, and publishes a root built from two.
   * The judge it dropped can prove it with nothing but their receipt and the
   * public root.
   */
  it("is caught by the receipt holder the moment the root is published", () => {
    const cards = submitted();
    const receipts = cards.map((card) => issue(scorecardLeaf(card), SERVICE, NOW));

    // The dishonest bit: everything except the third judge.
    const published = seal(cards.slice(0, 2).map(scorecardLeaf));

    const dropped = receipts[2]!;
    const proof = proofFor(published, scorecardLeaf(cards[2]!));

    expect(proof).toBeNull();
    expect(omitted(dropped, published.root, proof)).toBe(true);
  });

  /**
   * The same check has to clear an honest service, or it would accuse everybody
   * and mean nothing.
   */
  it("does not accuse a service that included everything", () => {
    const cards = submitted();
    const receipts = cards.map((card) => issue(scorecardLeaf(card), SERVICE, NOW));
    const published = seal(cards.map(scorecardLeaf));

    for (const [index, receipt] of receipts.entries()) {
      const proof = proofFor(published, scorecardLeaf(cards[index]!));

      expect(proof).not.toBeNull();
      expect(omitted(receipt, published.root, proof)).toBe(false);
    }
  });

  /**
   * Handing back a proof from a tree that was never published is the obvious
   * next move, and the root is what refuses it.
   */
  it("cannot cover an omission with a proof from a different tree", () => {
    const cards = submitted();
    const receipt = issue(scorecardLeaf(cards[2]!), SERVICE, NOW);

    const published = seal(cards.slice(0, 2).map(scorecardLeaf));
    const pretend = seal(cards.map(scorecardLeaf));
    const proofFromElsewhere = proofFor(pretend, scorecardLeaf(cards[2]!));

    expect(omitted(receipt, published.root, proofFromElsewhere)).toBe(true);
  });

  /**
   * A forged receipt proves nothing, so the check cannot be used the other way
   * round to smear an honest service.
   */
  it("is not accused on the strength of a receipt it never issued", () => {
    const cards = submitted();
    const forged = issue(scorecardLeaf(cards[2]!), Keypair.random(), NOW);
    const published = seal(cards.slice(0, 2).map(scorecardLeaf));

    expect(omitted({ ...forged, sealer: SERVICE.publicKey() }, published.root, null)).toBe(false);
  });
});

describe("the tree itself", () => {
  /**
   * The service decides nothing about the shape of the tree. Hand the same
   * entries to anybody and they build the same root, so a root that does not
   * match the entries is visibly the service's doing rather than a question of
   * who put what where.
   */
  it("comes out the same whatever order the entries arrived in", () => {
    const leaves = submitted().map(scorecardLeaf);

    const oneWay = seal(leaves);
    const another = seal([...leaves].reverse());

    expect(Buffer.from(another.root).toString("hex")).toBe(
      Buffer.from(oneWay.root).toString("hex"),
    );
  });

  it("gives every entry a proof that verifies against the published root", () => {
    const leaves = submitted().map(scorecardLeaf);
    const published = seal(leaves);

    for (const leaf of order(leaves)) {
      expect(merkle.verify(published.root, leaf, proofFor(published, leaf)!)).toBe(true);
    }
  });
});
