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

/**
 * Where to begin the walk, in ledgers.
 *
 * A day of margin on top of the estimate, because five seconds a ledger is an
 * average rather than a promise and an application missed is worse than a pass
 * wasted. Floored at what the node holds, since asking for a ledger it has
 * dropped is refused outright.
 */
function startAt(oldest: number, latest: number, createdAt?: string | null): number {
  if (createdAt == null) {
    return oldest;
  }

  const age = Date.now() - new Date(createdAt).getTime();

  if (!Number.isFinite(age) || age < 0) {
    return oldest;
  }

  const margin = 17_280;

  return Math.max(oldest, latest - Math.ceil(age / 5_000) - margin);
}

export interface Applicant {
  address: string;
  status: "pending" | "approved" | "rejected";
}

const statuses = ["pending", "approved", "rejected"] as const;

export async function applicantsOf(
  contractId: string,
  /**
   * When the hackathon was created, if we know.
   *
   * Without it the scan starts at the oldest ledger the node still holds, which
   * on testnet is about a week: twelve passes of ten thousand ledgers, almost
   * all of them over a chain that had never heard of this contract. A hackathon
   * created this morning needs one pass, and this is what says so.
   *
   * An estimate, and deliberately a generous one. Ledgers close about every
   * five seconds, so the arithmetic is close but not exact, and being early
   * costs a pass while being late loses an application. It is also floored at
   * whatever the node actually holds.
   */
  createdAt?: string | null,
): Promise<Applicant[]> {
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
  /* A node that will not answer leaves the queue empty rather than the page
     broken. Every caller of this renders a list; none of them can do anything
     useful with a thrown object from an RPC endpoint. */
  let oldestLedger: number;
  let latestLedger: number;

  try {
    const [health, latest] = await Promise.all([server.getHealth(), server.getLatestLedger()]);

    oldestLedger = health.oldestLedger;
    latestLedger = latest.sequence;
  } catch {
    return [];
  }

  const from = startAt(oldestLedger, latestLedger, createdAt);

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
    /*
      A failed page ends the scan rather than the page.

      The node refuses a `startLedger` it no longer holds, and it refuses it by
      throwing something that is not an `Error`: a bare object, which React
      renders as `[object Object]` across the whole screen. What is already in
      `seen` is still a true partial list, so the scan stops and the queue shows
      what it found.
    */
    let page;

    try {
      page = await server.getEvents({
        ...(cursor === undefined ? { startLedger: from } : { cursor }),
        filters: [{ type: "contract", contractIds: [contractId] }],
        limit: 200,
      });
    } catch {
      break;
    }

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
