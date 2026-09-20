import { NextResponse } from "next/server";

import { currentUser } from "../../../lib/supabase/server";
import { signedByOrganizer } from "../../../lib/organizer";

/**
 * Naming a team, for the wallet the contract calls its captain.
 *
 * The name cannot be written straight from the browser, and the reason is an
 * ordering problem rather than a permission one. Row level security lets a team
 * write its own page by asking `team_members`, which the indexer fills in from
 * chain events — so in the seconds between founding a team and the indexer
 * seeing it, the captain is not yet a member of their own team and the write is
 * refused. Somebody naming the thing they just made would be told they are not
 * on it.
 *
 * So the check happens here instead, against the contract, which knew the
 * moment the transaction landed. The caller names a team, the handler reads
 * `team_by_id` off the chain, and the signature has to come from the captain
 * that comes back. Our tables are not consulted for the answer.
 *
 * Two things are checked and both are necessary. The session says which account
 * the name belongs to; the signature says the person at that account holds the
 * captain's key. A session alone is anybody with an account, and a signature
 * alone can be replayed by whoever captured it.
 */

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const serviceRole = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

interface Body {
  contract: string;
  teamId: number;
  name: string;
  /** Signed by the captain, over the challenge in `lib/organizer.ts`. */
  signature: string;
  /** Seconds since the epoch, from when the challenge was built. */
  issuedAt: number;
}

export async function POST(request: Request) {
  if (
    url === undefined ||
    serviceRole === undefined ||
    rpcUrl === undefined ||
    passphrase === undefined
  ) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const user = await currentUser();

  if (user === null) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  let body: Body;

  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "unreadable" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();

  if (name.length === 0 || name.length > 80) {
    return NextResponse.json({ error: "a name, up to eighty characters" }, { status: 400 });
  }

  const captain = await captainOf(body.contract, Number(body.teamId));

  if (captain === null) {
    return NextResponse.json({ error: "no such team" }, { status: 404 });
  }

  const proved = await signedByOrganizer({
    organizer: captain,
    contract: body.contract,
    account: user.id,
    issuedAt: Number(body.issuedAt),
    signature: String(body.signature ?? ""),
    purpose: "team",
  });

  if (!proved) {
    return NextResponse.json({ error: "not the captain" }, { status: 403 });
  }

  const written = await fetch(`${url}/rest/v1/teams?on_conflict=contract_id,team_id`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ contract_id: body.contract, team_id: Number(body.teamId), name }),
  });

  if (!written.ok) {
    return NextResponse.json({ error: (await written.text()).slice(0, 200) }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Who the chain says founded a team, or nothing when it says no such team.
 *
 * Simulated rather than read from our copy, because our copy is the thing this
 * route exists to work around.
 */
async function captainOf(contract: string, teamId: number): Promise<string | null> {
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return null;
  }

  const [{ Account, Contract, TransactionBuilder, BASE_FEE, nativeToScVal, scValToNative }, rpc] =
    await Promise.all([
      import("@stellar/stellar-sdk/base"),
      import("@stellar/stellar-sdk/rpc"),
    ]);

  try {
    const server = new rpc.Server(rpcUrl!);

    const tx = new TransactionBuilder(
      new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
      { fee: BASE_FEE, networkPassphrase: passphrase! },
    )
      .addOperation(
        new Contract(contract).call("team_by_id", nativeToScVal(teamId, { type: "u32" })),
      )
      .setTimeout(30)
      .build();

    const simulated = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simulated) || simulated.result === undefined) {
      return null;
    }

    const team = scValToNative(simulated.result.retval) as { captain?: unknown };

    return typeof team.captain === "string" ? team.captain : null;
  } catch {
    return null;
  }
}
