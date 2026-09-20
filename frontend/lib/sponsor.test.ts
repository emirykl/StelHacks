/**
 * The split a sponsor is shown before they sign.
 *
 * `sharesOf` is the browser's copy of `shares_of` in the contract, and a copy
 * is only worth having if it agrees. These figures are printed on the prize
 * rows as a promise about where somebody's money is going; the contract works
 * the same division out again a second later and its answer is the one that
 * moves the money. A stroop between them is a page that lied.
 */

import { describe, expect, it } from "vitest";

import { placeName, sharesOf, type Position } from "./sponsor";

/** The table from the screenshot: four places, three to one across them. */
function table(): Position[] {
  return [
    { track: "genesis", rank: 1, worth: BigInt(3_000), frozen: BigInt(3_000) },
    { track: "genesis", rank: 2, worth: BigInt(2_000), frozen: BigInt(2_000) },
    { track: "genesis", rank: 3, worth: BigInt(1_500), frozen: BigInt(1_500) },
    { track: "genesis", rank: 4, worth: BigInt(1_000), frozen: BigInt(1_000) },
  ];
}

function sum(shares: bigint[]): bigint {
  return shares.reduce((total, one) => total + one, BigInt(0));
}

describe("dividing a contribution over a table", () => {
  it("gives every place the same money when the split is even", () => {
    expect(sharesOf(BigInt(100), table(), "evenly")).toEqual([
      BigInt(25),
      BigInt(25),
      BigInt(25),
      BigInt(25),
    ]);
  });

  it("keeps the table's shape when the split is by worth", () => {
    // 7,500 across the four, so a hundred goes 40 / 26 / 20 / 13 with the
    // roundings, and first is still three times fourth.
    const shares = sharesOf(BigInt(100), table(), "byWorth");

    expect(shares[0]).toBe(BigInt(41));
    expect(shares[3]).toBe(BigInt(13));
  });

  it("places every stroop, whichever rule cannot divide", () => {
    for (const split of ["evenly", "byWorth"] as const) {
      for (const amount of [BigInt(1), BigInt(7), BigInt(99), BigInt(101), BigInt(123_457)]) {
        expect(sum(sharesOf(amount, table(), split))).toBe(amount);
      }
    }
  });

  it("puts what it could not divide on the best place, not the first row", () => {
    // The same table written out of order, which nothing stops an organizer
    // from doing. The odd stroop still belongs to first place.
    const jumbled = [...table()].reverse();
    const shares = sharesOf(BigInt(101), jumbled, "evenly");

    expect(shares[3]).toBe(BigInt(26));
    expect(sum(shares)).toBe(BigInt(101));
  });

  it("gives a single place the whole contribution", () => {
    const one = table().slice(0, 1);

    expect(sharesOf(BigInt(100), one, "evenly")).toEqual([BigInt(100)]);
    expect(sharesOf(BigInt(100), one, "byWorth")).toEqual([BigInt(100)]);
  });

  it("divides nothing into nothing rather than into NaN", () => {
    expect(sharesOf(BigInt(0), table(), "evenly")).toEqual([
      BigInt(0),
      BigInt(0),
      BigInt(0),
      BigInt(0),
    ]);

    expect(sharesOf(BigInt(100), [], "byWorth")).toEqual([]);
  });
});

describe("naming a place", () => {
  it("reads zero as what the contract means by it", () => {
    expect(placeName(0)).toBe("every place");
  });

  it("reads a real rank as a person would say it", () => {
    expect([1, 2, 3, 4, 11].map(placeName)).toEqual(["1st", "2nd", "3rd", "4th", "11th"]);
  });
});
