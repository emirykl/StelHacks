/**
 * Where one person stands in one hackathon, read from the contract.
 *
 * Not from our database. The steps below decide what somebody is offered next,
 * and offering the wrong one wastes a signature and a fee. The indexer is
 * usually right and is allowed to be a few seconds behind; the contract is
 * never behind itself.
 *
 * Everything here is a read. Nothing signs and nothing costs anything, so it
 * runs on load rather than behind a button.
 */

const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

/** The application, as the contract records it. */
export type Application = "none" | "pending" | "approved" | "rejected";

export interface Standing {
  /** The phase the contract is in, which decides whether any of this is open. */
  phase: number | null;
  application: Application;
  /** The teams this address belongs to. Empty until one is created or joined. */
  teams: number[];
  /** Whether the team already has a project recorded. */
  submitted: boolean;
}

const statuses: Record<number, Application> = {
  0: "pending",
  1: "approved",
  2: "rejected",
};

export async function standingOf(contractId: string, address: string): Promise<Standing> {
  const blank: Standing = { phase: null, application: "none", teams: [], submitted: false };

  if (rpcUrl === undefined || passphrase === undefined) {
    return blank;
  }

  const [{ Account, Address, Contract, TransactionBuilder, BASE_FEE, scValToNative }, rpc] =
    await Promise.all([
      import("@stellar/stellar-sdk/base"),
      import("@stellar/stellar-sdk/rpc"),
    ]);

  const server = new rpc.Server(rpcUrl);
  const contract = new Contract(contractId);

  /* Reads only, so the source account is never touched and need not exist. */
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

  const who = new Address(address).toScVal();

  /*
    A refusal is an answer here. The contract throws NotFound for somebody who
    has never applied, which is exactly the state the first step needs to know
    about, so each read falls back rather than failing the whole page.
  */
  const [phase, registration, membership] = await Promise.all([
    /* From the contract, not from our database. The indexer is allowed to be
       behind, and a page that hides the apply button because our copy of the
       phase has not caught up is a page that closes registration on people
       the contract would have let in. */
    ask("phase").catch(() => null),
    ask("registration", who).catch(() => null),
    ask("membership", who).catch(() => null),
  ]);

  const application =
    registration === null
      ? "none"
      : (statuses[Number((registration as { status?: unknown }).status ?? -1)] ?? "none");

  const teams = Array.isArray(membership) ? membership.map(Number) : [];

  const submitted =
    teams.length === 0
      ? false
      : await ask("submission", await u32(teams[0]!)).then(
          () => true,
          () => false,
        );

  return { phase: phase === null ? null : Number(phase), application, teams, submitted };

  async function u32(value: number) {
    const { nativeToScVal } = await import("@stellar/stellar-sdk/base");
    return nativeToScVal(value, { type: "u32" });
  }
}

/**
 * The digest the contract stores for a submission.
 *
 * The contract keeps a hash and a link, not the project. Hashing here rather
 * than on a server is the point: what gets pinned is what the person's own
 * browser saw, and anybody can recompute it from the same fields later.
 */
export async function metadataHash(fields: Record<string, string>): Promise<Uint8Array> {
  /* Sorted, so the same project always hashes the same way whatever order a
     form happened to fill the object in. */
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))),
  );

  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);

  return new Uint8Array(digest);
}
