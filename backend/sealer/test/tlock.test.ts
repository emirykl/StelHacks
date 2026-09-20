import { Buffer } from "node:buffer";

import { QUICKNET_HASH } from "@sub-rosa/tlock";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/core.js", () => ({ core: vi.fn() }));

import { isSealedInput, roundInside } from "../src/tlock.js";

function armor(round: number, chain = QUICKNET_HASH): string {
  const age = `age-encryption.org/v1\n-> tlock ${round} ${chain}\nbody\n--- mac\npayload`;
  const encoded = Buffer.from(age, "binary").toString("base64");
  const wrapped = `-----BEGIN AGE ENCRYPTED FILE-----\n${encoded}\n-----END AGE ENCRYPTED FILE-----\n`;

  return Buffer.from(wrapped).toString("hex");
}

describe("Sub Rosa envelope validation", () => {
  it("reads the round bound into a quicknet AGE stanza", () => {
    expect(roundInside(armor(32_354_215))).toBe(32_354_215);
  });

  it("rejects an envelope for another Drand chain", () => {
    expect(roundInside(armor(32_354_215, "0".repeat(64)))).toBeNull();
  });

  it("bounds the public wrapper before doing cryptographic work", () => {
    expect(
      isSealedInput({
        round: 32_354_215,
        commitment: "a".repeat(64),
        ciphertext: armor(32_354_215),
      }),
    ).toBe(true);
    expect(
      isSealedInput({
        round: 32_354_215,
        commitment: "a".repeat(64),
        ciphertext: "00".repeat(4_097),
      }),
    ).toBe(false);
  });
});
