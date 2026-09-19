/**
 * The ranking and the payments, read from the contract.
 *
 * This is the part the whole product is an argument about, so it is read from
 * the one place that computed it. The contract ranks from the revealed scores
 * itself and refuses a ranking from anywhere else; showing our database's copy
 * here would quietly reintroduce the thing being ruled out.
 *
 * Every placement carries which step of the tie break decided it, because a
 * result that says only "second" invites the question this is supposed to
 * answer.
 */

const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

export interface Placement {
  team: number;
  rank: number;
  /** Held at full precision, as the contract holds it. Only display rounds. */
  finalScore: number;
  judgeAverage: number;
  community: number;
  /** Which step of the tie break chain settled this position. */
  decidedBy: number;
  /** Whether this position's prize has been handed over. */
  paid: boolean;
  members: string[];
}

export interface Results {
  track: string;
  places: Placement[];
}

/**
 * Which step separated two projects on the same score.
 *
 * Straight scoring is the ordinary case and needs no explanation; the rest are
 * the interesting ones, and naming them is the point of recording it.
 */
export const decisions = [
  "on score",
  "on the judges' score",
  "on one criterion",
  "on the community vote",
  "on who submitted first",
] as const;

export async function resultsOf(contractId: string, tracks: string[]): Promise<Results[]> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return [];
  }

  const [{ Account, Contract, TransactionBuilder, BASE_FEE, nativeToScVal, scValToNative }, rpc] =
    await Promise.all([
      import("@stellar/stellar-sdk/base"),
      import("@stellar/stellar-sdk/rpc"),
    ]);

  const server = new rpc.Server(rpcUrl);

  let contract: InstanceType<typeof Contract>;

  try {
    contract = new Contract(contractId);
  } catch {
    return [];
  }

  const nobody = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");

  async function ask(method: string, ...args: unknown[]): Promise<unknown> {
    const tx = new TransactionBuilder(nobody, { fee: BASE_FEE, networkPassphrase: passphrase })
      .addOperation(contract.call(method, ...(args as never[])))
      .setTimeout(30)
      .build();

    const simulated = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simulated) || simulated.result === undefined) {
      throw new Error("no answer");
    }

    return scValToNative(simulated.result.retval);
  }

  const found = await Promise.all(
    tracks.map(async (track): Promise<Results | null> => {
      const symbol = nativeToScVal(track, { type: "symbol" });

      /* Refused until the ranking exists, which is the ordinary state of a
         hackathon that has not reached finalization. */
      const ranking = await ask("ranking", symbol).catch(() => null);

      if (!Array.isArray(ranking) || ranking.length === 0) {
        return null;
      }

      const places = await Promise.all(
        ranking.map(async (raw): Promise<Placement> => {
          const placement = raw as Record<string, unknown>;
          const rank = Number(placement["rank"] ?? 0);
          const team = Number(placement["team"] ?? 0);

          const [paid, roster] = await Promise.all([
            ask("is_paid", symbol, nativeToScVal(rank, { type: "u32" })).catch(() => false),
            ask("team_by_id", nativeToScVal(team, { type: "u32" })).catch(() => null),
          ]);

          const members = roster as { members?: unknown } | null;

          return {
            team,
            rank,
            finalScore: Number(placement["final_score"] ?? 0),
            judgeAverage: Number(placement["judge_average"] ?? 0),
            community: Number(placement["community"] ?? 0),
            decidedBy: Number(placement["decided_by"] ?? 0),
            paid: paid === true,
            members: Array.isArray(members?.members) ? members.members.map(String) : [],
          };
        }),
      );

      return { track, places };
    }),
  );

  return found.filter((result): result is Results => result !== null);
}

/**
 * The track names, from the frozen rules.
 *
 * `ranking` has to be asked per track and the contract has no call that lists
 * them, so the constitution is read once and the names taken from it.
 */
export async function tracksOf(contractId: string): Promise<string[]> {
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

    return Array.isArray(constitution.tracks)
      ? constitution.tracks.map((track) => String((track as { id?: unknown }).id ?? ""))
      : [];
  } catch {
    return [];
  }
}
