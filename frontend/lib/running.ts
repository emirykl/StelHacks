/**
 * What a hackathon needs next, read from the contract.
 *
 * The organizer's surface offers exactly one action, and which one is not a
 * matter of taste: the contract allows precisely one call at each point and
 * refuses the rest. Working that out from the contract rather than from our
 * database means the button on screen is the button that will succeed.
 */

const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

export interface Running {
  /** Absent when nothing has been created at this address yet. */
  phase: number | null;
  organizer: string | null;
  /** Whether the rules have been hashed and frozen. */
  locked: boolean;
  vault: string | null;
  /** What the prize table adds up to, in the smallest unit. */
  required: bigint;
  /** What the vault actually holds. */
  held: bigint;
  /** Read separately, from the frozen rules, and only when it is needed. */
  prizeAsset: string | null;
}

const empty: Running = {
  phase: null,
  organizer: null,
  locked: false,
  vault: null,
  required: BigInt(0),
  held: BigInt(0),
  prizeAsset: null,
};

export async function runningOf(contractId: string): Promise<Running> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return empty;
  }

  const [{ Account, Contract, TransactionBuilder, BASE_FEE, scValToNative }, rpc] =
    await Promise.all([
      import("@stellar/stellar-sdk/base"),
      import("@stellar/stellar-sdk/rpc"),
    ]);

  const server = new rpc.Server(rpcUrl);

  let contract: InstanceType<typeof Contract>;

  try {
    contract = new Contract(contractId);
  } catch {
    return empty;
  }

  const nobody = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");

  async function ask(method: string): Promise<unknown> {
    const tx = new TransactionBuilder(nobody, { fee: BASE_FEE, networkPassphrase: passphrase })
      .addOperation(contract.call(method))
      .setTimeout(30)
      .build();

    const simulated = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simulated) || simulated.result === undefined) {
      throw new Error("no answer");
    }

    return scValToNative(simulated.result.retval);
  }

  /*
    Every one of these can legitimately refuse. Before a vault is bound
    `vault` throws; before the rules are locked `constitution_hash` throws;
    before anything is created they all do. A refusal is read as the state it
    describes rather than as a page that failed to load.
  */
  const [phase, team, digest, vault, required, held] = await Promise.all([
    ask("phase").catch(() => null),
    /* The organizer is on the organizing team, not on the state. `state` holds
       what changes while the event runs; who runs it does not. */
    ask("team").catch(() => null),
    ask("constitution_hash").catch(() => null),
    ask("vault").catch(() => null),
    ask("required_funding").catch(() => null),
    ask("funding").catch(() => null),
  ]);

  const organizing = team as { organizer?: unknown } | null;

  return {
    phase: phase === null ? null : Number(phase),
    organizer: typeof organizing?.organizer === "string" ? organizing.organizer : null,
    locked: digest !== null,
    vault: typeof vault === "string" ? vault : null,
    required: required === null ? BigInt(0) : BigInt(required as bigint),
    held: held === null ? BigInt(0) : BigInt(held as bigint),
    prizeAsset: null,
  };
}

/**
 * Just the phase, for surfaces that only need to know whether they are open.
 *
 * `runningOf` asks six questions because an organizer's console needs all six.
 * A page that only has to decide whether to show a form was paying for five it
 * throws away, and on a page opened by somebody with work to do that showed up
 * as seconds of waiting.
 */
export async function phaseOf(contractId: string): Promise<number | null> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return null;
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
      .addOperation(new Contract(contractId).call("phase"))
      .setTimeout(30)
      .build();

    const simulated = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simulated) || simulated.result === undefined) {
      return null;
    }

    return Number(scValToNative(simulated.result.retval));
  } catch {
    return null;
  }
}

/** The prize asset named in the frozen rules, which the vault has to match. */
export async function prizeAssetOf(contractId: string): Promise<string | null> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return null;
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
      return null;
    }

    const constitution = scValToNative(simulated.result.retval) as { prize_asset?: unknown };

    return typeof constitution.prize_asset === "string" ? constitution.prize_asset : null;
  } catch {
    return null;
  }
}
