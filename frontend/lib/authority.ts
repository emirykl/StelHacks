/**
 * Who the chain says is in charge, and what this server has already proved.
 *
 * Two handlers now need the same three answers — who the contract calls the
 * organizer, whether an address has already been proved to belong to an
 * account, and how to file a proof once it has been checked — and an
 * authorisation check copied into a second file is an authorisation check that
 * will be fixed in one of them.
 *
 * Every function here holds the service role. Nothing in it may be imported
 * into a client component: the key would be inlined into the bundle, and the
 * one guard against that is that only route handlers reach for this file.
 */

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const serviceRole = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

/** Whether this deployment holds the key these writes need at all. */
export function canWrite(): boolean {
  return url !== undefined && serviceRole !== undefined;
}

/** Who the contract says runs this hackathon. */
export async function organizerOf(contract: string): Promise<string | null> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return null;
  }

  const [{ Account, Contract, TransactionBuilder, BASE_FEE, scValToNative }, rpc] =
    await Promise.all([
      import("@stellar/stellar-sdk/base"),
      import("@stellar/stellar-sdk/rpc"),
    ]);

  try {
    const tx = new TransactionBuilder(
      new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
      { fee: BASE_FEE, networkPassphrase: passphrase },
    )
      .addOperation(new Contract(contract).call("team"))
      .setTimeout(30)
      .build();

    const simulated = await new rpc.Server(rpcUrl).simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simulated) || simulated.result === undefined) {
      return null;
    }

    const team = scValToNative(simulated.result.retval) as { organizer?: unknown };

    return typeof team.organizer === "string" ? team.organizer : null;
  } catch {
    return null;
  }
}

/**
 * Whether this address has already been proved to belong to this account.
 *
 * A row in `wallet_links` is written by the challenge verifier and by nothing
 * else: no client role has an insert grant on it. Its existence is a signature
 * that was checked, kept, so it stands in for one now.
 *
 * Read as the service role rather than as the reader, because the check must
 * not depend on a policy that might later hide the row from them.
 */
export async function linkedToAccount(address: string, account: string): Promise<boolean> {
  if (!canWrite()) {
    return false;
  }

  const answer = await fetch(
    `${url}/rest/v1/wallet_links?address=eq.${address}&profile_id=eq.${account}&select=address`,
    { headers: { apikey: serviceRole!, Authorization: `Bearer ${serviceRole!}` } },
  ).catch(() => null);

  if (answer === null || !answer.ok) {
    return false;
  }

  const rows = (await answer.json().catch(() => [])) as unknown[];

  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Files a proved address against the account that proved it.
 *
 * Ignored on conflict rather than overwritten: an address already linked to
 * somebody is not something a second person gets to claim by signing, and the
 * caller has nothing to do about it either way.
 */
export async function rememberLink(address: string, account: string): Promise<void> {
  if (!canWrite()) {
    return;
  }

  await fetch(`${url}/rest/v1/wallet_links`, {
    method: "POST",
    headers: {
      apikey: serviceRole!,
      Authorization: `Bearer ${serviceRole!}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates",
    },
    body: JSON.stringify({ address, profile_id: account }),
  }).catch(() => null);
}
