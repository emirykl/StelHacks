/**
 * Who has applied, read from the chain's own event log.
 *
 * The contract can answer "what is this person's application" but has no call
 * that lists them, because a contract that kept an ever growing list would pay
 * rent on it forever. The list lives in the events instead.
 *
 * Our database does not have it either: `participants` records who was let in,
 * not who is waiting. So the organizer's queue is built here, from `Applied`
 * events, and each one is then asked about individually. That is slower than a
 * table would be and it is the honest source: an application the organizer
 * cannot see is an application that was never made.
 */

const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

export interface Applicant {
  address: string;
  status: "pending" | "approved" | "rejected";
}

const statuses = ["pending", "approved", "rejected"] as const;

export async function applicantsOf(contractId: string): Promise<Applicant[]> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return [];
  }

  const [{ Account, Address, Contract, TransactionBuilder, BASE_FEE, scValToNative }, rpc] =
    await Promise.all([
      import("@stellar/stellar-sdk/base"),
      import("@stellar/stellar-sdk/rpc"),
    ]);

  const server = new rpc.Server(rpcUrl);

  /*
    Events are only kept for a window, about seven days on testnet, so an
    application older than that is invisible here. That limit is why the
    indexer exists; until it records applications this is the only list there
    is, and an organizer should know it can be short rather than complete.
  */
  const { oldestLedger } = await server.getHealth();

  let cursor: string | undefined;
  const seen = new Set<string>();

  /*
    An empty page is not the end of the log.

    `getEvents` scans a bounded slice of ledgers per call, around ten thousand,
    and returns a cursor for where it stopped whether or not it found anything.
    Stopping at the first empty page means stopping a few hours into a seven day
    window, which is how the first version of this reported no applications on a
    contract that had them. The cursor is followed until it runs out.
  */
  for (let pass = 0; pass < 24; pass += 1) {
    const page = await server.getEvents({
      ...(cursor === undefined ? { startLedger: oldestLedger } : { cursor }),
      filters: [{ type: "contract", contractIds: [contractId] }],
      limit: 200,
    });

    for (const event of page.events) {
      /* The event name is the first topic and the applicant the second. The
         names are the contract's own, which are snake case rather than the
         Rust type names: `Applied` publishes as `applied`. */
      const [name, who] = event.topic;

      if (name === undefined || who === undefined) {
        continue;
      }

      try {
        if (scValToNative(name) !== "applied") {
          continue;
        }

        seen.add(String(scValToNative(who)));
      } catch {
        continue;
      }
    }

    if (page.cursor === undefined) {
      break;
    }

    cursor = page.cursor;
  }

  const contract = new Contract(contractId);
  const nobody = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");

  /* The event says somebody applied. What came of it is a separate question,
     because an approval is a different event and reading two logs against each
     other is how a queue ends up showing somebody who was let in a week ago. */
  const found = await Promise.all(
    [...seen].map(async (address): Promise<Applicant | null> => {
      try {
        const tx = new TransactionBuilder(nobody, {
          fee: BASE_FEE,
          networkPassphrase: passphrase,
        })
          .addOperation(contract.call("registration", new Address(address).toScVal()))
          .setTimeout(30)
          .build();

        const simulated = await server.simulateTransaction(tx);

        if (rpc.Api.isSimulationError(simulated) || simulated.result === undefined) {
          return null;
        }

        const registration = scValToNative(simulated.result.retval) as { status?: unknown };
        const status = statuses[Number(registration.status ?? -1)];

        return status === undefined ? null : { address, status };
      } catch {
        return null;
      }
    }),
  );

  return found.filter((applicant): applicant is Applicant => applicant !== null);
}

/**
 * The digest of a written refusal.
 *
 * The contract will not take a rejection without one. What it stores is the
 * hash; the words live wherever the organizer put them, and this proves which
 * words were given.
 */
export async function reasonHash(reason: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(reason);
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);

  return new Uint8Array(digest);
}
