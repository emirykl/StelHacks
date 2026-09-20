/**
 * The schedule in force, and how much room is left to move it.
 *
 * Two different schedules exist and telling them apart is the whole point. The
 * constitution holds the one that was announced and hashed; it never changes,
 * because a document that could be edited afterwards would not be worth
 * freezing. The state holds the one actually in force, which is the announced
 * one plus whatever extensions have been spent.
 *
 * A page showing an organizer their deadlines has to show the second, and a
 * page offering to move one has to show how much of the published allowance is
 * already gone. Both come from here.
 */

const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

/** The contract's own numbering, which is what `extend_deadline` takes. */
export const DEADLINES = [
  { at: 0, name: "Sign-ups close", field: "registration_closes_at" },
  { at: 1, name: "Build deadline", field: "submission_closes_at" },
  { at: 2, name: "Entry check ends", field: "screening_closes_at" },
  { at: 3, name: "Judging ends", field: "judging_closes_at" },
  { at: 4, name: "Community vote closes", field: "community_vote_closes_at" },
] as const;

export interface Moveable {
  /** The contract's `Deadline` discriminant. */
  at: number;
  name: string;
  /** Seconds since the epoch, as the schedule in force has it. */
  moment: number;
  /** How many times it has already been moved. */
  timesMoved: number;
  /** How many seconds it has already gained. */
  secondsAdded: number;
}

export interface Allowance {
  /** How many times one deadline may be moved. Zero forbids it outright. */
  times: number;
  /** The most seconds one deadline may gain across all of its moves. */
  seconds: number;
}

export interface Movable {
  deadlines: Moveable[];
  allowance: Allowance;
}

export async function scheduleOf(contractId: string): Promise<Movable | null> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return null;
  }

  const [{ Account, Contract, TransactionBuilder, BASE_FEE, nativeToScVal, scValToNative }, rpc] =
    await Promise.all([
      import("@stellar/stellar-sdk/base"),
      import("@stellar/stellar-sdk/rpc"),
    ]);

  const server = new rpc.Server(rpcUrl);
  const contract = new Contract(contractId);
  const nobody = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");

  async function ask(method: string, ...args: unknown[]): Promise<unknown> {
    const tx = new TransactionBuilder(nobody, { fee: BASE_FEE, networkPassphrase: passphrase })
      .addOperation(
        contract.call(
          method,
          ...args.map((value) => nativeToScVal(value, { type: "u32" })),
        ),
      )
      .setTimeout(30)
      .build();

    const simulated = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simulated) || simulated.result === undefined) {
      throw new Error("no answer");
    }

    return scValToNative(simulated.result.retval);
  }

  const [state, constitution] = await Promise.all([
    ask("state").catch(() => null),
    ask("constitution").catch(() => null),
  ]);

  if (state === null || constitution === null) {
    return null;
  }

  const schedule = (state as { schedule?: Record<string, unknown> }).schedule ?? {};
  const extensions = (constitution as { extensions?: Record<string, unknown> }).extensions ?? {};

  /* One read per deadline, and they are asked together. `extension_usage`
     answers for a deadline that has never moved as well, so nothing here has to
     tell "never moved" apart from "cannot be read". */
  const usage = await Promise.all(
    DEADLINES.map((deadline) => ask("extension_usage", deadline.at).catch(() => null)),
  );

  return {
    deadlines: DEADLINES.map((deadline, index) => {
      const spent = usage[index] as { times?: unknown; seconds_added?: unknown } | null;

      return {
        at: deadline.at,
        name: deadline.name,
        moment: Number(schedule[deadline.field] ?? 0),
        timesMoved: Number(spent?.times ?? 0),
        secondsAdded: Number(spent?.seconds_added ?? 0),
      };
    }),
    allowance: {
      times: Number(extensions["max_extensions_per_deadline"] ?? 0),
      seconds: Number(extensions["max_total_seconds_per_deadline"] ?? 0),
    },
  };
}
