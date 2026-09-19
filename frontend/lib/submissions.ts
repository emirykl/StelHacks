/**
 * The projects, read straight from the contract.
 *
 * Unlike the applications queue this needs no event scanning: teams are
 * numbered from one and the contract will say how many there are, so the list
 * is a bounded walk rather than a crawl back through a week of ledgers. It is
 * therefore fast enough to sit on a public page, which is where it belongs.
 *
 * What comes back is a link and a digest, not the project. The contract stores
 * the hash of what was said about a submission so the words can live anywhere
 * and still be shown to be the words that were pinned.
 */

const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

export interface Entry {
  team: number;
  track: string;
  uri: string;
  /** Hex, no prefix. What the contract pinned about this project. */
  digest: string;
  members: string[];
  /** Set once the organizer has struck it out during screening. */
  invalid: boolean;
}

export async function entriesOf(
  contractId: string,
  /**
   * Whether the team roster is wanted.
   *
   * It is another round trip per team and only two surfaces show it. A judge
   * scores a project, not a list of people, and was paying for a call whose
   * answer was thrown away.
   */
  withRoster = true,
): Promise<Entry[]> {
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

  const count = await ask("team_count").catch(() => 0);
  const teams = Number(count);

  if (!Number.isFinite(teams) || teams <= 0) {
    return [];
  }

  const found = await Promise.all(
    Array.from({ length: teams }, (_, index) => index + 1).map(
      async (team): Promise<Entry | null> => {
        const id = nativeToScVal(team, { type: "u32" });

        /* A team with no project yet throws rather than returning nothing, so
           the absence is caught here and read as "has not submitted". */
        const submission = await ask("submission", id).catch(() => null);

        if (submission === null) {
          return null;
        }

        const entry = submission as {
          track?: unknown;
          uri?: unknown;
          metadata_hash?: unknown;
        };

        const [roster, disqualified] = await Promise.all([
          withRoster ? ask("team_by_id", id).catch(() => null) : null,
          /* Not an error state. The contract refuses this when no case was ever
             opened, which is the ordinary condition of an entry nobody has
             questioned. */
          ask("disqualification", id).catch(() => null),
        ]);

        const members = roster as { members?: unknown } | null;

        return {
          team,
          track: String(entry.track ?? ""),
          uri: String(entry.uri ?? ""),
          digest: hex(entry.metadata_hash),
          members: Array.isArray(members?.members) ? members.members.map(String) : [],
          invalid: disqualified !== null,
        };
      },
    ),
  );

  return found.filter((entry): entry is Entry => entry !== null);
}

/** A digest as a reader compares it, which is as text. */
function hex(value: unknown): string {
  if (!(value instanceof Uint8Array)) {
    return "";
  }

  let out = "";

  for (const byte of value) {
    out += byte.toString(16).padStart(2, "0");
  }

  return out;
}
