/**
 * The teams in a hackathon, read from the contract that holds them.
 *
 * Team membership decides who gets paid, so it lives on chain and is read from
 * there rather than from our tables. The indexer keeps a copy for search and
 * listing, but a page that offers somebody a place on a team asks the contract
 * how many seats are left, because a stale count is how two people are told
 * there is one seat and both take it.
 */

const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

export interface Team {
  id: number;
  /** Whoever founded it, and the only address that can admit anybody. */
  captain: string;
  members: string[];
}

export interface Roster {
  teams: Team[];
  /** From the frozen rules, so a full team is full for a reason anybody can read. */
  maxSize: number;
  /** Whether somebody already on a team may join a second one. */
  multiTeamAllowed: boolean;
}

/** Whether this team can still take anybody. */
export function hasRoom(team: Team, maxSize: number): boolean {
  return team.members.length < maxSize;
}

/** Whether this address is already on this team. */
export function isOn(team: Team, address: string): boolean {
  return team.members.includes(address);
}

/**
 * Every team in the event, in the order they were founded.
 *
 * `team_count` and `team_by_id` are asked one after another because the
 * contract has no call that returns them all. That is fine at the size a
 * hackathon actually reaches and would not be at ten thousand; if it ever is,
 * this is the function that moves to the indexer's copy.
 */
export async function rosterOf(contractId: string): Promise<Roster | null> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return null;
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
    return null;
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

  const [count, constitution] = await Promise.all([
    ask("team_count").catch(() => 0),
    ask("constitution").catch(() => null),
  ]);

  const total = Number(count ?? 0);
  const teams = (
    await Promise.all(
      Array.from({ length: total }, (_, at) => at + 1).map(async (id) => {
        const raw = await ask("team_by_id", nativeToScVal(id, { type: "u32" })).catch(() => null);

        if (raw === null) {
          return null;
        }

        const team = raw as { id?: unknown; captain?: unknown; members?: unknown };

        return {
          id: Number(team.id ?? id),
          captain: String(team.captain ?? ""),
          members: Array.isArray(team.members) ? team.members.map(String) : [],
        };
      }),
    )
  ).filter((team): team is Team => team !== null);

  const rules = (constitution ?? {}) as { teams?: Record<string, unknown> };
  const policy = rules.teams ?? {};

  return {
    teams,
    maxSize: Number(policy["max_size"] ?? 0),
    multiTeamAllowed: policy["multi_team_allowed"] === true,
  };
}
