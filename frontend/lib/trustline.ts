/**
 * Whether an account can receive the prize at all.
 *
 * Stellar will not put an issued asset into an account that has not accepted
 * it first. The contract knows: `settle_prize` pays one member at a time
 * precisely so that one unprepared winner cannot fail the transfer for their
 * whole team. But it can still fail for them, and until now the product's
 * answer to that was a raw contract error on the row belonging to the person
 * least in the mood for one.
 *
 * So this is asked before the money moves rather than diagnosed after it did
 * not. Two calls: does this account hold the asset, and add it if not.
 *
 * Native XLM needs none of this, and saying so early matters — every hackathon
 * on the network today pays in XLM, so the common answer is "nothing to do".
 */

const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

/** What a prize asset turns out to be, once its contract has been asked. */
export type PrizeAsset =
  | { kind: "native" }
  | { kind: "issued"; code: string; issuer: string }
  /* A token contract that is not a wrapped classic asset. Nothing to accept
     and nothing an anchor could redeem; named so callers stop rather than
     guess. */
  | { kind: "contract" };

/**
 * What the constitution's `prize_asset` actually is.
 *
 * Every classic asset has a contract, and that contract answers `name()` with
 * `CODE:ISSUER`, or `native`. Asking the contract rather than deriving it the
 * other way round is deliberate: the address is what the constitution froze,
 * and anything we computed from a code and an issuer would be our claim about
 * that address rather than the address itself.
 */
export async function assetOf(contractId: string): Promise<PrizeAsset> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return { kind: "contract" };
  }

  const [{ Account, BASE_FEE, Contract, TransactionBuilder, scValToNative }, rpc] =
    await Promise.all([
      import("@stellar/stellar-sdk/base"),
      import("@stellar/stellar-sdk/rpc"),
    ]);

  const server = new rpc.Server(rpcUrl);
  const nobody = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");

  const built = new TransactionBuilder(nobody, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(new Contract(contractId).call("name"))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(built);

  if (rpc.Api.isSimulationError(simulated) || simulated.result === undefined) {
    return { kind: "contract" };
  }

  const name = String(scValToNative(simulated.result.retval));

  if (name === "native") {
    return { kind: "native" };
  }

  /* `CODE:ISSUER`, and both halves are checked rather than trusted. This value
     comes off the chain, but it reaches `Asset`, which builds the ledger key a
     trustline is read and written with; a malformed half would fail there with
     a message about encoding rather than about the asset. */
  const [code, issuer] = name.split(":");

  if (
    code === undefined ||
    issuer === undefined ||
    !/^[A-Za-z0-9]{1,12}$/.test(code) ||
    !/^G[A-Z2-7]{55}$/.test(issuer)
  ) {
    return { kind: "contract" };
  }

  return { kind: "issued", code, issuer };
}

/**
 * Does this account already hold the asset.
 *
 * Read as a ledger entry rather than as a balance. A balance of zero is what an
 * accepted asset nobody has been paid in looks like, and also what an asset the
 * account cannot receive at all looks like; only the entry tells them apart.
 *
 * Read over the Soroban RPC, which serves classic ledger entries as well, so
 * this needs no second endpoint and no second thing to configure.
 */
export async function holds(address: string, asset: PrizeAsset): Promise<boolean> {
  if (asset.kind !== "issued") {
    /* Native needs no trustline, and a plain token contract has none to hold. */
    return true;
  }

  if (rpcUrl === undefined) {
    return true;
  }

  const [{ Asset, StrKey, xdr }, rpc] = await Promise.all([
    import("@stellar/stellar-sdk/base"),
    import("@stellar/stellar-sdk/rpc"),
  ]);

  try {
    const key = xdr.LedgerKey.trustline(
      new xdr.LedgerKeyTrustLine({
        accountId: xdr.PublicKey.publicKeyTypeEd25519(StrKey.decodeEd25519PublicKey(address)),
        asset: new Asset(asset.code, asset.issuer).toTrustLineXDRObject(),
      }),
    );

    const found = await new rpc.Server(rpcUrl).getLedgerEntries(key);

    return found.entries.length > 0;
  } catch {
    /*
      Read as held rather than as missing.

      An unreachable network is not evidence that somebody is unprepared, and
      the cost of the two mistakes is not the same: a warning nobody needed is
      noise, while hiding the prize behind a step they have already taken is a
      product telling a winner they cannot be paid when they can.
    */
    return true;
  }
}

/**
 * Accept the asset, so the account can be paid in it.
 *
 * A classic operation rather than a contract call, so it is built and sent
 * without simulation: there is nothing to simulate and `assembleTransaction`
 * has no footprint to add. The wallet signs it like anything else.
 *
 * No limit is set, which means the maximum. A limit is a promise about how much
 * of an asset somebody is willing to hold, and a prize is not a number the
 * winner knows in advance.
 */
export async function accept(address: string, asset: PrizeAsset): Promise<Accepted> {
  if (asset.kind !== "issued") {
    return { ok: true };
  }

  if (rpcUrl === undefined || passphrase === undefined) {
    return { ok: false, why: "this deployment is not pointed at a network", refused: false };
  }

  try {
    const [{ Asset, BASE_FEE, Operation, TransactionBuilder }, rpc, { signTransaction }] =
      await Promise.all([
        import("@stellar/stellar-sdk/base"),
        import("@stellar/stellar-sdk/rpc"),
        import("./wallet"),
      ]);

    const server = new rpc.Server(rpcUrl);
    const account = await server.getAccount(address);

    const built = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
      .addOperation(Operation.changeTrust({ asset: new Asset(asset.code, asset.issuer) }))
      .setTimeout(120)
      .build();

    const signed = await signTransaction(built.toXDR());
    const sent = await server.sendTransaction(TransactionBuilder.fromXDR(signed, passphrase));

    if (sent.status === "ERROR") {
      return { ok: false, why: reason(JSON.stringify(sent.errorResult)), refused: false };
    }

    const settled = await server.pollTransaction(sent.hash, {
      attempts: 30,
      sleepStrategy: () => 1000,
    });

    if (settled.status !== "SUCCESS") {
      return { ok: false, why: reason(String(settled.status)), refused: false };
    }

    return { ok: true };
  } catch (thrown) {
    const said = thrown instanceof Error ? thrown.message : String(thrown);

    return {
      ok: false,
      why: reason(said),
      refused: /reject|denied|declined|cancel|user closed/i.test(said),
    };
  }
}

export type Accepted = { ok: true } | { ok: false; why: string; refused: boolean };

/**
 * The two ways this fails that a person can act on.
 *
 * Accepting an asset raises the account's minimum balance by half a lumen, so
 * an account with nothing in it cannot accept anything — which is exactly the
 * account a first time winner arrives with. Said in those words rather than as
 * `tx_insufficient_balance`.
 */
function reason(raw: string): string {
  if (/low_reserve|insufficient_balance|underfunded/i.test(raw)) {
    return "This wallet needs a little XLM to accept an asset. Around one lumen is enough.";
  }

  if (/not found|account_not_found/i.test(raw)) {
    return "This wallet has no account on this network yet.";
  }

  return raw.length > 160 ? `${raw.slice(0, 157)}…` : raw;
}
