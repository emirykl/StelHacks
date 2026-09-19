/**
 * Checking the page against the chain, from the reader's own browser.
 *
 * Every fact on a hackathon page reaches it through our indexer and our
 * database, and a reader has no reason to take either on faith. This module is
 * the answer to that: it asks the contract directly, over the reader's own
 * network connection, and reports whether what the contract says matches what
 * the page was served. Nothing here goes through our servers, which is the only
 * arrangement under which the result means anything.
 *
 * It is deliberately not run on the server and not run automatically. A page
 * that verified itself would be making the claim it is supposed to let somebody
 * else make.
 */

/** What the contract answered, or why we could not ask it. */
export type Check =
  | { found: string; matches: boolean }
  | { failed: string };

export interface Claims {
  /** The digest the page is showing, hex, no prefix. Absent before the lock. */
  digest: string | null;
  /** The phase number the page is showing. Absent before the indexer arrives. */
  phase: number | null;
  /** The vault the page says is bound, or null if it says none is. */
  vault: string | null;
}

export interface Findings {
  digest?: Check;
  phase?: Check;
  vault?: Check;
  /**
   * Whether the contract answered anything at all.
   *
   * Tracked separately because a refusal is not silence. `vault` throws when no
   * vault is bound, which is the contract running correctly and telling us so;
   * reading reachability off the findings would let that count as an answer
   * even when the network never replied.
   */
  reached: boolean;
}

const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

/** Whether a reader can check anything at all, which decides if we offer to. */
export function canCheck(): boolean {
  return rpcUrl !== undefined && passphrase !== undefined;
}

/**
 * Ask the contract the three questions the page answered on its behalf.
 *
 * The Stellar library is imported here rather than at the top of the file so it
 * loads when a reader presses the button and not before. It is the largest
 * thing this site would ship, and a visitor who never checks anything should
 * never pay for it.
 */
export async function check(contractId: string, claims: Claims): Promise<Findings> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return { reached: false };
  }

  const [{ Account, Contract, TransactionBuilder, BASE_FEE, scValToNative }, { Server }] =
    await Promise.all([
      import("@stellar/stellar-sdk/base"),
      import("@stellar/stellar-sdk/rpc"),
    ]);

  const server = new Server(rpcUrl);

  /**
   * An address our own database handed us, which may not be an address.
   *
   * The library refuses to build a call to a malformed contract id, and that
   * refusal is worth surfacing rather than swallowing: a hackathon page naming
   * something that is not a contract is a page nobody can check at all.
   */
  let contract: InstanceType<typeof Contract>;

  try {
    contract = new Contract(contractId);
  } catch {
    throw new Error("this page names something that is not a contract address");
  }

  /**
   * Simulation needs a source account and never touches it.
   *
   * These are read only calls: nothing is signed, nothing is submitted, no fee
   * is paid and the account is not required to exist. Using a real one would
   * mean asking the reader for a wallet to read a public fact.
   *
   * The address is the all zero ed25519 key, which nobody holds and which the
   * network will still parse. Its last four characters are a checksum, so it
   * cannot simply be written as a run of A's.
   */
  const nobody = new Account(
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    "0",
  );

  async function ask(method: string): Promise<unknown> {
    const tx = new TransactionBuilder(nobody, {
      fee: BASE_FEE,
      networkPassphrase: passphrase,
    })
      .addOperation(contract.call(method))
      .setTimeout(30)
      .build();

    const simulated = await server.simulateTransaction(tx);

    if ("error" in simulated) {
      throw new Error(simulated.error);
    }

    if (simulated.result === undefined) {
      throw new Error(`${method} returned nothing`);
    }

    return simulated.result.retval;
  }

  /**
   * The three calls go out together.
   *
   * They are independent questions and running them in sequence would make the
   * check feel like work the reader is waiting on rather than a fact they are
   * looking up.
   */
  const [digest, phase, vault] = await Promise.allSettled([
    ask("constitution_hash"),
    ask("phase"),
    ask("vault"),
  ]);

  const reached = [digest, phase, vault].some((answer) => answer.status === "fulfilled");

  return {
    reached,

    digest: read(digest, claims.digest, (value) => hex(scValToNative(value as never))),

    phase: read(phase, claims.phase === null ? null : String(claims.phase), (value) =>
      String(scValToNative(value as never)),
    ),

    /**
     * A vault the contract has not been given yet throws rather than answers,
     * and a page that says "not bound yet" is then correct. This is the one
     * place where the contract refusing is itself the answer.
     */
    vault: bound(vault, claims.vault, reached, (value) => String(scValToNative(value as never))),
  };
}

/**
 * A digest as a reader compares it, which is as text.
 *
 * Written out by hand rather than through `Buffer`, which is a Node type this
 * page would otherwise have to ship a polyfill for to do something a loop does
 * in four lines.
 */
function hex(value: unknown): string {
  const bytes = value as ArrayLike<number>;
  let out = "";

  for (let index = 0; index < bytes.length; index += 1) {
    out += bytes[index]!.toString(16).padStart(2, "0");
  }

  return out;
}

function read(
  answer: PromiseSettledResult<unknown>,
  claimed: string | null,
  decode: (value: unknown) => string,
): Check {
  if (answer.status === "rejected") {
    return { failed: reason(answer.reason) };
  }

  try {
    const found = decode(answer.value);
    return { found, matches: claimed !== null && found === claimed };
  } catch {
    return { failed: "the contract answered in a shape this page did not expect" };
  }
}

function bound(
  answer: PromiseSettledResult<unknown>,
  claimed: string | null,
  reached: boolean,
  decode: (value: unknown) => string,
): Check {
  if (answer.status !== "rejected") {
    return read(answer, claimed, decode);
  }

  /*
    A refusal only means something if the contract was talking.

    If the other calls came back, this one was refused by the contract, and
    "there is no vault" is the answer: it agrees with a page saying none is
    bound and contradicts a page naming one. If nothing came back, the network
    is down and this says nothing either way, which is the distinction that
    keeps an outage from reading as tampering.
  */
  if (!reached) {
    return { failed: reason(answer.reason) };
  }

  return claimed === null
    ? { found: "not bound yet", matches: true }
    : { found: "no vault is bound", matches: false };
}

/**
 * Why the check could not be made, in words a reader can act on.
 *
 * An RPC node being unreachable is not the same as a digest not matching, and
 * collapsing the two would let a network problem read as tampering.
 */
function reason(error: unknown): string {
  const said = error instanceof Error ? error.message : String(error);
  return said.length > 120 ? `${said.slice(0, 117)}…` : said;
}
