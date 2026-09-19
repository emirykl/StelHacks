/**
 * Lift the contract's interface out of the wasm it was compiled to.
 *
 * The organizer wizard sends a `Constitution`, which is sixteen fields of
 * nested structs, enums and vectors. Nothing hand written should be encoding
 * that: a field renamed in Rust has to break here rather than silently encode
 * into the wrong slot.
 *
 * The SDK solves this with generated bindings, but those are gitignored, so a
 * clean checkout of the frontend could not compile against them. This copies
 * the interface out of them into a committed file, which the browser can then
 * load without any build step of its own.
 *
 * The entries are read from the bindings rather than from the wasm's
 * `contractspecv0` section directly, because version 17 of the SDK replaced
 * the streaming XDR reader that splitting that section needs. The bindings are
 * generated from the same wasm by Stellar's own tool, so the authority is
 * unchanged; the path to it is one step longer.
 *
 *   stellar contract build
 *   npm run bindings --prefix ../sdk
 *   node scripts/spec.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";

import { Spec } from "@stellar/stellar-sdk/contract";

const bindings = "../sdk/bindings/hackathon-core/dist/index.js";
const out = "lib/contract-spec.json";

const source = readFileSync(bindings, "utf8");

/* Every spec entry is a base64 XDR string in the generated file, and nothing
   else in it looks like one: they all begin with the same four bytes. */
const entries = [...source.matchAll(/"(AAAA[A-Za-z0-9+/=]{20,})"/g)].map((match) => match[1]);

if (entries.length === 0) {
  console.error(`no spec entries in ${bindings}; run the bindings script first`);
  process.exit(1);
}

/* Built here as well as written, so a file that cannot be loaded fails now
   rather than in somebody's browser. */
const spec = new Spec(entries);

writeFileSync(out, `${JSON.stringify(entries)}\n`);
console.log(`wrote ${entries.length} entries and ${spec.funcs().length} functions to ${out}`);
