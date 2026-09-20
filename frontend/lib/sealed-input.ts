import {
  generateNonce,
  quicknet,
  sealPayload,
  type DrandClient,
} from "@sub-rosa/tlock";

import { toHex } from "./hex";

/** The encrypted envelope handed to the collection service. */
export interface SealedInput {
  /** The first Drand round at or after the frozen judging deadline. */
  round: number;
  /** Sub Rosa's commitment to the complete versioned payload envelope. */
  commitment: string;
  /** AGE-armored tlock ciphertext, transported as hex through JSON. */
  ciphertext: string;
}

const drand = quicknet();

/**
 * Seal application data until the judging deadline frozen on chain.
 *
 * The deadline is supplied by the contract read, not by the collection
 * service. That distinction is the privacy promise: a curious service cannot
 * answer with an earlier round and make a judge encrypt to a key that already
 * exists.
 */
export async function sealUntil(value: unknown, revealAt: number): Promise<SealedInput> {
  if (!Number.isInteger(revealAt) || revealAt * 1000 <= Date.now()) {
    throw new Error("the sealed-input deadline has already passed");
  }

  const round = await firstRoundAtOrAfter(drand, revealAt * 1000);
  const payload = new TextEncoder().encode(JSON.stringify(value));
  const sealed = await sealPayload({
    round,
    client: drand,
    nonce: generateNonce(),
    payload,
  });

  return {
    round,
    commitment: toHex(sealed.commitment),
    ciphertext: toHex(sealed.ciphertext),
  };
}

/** Same calculation as the sealer independently performs from the constitution. */
async function firstRoundAtOrAfter(client: DrandClient, targetMs: number): Promise<number> {
  const info = await client.chain().info();
  const periodMs = info.period * 1000;
  const genesisMs = info.genesis_time * 1000;
  const atTarget = Math.floor((targetMs - genesisMs) / periodMs) + 1;
  const atTargetMs = genesisMs + (atTarget - 1) * periodMs;

  return atTargetMs < targetMs ? atTarget + 1 : atTarget;
}
