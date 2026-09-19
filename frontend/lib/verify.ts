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
 *
 * Asking is all this file does. What the answers mean lives in `verdict.ts`,
 * which has no network in it and can be read and tested on its own.
 */

import { bound, read, type Check, type Claims, type Findings } from "./verdict";

export type { Check, Claims, Findings };

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
