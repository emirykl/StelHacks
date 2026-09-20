/**
 * Putting somebody on a team, which takes two signatures and one transaction.
 *
 * `add_member` calls `require_auth` on the captain and on the person joining.
 * The contract's own comment says why: the captain because it is their team and
 * their prize, the joiner because being put on a team can cost them the place
 * they meant to take. Neither can do it alone, and there is no upgrade path to
 * soften that.
 *
 * Two people at two keyboards cannot sign the same transaction at the same
 * moment, so Soroban's answer is that each address signs its own authorization
 * entry. This file is both halves of that. The joiner signs theirs when they
 * ask, which is when they are present and want it; the captain signs theirs by
 * being the source of the transaction that carries both.
 *
 * A signed entry carries a ledger it stops being valid at, so a request is not
 * an open offer. That is a feature rather than a wart: an authorization to join
 * a team, left signed and lying around for a month, is exactly the sort of thing
 * that should expire on its own.
 */

const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

/**
 * How long a request stays good for, in ledgers.
 *
 * Testnet closes a ledger about every five seconds, so this is roughly a day.
 * Long enough that a captain who reads their messages in the evening can still
 * act on the morning's requests, short enough that a signature nobody used does
 * not outlive the hackathon it was for.
 */
const GOOD_FOR = 17_280;

export interface Signed {
  /** The joiner's authorization entry, signed, as base64 XDR. */
  entry: string;
  /** The ledger it stops being valid at. */
  expiresAtLedger: number;
}

export interface Outcome {
  ok: boolean;
  /** Said in the person's own terms when it did not work. */
  why?: string;
}

/**
 * The joiner's half, signed.
 *
 * Simulated rather than hand built, because the entry has to match the exact
 * invocation the contract will see. Building one by hand and having it differ
 * by a field is a signature that verifies against nothing.
 */
export async function signJoin(
  contractId: string,
  teamId: number,
  member: string,
  captain: string,
): Promise<Signed | Outcome> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return { ok: false, why: "this deployment has no network configured" };
  }

  const [{ Address, Contract, TransactionBuilder, BASE_FEE, nativeToScVal, authorizeEntry }, rpc, wallet] =
    await Promise.all([
      import("@stellar/stellar-sdk/base"),
      import("@stellar/stellar-sdk/rpc"),
      import("./wallet"),
    ]);

  const server = new rpc.Server(rpcUrl);

  try {
    /*
      Simulated with the captain as source, not the joiner, and this is not a
      detail.

      Soroban reports the source account's own authorization as source-account
      credentials: no signature of its own, covered by the envelope instead.
      Simulating as the joiner therefore produces nothing the joiner can sign.
      Standing the captain in as the source gives the joiner an address
      credential, which is the thing that can be signed now and carried.
    */
    const source = await server.getAccount(captain);

    const built = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: passphrase })
      .addOperation(
        new Contract(contractId).call(
          "add_member",
          nativeToScVal(teamId, { type: "u32" }),
          new Address(member).toScVal(),
        ),
      )
      .setTimeout(180)
      .build();

    const simulated = await server.simulateTransaction(built);

    if (rpc.Api.isSimulationError(simulated)) {
      return { ok: false, why: reason(simulated.error) };
    }

    /* The one entry this address is asked to authorize. Found by address rather
       than by position, so it keeps working if the contract's auth tree ever
       changes shape. */
    const mine = (simulated.result?.auth ?? []).find(
      (entry) => inspect(entry).address === member,
    );

    if (mine === undefined) {
      return { ok: false, why: "the contract did not ask this address to authorize anything" };
    }

    const latest = await server.getLatestLedger();
    const expiresAtLedger = latest.sequence + GOOD_FOR;

    /* `forAddress` so the callback is only asked for this address's signature.
       The wallet takes the preimage and hands back the signature over it, which
       is exactly the shape SEP-43 defines and this callback expects. */
    const authorized = await authorizeEntry(
      mine,
      async (preimage) =>
        Buffer.from(await wallet.signAuthEntry(preimage.toXDR("base64")), "base64"),
      expiresAtLedger,
      passphrase,
      member,
    );

    return { entry: authorized.toXDR("base64"), expiresAtLedger };
  } catch (thrown) {
    return { ok: false, why: thrown instanceof Error ? thrown.message : "the wallet refused it" };
  }
}

/**
 * The captain's half, and the submission.
 *
 * The captain is the source of the transaction, so their own authorization
 * rides on the signature they give the envelope and needs no separate prompt.
 * The joiner's entry is the one they signed when they asked, dropped in where
 * simulation put a fresh unsigned one.
 */
