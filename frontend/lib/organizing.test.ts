import { describe, expect, it } from "vitest";

import {
  ABOVE_THRESHOLD_FEE_BPS,
  FEE_THRESHOLD_DOLLAR_UNITS,
  feeBpsForPrize,
} from "./organizing";

describe("platform fee threshold", () => {
  it("keeps a zero-rate event free through exactly five thousand dollars", () => {
    expect(feeBpsForPrize(0, FEE_THRESHOLD_DOLLAR_UNITS)).toBe(0);
  });

  it("charges five percent above five thousand dollars", () => {
    expect(feeBpsForPrize(0, FEE_THRESHOLD_DOLLAR_UNITS + BigInt(1))).toBe(
      ABOVE_THRESHOLD_FEE_BPS,
    );
  });

  it("charges the 15,000 dollar case shown in the creation form", () => {
    expect(feeBpsForPrize(0, BigInt(15_000) * BigInt(10_000_000))).toBe(500);
  });

  it("does not reduce a higher granted rate", () => {
    expect(feeBpsForPrize(750, FEE_THRESHOLD_DOLLAR_UNITS + BigInt(1))).toBe(750);
  });
});
