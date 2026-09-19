import { Client } from "hackathon-core";
import type { Spec } from "@stellar/stellar-sdk/contract";

/**
 * The contract's own interface description, used to turn plain objects into the
 * exact bytes the contract would produce.
 *
 * Nothing here hand writes an XDR layout. The spec is generated from the wasm
 * the contract was compiled to, so a field added in Rust arrives here without
 * anyone remembering to mirror it, and a field whose type changed stops
 * matching rather than silently encoding differently. That is the whole reason
 * the digests in `hashing.ts` can be trusted to equal the contract's: they are
 * derived from the same description the contract published.
 *
 * The client is built without a network because none is needed. Encoding a
 * value is a local operation; the address and RPC URL below are placeholders
 * that no call ever reaches.
 */
const encoder = new Client({
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://example.invalid",
});

export const spec: Spec = encoder.spec;
