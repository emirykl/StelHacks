/**
 * The two digests that seal a hackathon's judging.
 *
 * One commits to every scorecard, the other to every ballot, and both are
 * published while the work they cover is still unreadable. That is the whole
 * trick: the collection service cannot add an entry afterwards without moving
 * a digest that is already on chain, and cannot drop one without the person who
 * holds the receipt being able to show it.
 *
 * Read by simulating the call rather than through the indexer, because this is
 * the value somebody is checking the indexer against.
 */

import { toHex } from "./hex";

const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

export interface Roots {
  /** Hex, no prefix. Null until the window shuts and the root is published. */
  scores: string | null;
  ballots: string | null;
}

export async function rootsOf(contract: string): Promise<Roots> {
  const [scores, ballots] = await Promise.all([
    rootFrom(contract, "score_root"),
    rootFrom(contract, "ballot_root"),
  ]);

  return { scores, ballots };
}

/**
 * One root, or nothing.
 *
 * A contract that has not published it yet answers with an error rather than a
 * value, and so does one that was never initialised. Neither is a fault worth
 * reporting to a reader: both mean the same thing on a page, which is that
 * there is nothing to show yet.
 */
export async function rootFrom(contract: string, method: string): Promise<string | null> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return null;
  }

  const [{ Account, Contract, TransactionBuilder, BASE_FEE, scValToNative }, rpc] =
    await Promise.all([import("@stellar/stellar-sdk/base"), import("@stellar/stellar-sdk/rpc")]);

  try {
    const server = new rpc.Server(rpcUrl);
    const tx = new TransactionBuilder(
      new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
      { fee: BASE_FEE, networkPassphrase: passphrase },
    )
      .addOperation(new Contract(contract).call(method))
      .setTimeout(30)
      .build();

    const simulated = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simulated) || simulated.result === undefined) {
      return null;
    }

    return toHex(scValToNative(simulated.result.retval) as Uint8Array);
  } catch {
    return null;
  }
}
