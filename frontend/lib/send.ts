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

/**
 * The one failure a surface is expected to recognise and act on.
 *
 * Compared by identity rather than by matching words, so the sentence can be
 * reworded without silently turning the offer to fix it off.
 */
export const UNFUNDED =
  "This wallet has no account on this network yet. On testnet that is one press away.";

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

      A wallet with no account on this network fails here, and it used to fail
      as the SDK's own words: "Account not found: G…". That is the first thing
      anybody hits with a fresh wallet, and it reads as the product being broken
      rather than as the one thing they have to do. It is also the same message
      whether the account was never funded or the wallet is pointed at the wrong
      network, so the sentence has to cover both.
    */
    let account;

    try {
      account = await server.getAccount(from);
    } catch (thrown) {
      if (/not found/i.test(thrown instanceof Error ? thrown.message : String(thrown))) {
        return { ok: false, why: UNFUNDED, refused: false };
      }

      throw thrown;
    }

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
    const signed = await signTransaction(prepared.toXDR(), from);

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
 * Put a new contract on the chain from a hash that is already up there.
 *
 * A hackathon is one instance of the core and one of the vault, deployed per
 * event rather than shared, so the wasm is uploaded once and instantiated many
 * times. The salt makes the address, and a random one means two organizers
 * pressing the same button in the same second do not collide.
 */
export async function deploy(
  wasmHash: string,
  constructorArgs: Arg[],
  from: string,
): Promise<Sent & { contractId?: string }> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return { ok: false, why: "this deployment is not pointed at a network", refused: false };
  }

  try {
    const [{ Operation, TransactionBuilder, BASE_FEE, Address, hash }, rpc, { signTransaction }] =
      await Promise.all([
        import("@stellar/stellar-sdk/base"),
        import("@stellar/stellar-sdk/rpc"),
        import("./wallet"),
      ]);

    const server = new rpc.Server(rpcUrl);

    let account;

    try {
      account = await server.getAccount(from);
    } catch (thrown) {
      if (/not found/i.test(thrown instanceof Error ? thrown.message : String(thrown))) {
        return { ok: false, why: UNFUNDED, refused: false };
      }

      throw thrown;
    }

    const salt = crypto.getRandomValues(new Uint8Array(32));

    const built = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: passphrase,
    })
      .addOperation(
        Operation.createCustomContract({
          address: Address.fromString(from),
          wasmHash: Buffer.from(wasmHash, "hex"),
          salt: Buffer.from(salt),
          constructorArgs: constructorArgs.map((a) => a.value),
        }),
      )
      .setTimeout(180)
      .build();

    const simulated = await server.simulateTransaction(built);

    if (rpc.Api.isSimulationError(simulated)) {
      return { ok: false, why: readable(simulated.error), refused: false };
    }

    const prepared = rpc.assembleTransaction(built, simulated).build();
    const signed = await signTransaction(prepared.toXDR(), from);
    const sent = await server.sendTransaction(TransactionBuilder.fromXDR(signed, passphrase));

    if (sent.status === "ERROR") {
      return { ok: false, why: readable(JSON.stringify(sent.errorResult)), refused: false };
    }

    const settled = await server.pollTransaction(sent.hash, {
      attempts: 30,
      sleepStrategy: () => 1000,
    });

    if (settled.status !== "SUCCESS") {
      return { ok: false, why: readable(String(settled.status)), refused: false };
    }

    /* The new address comes back in the result rather than being derivable
       from anything the caller already had, so it is read out here rather than
       left for the caller to hunt for. */
    const created = settled.returnValue;
    const contractId =
      created === undefined ? undefined : Address.fromScVal(created as never).toString();

    void hash;

    return { ok: true, hash: sent.hash, ...(contractId === undefined ? {} : { contractId }) };
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
  32: "this stage's deadline has not passed yet",
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

  /* The network's own verdicts, which arrive as a word inside a line of JSON.
     They are about the envelope rather than about the contract, so none of them
     are in the error enum above, and printed raw they read as a crash. */
  for (const [word, meaning] of Object.entries(verdicts)) {
    if (raw.includes(word)) {
      return meaning;
    }
  }

  return raw.length > 200 ? `${raw.slice(0, 197)}…` : raw;
}

/**
 * What the network says when it refuses the envelope rather than the call.
 *
 * `tx_bad_auth` is the one that matters here and it has two causes, both of
 * them a setting: the wallet signed with a different account than the one this
 * page is connected as, or it signed against a different network. The signature
 * is real in both cases, which is why nothing earlier catches it.
 */
const verdicts: Record<string, string> = {
  tx_bad_auth:
    "The wallet signed as a different account, or on a different network, than this transaction was built for. Check which account is selected in your wallet and that it is on the same network as this site.",
  tx_bad_auth_extra: "The wallet added a signature this transaction did not ask for.",
  tx_bad_seq: "Something else signed from this account at the same time. Try again.",
  tx_insufficient_fee: "The network is busy and the fee offered was too low. Try again.",
  tx_insufficient_balance: "This account cannot cover the fee.",
  tx_too_late: "This transaction sat unsigned for too long. Try again.",
  tx_no_source_account: UNFUNDED,
};

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

  /** A moment, which the contract keeps in seconds since the epoch. */
  async u64(value: bigint): Promise<Arg> {
    const { nativeToScVal } = await import("@stellar/stellar-sdk/base");
    return { value: nativeToScVal(value, { type: "u64" }) };
  },

  async i128(value: bigint): Promise<Arg> {
    const { nativeToScVal } = await import("@stellar/stellar-sdk/base");
    return { value: nativeToScVal(value, { type: "i128" }) };
  },

  async bytes32(value: Uint8Array): Promise<Arg> {
    const { xdr } = await import("@stellar/stellar-sdk/base");
    return { value: xdr.ScVal.scvBytes(Buffer.from(value)) };
  },
};

/**
 * Ask friendbot for an account, which is how a testnet wallet becomes usable.
 *
 * Only ever reachable from the message above, so a wallet that already has an
 * account never sees it offered. Friendbot exists on testnet and nowhere else;
 * on any other network the offer is not made, because there is nothing this
 * could call.
 */
export async function fund(address: string): Promise<Sent> {
  if (!onTestnet()) {
    return { ok: false, why: "this network has no faucet", refused: false };
  }

  try {
    const answer = await fetch(`https://friendbot.stellar.org?addr=${address}`);

    /* Already funded comes back as 400, and it is the outcome the caller wanted
       rather than a failure to report. */
    if (!answer.ok && answer.status !== 400) {
      return { ok: false, why: `the faucet refused: ${answer.status}`, refused: false };
    }

    return { ok: true, hash: "" };
  } catch (thrown) {
    return refusal(thrown);
  }
}

export function onTestnet(): boolean {
  return passphrase === "Test SDF Network ; September 2015";
}
