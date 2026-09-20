import {
  QUICKNET_HASH,
  fetchRoundBeacon,
  openPayload,
  payloadCommitment,
  quicknet,
  type DrandClient,
} from "@sub-rosa/tlock";
import { toHex } from "@stelhacks/sdk";

import { core } from "./core.js";
import { isRecord } from "./validate.js";

/** The only encrypted-input shape accepted from a browser. */
export interface SealedInput {
  round: number;
  commitment: string;
  ciphertext: string;
}

const MAX_CIPHERTEXT_BYTES = 4_096;
const knownRounds = new Map<string, number>();

/** A beacon was available, but this particular envelope could not be trusted. */
export class InvalidSealedInputError extends Error {
  constructor(cause: unknown) {
    super("the Sub Rosa envelope is malformed", { cause });
    this.name = "InvalidSealedInputError";
  }
}

/* Cache beacons as well as chain info. `openPayload` asks the client for the
   same round once per entry; after the first verified answer those reads should
   be local, and a transient network failure cannot make one valid card look
   malformed while another opens. */
const upstream = quicknet();
const beacons = new Map<number, ReturnType<DrandClient["get"]>>();
const drand = {
  options: upstream.options,
  chain: () => upstream.chain(),
  latest: () => upstream.latest(),
  get: (round: number) => {
    const held = beacons.get(round);
    if (held !== undefined) {
      return held;
    }

    const reading = upstream.get(round);
    beacons.set(round, reading);

    return reading;
  },
} as unknown as DrandClient;

export function isSealedInput(value: unknown): value is SealedInput {
  if (!isRecord(value)) {
    return false;
  }

  const { round, commitment, ciphertext } = value;

  return (
    Number.isSafeInteger(round) &&
    (round as number) > 0 &&
    typeof commitment === "string" &&
    /^[0-9a-f]{64}$/.test(commitment) &&
    typeof ciphertext === "string" &&
    ciphertext.length > 0 &&
    ciphertext.length % 2 === 0 &&
    ciphertext.length <= MAX_CIPHERTEXT_BYTES * 2 &&
    /^[0-9a-f]+$/.test(ciphertext)
  );
}

/**
 * The round comes from the frozen constitution, independently of the browser.
 * The ciphertext also names its own round, so lying in the JSON wrapper cannot
 * turn a future seal into one the service can already open.
 */
export async function acceptsSeal(contract: string, sealed: SealedInput): Promise<boolean> {
  return (
    sealed.round === (await roundFor(contract)) &&
    roundInside(sealed.ciphertext) === sealed.round
  );
}

/** Open one envelope after its Drand beacon exists and verify its commitment. */
export async function openSeal(sealed: SealedInput): Promise<unknown> {
  /* Fetch first through the cached client. Once this succeeds, a later failure
     is malformed ciphertext rather than “the deadline has not arrived”. */
  await drand.chain().info();
  await fetchRoundBeacon(drand, sealed.round);

  try {
    const envelope = await openPayload(Buffer.from(sealed.ciphertext, "hex"), drand);

    if (toHex(payloadCommitment(envelope)) !== sealed.commitment) {
      throw new Error("the opened payload does not match its Sub Rosa commitment");
    }

    return JSON.parse(new TextDecoder().decode(envelope.payload)) as unknown;
  } catch (error) {
    throw new InvalidSealedInputError(error);
  }
}

/** The first quicknet round whose scheduled time is not before judging closes. */
export async function roundFor(contract: string): Promise<number> {
  const held = knownRounds.get(contract);
  if (held !== undefined) {
    return held;
  }

  const read = (await core(contract).constitution()).result;
  if (!read.isOk()) {
    throw new Error(`${contract} has no readable constitution yet`);
  }

  const targetMs = Number(read.unwrap().schedule.judging_closes_at) * 1000;
  const info = await drand.chain().info();
  const periodMs = info.period * 1000;
  const genesisMs = info.genesis_time * 1000;
  const atTarget = Math.floor((targetMs - genesisMs) / periodMs) + 1;
  const atTargetMs = genesisMs + (atTarget - 1) * periodMs;
  const round = atTargetMs < targetMs ? atTarget + 1 : atTarget;

  knownRounds.set(contract, round);

  return round;
}

/** Read the tlock round and chain hash from the AGE stanza without decrypting. */
export function roundInside(ciphertext: string): number | null {
  try {
    const armored = Buffer.from(ciphertext, "hex").toString("utf8").trim();
    const header = "-----BEGIN AGE ENCRYPTED FILE-----";
    const footer = "-----END AGE ENCRYPTED FILE-----";

    if (!armored.startsWith(header) || !armored.endsWith(footer)) {
      return null;
    }

    const encoded = armored.slice(header.length, -footer.length).replace(/\s/g, "");
    const age = Buffer.from(encoded, "base64").toString("binary");
    const match = /^age-encryption\.org\/v1\n-> tlock ([1-9][0-9]*) ([0-9a-f]{64})\n/.exec(age);

    if (match === null || match[2] !== QUICKNET_HASH) {
      return null;
    }

    const round = Number(match[1]);

    return Number.isSafeInteger(round) ? round : null;
  } catch {
    return null;
  }
}
