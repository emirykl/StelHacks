/**
 * Writing to the chain from somebody's own browser.
 *
 * Every surface that asks a person to do something ends up here: apply, form a
 * team, submit a project, lock the rules, advance a phase. All of them are the
 * same four steps, and the reason they live in one place is that three of the
 * four are easy to get subtly wrong.
 *
 *   Build the call, ask the network what it would cost, have the wallet sign
 *   it, send it and wait for the ledger to close.
 *
 * The wallet signs. Nothing here ever holds a key, and no key reaches this
 * site: the kit hands the transaction to the extension and gets bytes back.
 *
 * Arguments arrive already encoded, through `arg` below. The SDK's generated
 * spec would encode them from plain objects, but it is built from the wasm and
 * is not committed, so a clean checkout could not compile against it. Every
 * call a person makes takes primitives anyway, and naming the type at the call
 * site is clearer than a layer that infers it.
 */

const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

/** What happened, in a shape a surface can render without guessing. */
export type Sent =
  | { ok: true; hash: string }
  | { ok: false; why: string; refused: boolean };

/**
 * Run one contract call and wait for it to be final.
 *
 * `from` is the address that signs, and it has to be the same one the contract
 * will check. Passing a different address produces a simulation that fails for
 * a reason nobody can read, so it is required rather than inferred.
 */
export async function send(
  contractId: string,
  method: string,
  args: Arg[],
  from: string,
): Promise<Sent> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return { ok: false, why: "this deployment is not pointed at a network", refused: false };
  }

  try {
    const [{ Contract, TransactionBuilder, BASE_FEE }, rpc, { signTransaction }] =
      await Promise.all([
        import("@stellar/stellar-sdk/base"),
        import("@stellar/stellar-sdk/rpc"),
        import("./wallet"),
      ]);

    const server = new rpc.Server(rpcUrl);

    /*
      The sequence number comes from the network rather than from a guess. A
      stale one fails at submission with an error about sequence numbers, which
      tells the person nothing about what they were trying to do.
    */
    const account = await server.getAccount(from);

    const built = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: passphrase,
    })
      .addOperation(new Contract(contractId).call(method, ...args.map((a) => a.value)))
      .setTimeout(180)
      .build();

    /*
      Simulation is not optional and not only a cost estimate. It is also where
      a call that would fail says so before anybody signs anything, which is the
      difference between "the deadline passed" and a spent fee.
    */
    const simulated = await server.simulateTransaction(built);

    if (rpc.Api.isSimulationError(simulated)) {
      return { ok: false, why: readable(simulated.error), refused: false };
    }

    const prepared = rpc.assembleTransaction(built, simulated).build();
    const signed = await signTransaction(prepared.toXDR());

    const sent = await server.sendTransaction(
      TransactionBuilder.fromXDR(signed, passphrase),
    );

    if (sent.status === "ERROR") {
      return { ok: false, why: readable(JSON.stringify(sent.errorResult)), refused: false };
    }

    /*
      Waiting rather than reporting the moment it is accepted. A hash the
      network has not yet applied is not a thing that happened, and a page that
      says "submitted" before the ledger closes is a page that will sometimes be
      wrong about the one fact it exists to report.
    */
    const settled = await server.pollTransaction(sent.hash, {
      attempts: 30,
      sleepStrategy: () => 1000,
    });

    if (settled.status !== "SUCCESS") {
      return { ok: false, why: readable(String(settled.status)), refused: false };
    }

    return { ok: true, hash: sent.hash };
  } catch (thrown) {
    return refusal(thrown);
  }
}

/**
 * The kit's own words for "the person said no".
 *
 * Declining in the wallet is not an error to apologise for, and a surface needs
 * to tell the two apart so it can stay quiet about one and explain the other.
 */
function refusal(thrown: unknown): Sent {
  const said = thrown instanceof Error ? thrown.message : String(thrown);
  const declined = /reject|denied|declined|cancel|user closed/i.test(said);

  return { ok: false, why: said, refused: declined };
}

/**
 * Contract errors arrive as `Error(Contract, #33)` and mean nothing to anybody.
 *
 * The numbers are the enum in `errors.rs`, and the ones a participant can
 * actually hit are worth translating. Anything unmapped is passed through
 * rather than replaced by a friendly guess, because a wrong explanation is
 * worse than a raw one.
 */
const meanings: Record<number, string> = {
  3: "this wallet is not allowed to do that",
  30: "the hackathon is not at the stage where this is allowed",
  32: "this has not opened yet",
  33: "the deadline for this has passed",
  40: "the contract has no record of that",
  41: "you have already applied",
  42: "your application has not been approved yet",
  44: "this submission is not eligible",
};

function readable(raw: string): string {
  const code = /Error\(Contract, #(\d+)\)/.exec(raw);

  if (code !== null) {
    const meaning = meanings[Number(code[1])];

    if (meaning !== undefined) {
      return meaning;
    }
  }

  return raw.length > 200 ? `${raw.slice(0, 197)}…` : raw;
}

/**
 * An argument, with its contract type named at the call site.
 *
 * `nativeToScVal` guesses when it is not told, and its guesses are reasonable
 * and wrong in exactly the places that matter: a number becomes an i128 rather
 * than the u32 a team id is, and a string becomes a String rather than the
 * Symbol a track name is. Both encode fine and both fail at the contract with
 * an error about types. So every one is named.
 */
export interface Arg {
  value: import("@stellar/stellar-sdk/base").xdr.ScVal;
}

export const arg = {
  async address(value: string): Promise<Arg> {
    const { Address } = await import("@stellar/stellar-sdk/base");
    return { value: new Address(value).toScVal() };
  },

  async u32(value: number): Promise<Arg> {
    const { nativeToScVal } = await import("@stellar/stellar-sdk/base");
    return { value: nativeToScVal(value, { type: "u32" }) };
  },

  async symbol(value: string): Promise<Arg> {
    const { nativeToScVal } = await import("@stellar/stellar-sdk/base");
    return { value: nativeToScVal(value, { type: "symbol" }) };
  },

  async text(value: string): Promise<Arg> {
    const { nativeToScVal } = await import("@stellar/stellar-sdk/base");
    return { value: nativeToScVal(value, { type: "string" }) };
  },

  async bytes32(value: Uint8Array): Promise<Arg> {
    const { xdr } = await import("@stellar/stellar-sdk/base");
    return { value: xdr.ScVal.scvBytes(Buffer.from(value)) };
  },
};
