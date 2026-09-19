import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Spec } from "@stellar/stellar-sdk/contract";
import type { xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { spec as committedCoreSpec } from "../src/spec.js";

/**
 * The interface the contracts publish, read the way everything outside Rust
 * reads it.
 *
 * This file exists because of a specific failure. The core contract once
 * carried an error enum of 104 cases; the spec caps one at fifty. Rust neither
 * enforces that nor warns about it, so the contract compiled, the tests passed,
 * the wasm built reproducibly and the whole thing deployed and ran. What it
 * published was an interface no strict XDR reader could parse, which meant the
 * contract was uncallable from a browser and unreadable by any wallet or
 * explorer. Nothing in the Rust suite could have caught it, because the Rust
 * reader is lenient and never looks.
 *
 * So the check has to happen from the other side, and it has to happen against
 * the wasm rather than against anything convenient. Two things are proved
 * here: the built artifact's interface parses strictly, and the bindings
 * committed to this repository are the ones that artifact describes.
 */

const WASM = join(
  import.meta.dirname,
  "..",
  "..",
  "contracts",
  "target",
  "wasm32v1-none",
  "release",
);

/**
 * The cap, from `Stellar-contract-spec.x`, where an error enum is declared as
 * `cases<50>`. Asserted directly so the failure names the rule rather than
 * surfacing as an XDR read error thirty frames down.
 */
const MAX_ERROR_CASES = 50;

function wasm(name: string): Buffer {
  const path = join(WASM, name);

  if (!existsSync(path)) {
    throw new Error(
      `${name} is missing. Run 'stellar contract build' in contracts/ before the SDK suite: ` +
        "these tests check the SDK against the artifact the contracts actually produce.",
    );
  }

  return readFileSync(path);
}

function errorEnums(spec: Spec): xdr.ScSpecUdtErrorEnumV0[] {
  return spec.entries
    .filter((entry) => entry.switch().name === "scSpecEntryUdtErrorEnumV0")
    .map((entry) => entry.udtErrorEnumV0());
}

describe.each([
  ["hackathon-core", "hackathon_core.wasm"],
  ["prize-vault", "prize_vault.wasm"],
])("%s publishes an interface the rest of the world can read", (_name, file) => {
  it("parses under a strict XDR reader", () => {
    expect(() => Spec.fromWasm(wasm(file))).not.toThrow();
  });

  /**
   * The cap that was broken. Checked as a number so that a contract growing
   * past it fails with a sentence rather than with a parse error.
   */
  it("keeps every error enum inside the fifty case cap", () => {
    for (const enumeration of errorEnums(Spec.fromWasm(wasm(file)))) {
      expect(
        enumeration.cases().length,
        `${enumeration.name().toString()} has ${enumeration.cases().length} cases`,
      ).toBeLessThanOrEqual(MAX_ERROR_CASES);
    }
  });

  it("declares at least one callable entry point", () => {
    expect(Spec.fromWasm(wasm(file)).funcs().length).toBeGreaterThan(0);
  });
});

describe("the committed bindings", () => {
  /**
   * Generated code is committed so a consumer of this package never needs the
   * Stellar CLI. That only holds while it matches the wasm: bindings a commit
   * behind would let the suite above pass against an interface nobody is
   * actually shipping. Regenerate with `npm run bindings` when this fails.
   */
  it("describe the contract that was actually built", () => {
    const built = Spec.fromWasm(wasm("hackathon_core.wasm"));

    expect(committedCoreSpec.entries.length).toBe(built.entries.length);
    expect(committedCoreSpec.entries.map((entry) => entry.toXDR("base64")).sort()).toEqual(
      built.entries.map((entry) => entry.toXDR("base64")).sort(),
    );
  });

  it("expose every entry point the contract declares", () => {
    const built = Spec.fromWasm(wasm("hackathon_core.wasm"));

    expect(committedCoreSpec.funcs().map((func) => func.name().toString()).sort()).toEqual(
      built.funcs().map((func) => func.name().toString()).sort(),
    );
  });
});