export async function submitJoin(
  contractId: string,
  teamId: number,
  member: string,
  signedEntry: string,
  captain: string,
): Promise<Outcome> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return { ok: false, why: "this deployment has no network configured" };
  }

  const [
    {
      Address,
      Contract,
      Operation,
      TransactionBuilder,
      BASE_FEE,
      nativeToScVal,
      xdr,
      checkAuthEntryReadiness,
    },
    rpc,
    wallet,
  ] = await Promise.all([
    import("@stellar/stellar-sdk/base"),
    import("@stellar/stellar-sdk/rpc"),
    import("./wallet"),
  ]);

  const server = new rpc.Server(rpcUrl);

  try {
    const latest = await server.getLatestLedger();
    const joiner = xdr.SorobanAuthorizationEntry.fromXDR(signedEntry, "base64");

    /* Checked here as well as by the network. A refusal that arrives after a
       signature and a fee is a worse way to learn a request went stale. */
    const readiness = checkAuthEntryReadiness(joiner, latest.sequence);

    if (readiness.expired) {
      return {
        ok: false,
        why: "this request has expired, so the person who sent it has to ask again",
      };
    }

    if (!readiness.ready) {
      return { ok: false, why: "this request was never fully signed" };
    }

    const source = await server.getAccount(captain);

    /* A first pass, only to be told what the contract wants authorized. The
       joiner's entry from here is thrown away — theirs is the one they signed —
       but the captain's comes back as source-account credentials and is kept. */
    const asking = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: passphrase })
      .addOperation(
        new Contract(contractId).call(
          "add_member",
          nativeToScVal(teamId, { type: "u32" }),
          new Address(member).toScVal(),
        ),
      )
      .setTimeout(180)
      .build();

    const asked = await server.simulateTransaction(asking);

    if (rpc.Api.isSimulationError(asked)) {
      return { ok: false, why: reason(asked.error) };
    }

    const own = (asked.result?.auth ?? []).find((entry) => inspect(entry).address === null);

    if (own === undefined) {
      return { ok: false, why: "the captain's own authorization was not in the simulation" };
    }

    /*
      Both entries handed to the second simulation rather than swapped in after
      it, and this cost a failed transaction to learn.

      A signed entry carries a nonce, the nonce is a ledger entry, and the
      ledger entry has to be in the footprint. Simulating a bare call and
      replacing the entry afterwards produces a footprint built around the nonce
      simulation invented, while the transaction carries the nonce the joiner
      actually signed. The network rejects the mismatch.

      Both, not just the joiner's: a transaction that supplies its authorization
      explicitly is enforced against exactly that list, so leaving the captain
      out is the contract being told nobody authorized their half.
    */
    const built = new TransactionBuilder(await server.getAccount(captain), {
      fee: BASE_FEE,
      networkPassphrase: passphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: contractId,
          function: "add_member",
          args: [nativeToScVal(teamId, { type: "u32" }), new Address(member).toScVal()],
          auth: [joiner, own],
        }),
      )
      .setTimeout(180)
      .build();

    const simulated = await server.simulateTransaction(built);

    if (rpc.Api.isSimulationError(simulated)) {
      return { ok: false, why: reason(simulated.error) };
    }

    const prepared = rpc.assembleTransaction(built, simulated).build();

    const signed = await wallet.signTransaction(prepared.toXDR());
    const sent = await server.sendTransaction(
      TransactionBuilder.fromXDR(signed, passphrase) as never,
    );

    if (sent.status === "ERROR") {
      return { ok: false, why: "the network refused the transaction" };
    }

    const done = await server.pollTransaction(sent.hash, {
      attempts: 30,
      sleepStrategy: () => 1000,
    });

    if (done.status !== "SUCCESS") {
      return { ok: false, why: reason(String(done.status)) };
    }

    return { ok: true };
  } catch (thrown) {
    return { ok: false, why: thrown instanceof Error ? thrown.message : "the wallet refused it" };
  }
}

/**
 * Which address an entry is asking for, or nothing for a source account one.
 *
 * The SDK decodes this, so nothing here opens XDR by hand. An entry that cannot
 * be read at all is treated as belonging to nobody rather than throwing: the
 * caller is deciding which entry to replace, and one it does not recognise is
 * one it should leave alone.
 */
function inspect(entry: unknown): { address: string | null } {
  try {
    const { inspectAuthEntry } = require("@stellar/stellar-sdk/base") as {
      inspectAuthEntry: (given: never) => { address: string | null };
    };

    return inspectAuthEntry(entry as never);
  } catch {
    return { address: null };
  }
}

/**
 * A contract refusal, in the words of the thing that went wrong.
 *
 * The two that actually happen here are the team filling up between asking and
 * accepting, and the person having joined something else in the meantime. Both
 * are ordinary and neither is anybody's mistake, so neither is reported as an
 * error code.
 */
function reason(said: string): string {
  if (said.includes("#41") || said.includes("TeamFull")) {
    return "this team filled up before the request was accepted";
  }

  if (said.includes("#42") || said.includes("AlreadyOnTeam")) {
    return "they are already on a team in this hackathon";
  }

  return said.slice(0, 160);
}
