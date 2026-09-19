/**
 * The rubric each track is scored against, from the frozen rules.
 *
 * Read rather than configured, because the weights are part of what was hashed
 * at the lock. A judging form built from anything else would be scoring against
 * a rubric nobody agreed to.
 */

const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

export interface Rubric {
  track: string;
  criteria: { id: string; weightBps: number }[];
}

export async function rubricOf(contractId: string): Promise<Rubric[]> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return [];
  }

  const [{ Account, Contract, TransactionBuilder, BASE_FEE, scValToNative }, rpc] =
    await Promise.all([
      import("@stellar/stellar-sdk/base"),
      import("@stellar/stellar-sdk/rpc"),
    ]);

  const server = new rpc.Server(rpcUrl);

  try {
    const tx = new TransactionBuilder(
      new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
      { fee: BASE_FEE, networkPassphrase: passphrase },
    )
      .addOperation(new Contract(contractId).call("constitution"))
      .setTimeout(30)
      .build();

    const simulated = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simulated) || simulated.result === undefined) {
      return [];
    }

    const constitution = scValToNative(simulated.result.retval) as { tracks?: unknown };

    if (!Array.isArray(constitution.tracks)) {
      return [];
    }

    return constitution.tracks.map((raw) => {
      const track = raw as { id?: unknown; criteria?: unknown };

      return {
        track: String(track.id ?? ""),
        criteria: Array.isArray(track.criteria)
          ? track.criteria.map((entry) => {
              const criterion = entry as { id?: unknown; weight_bps?: unknown };

              return {
                id: String(criterion.id ?? ""),
                weightBps: Number(criterion.weight_bps ?? 0),
              };
            })
          : [],
      };
    });
  } catch {
    return [];
  }
}
