import { NextResponse } from "next/server";

import { currentUser } from "../../../lib/supabase/server";
import { signedByOrganizer } from "../../../lib/organizer";

/**
 * Writing what a hackathon looks like, for the wallet the contract calls the
 * organizer.
 *
 * The chain decides who that is and this asks it rather than taking anybody's
 * word: the caller names a contract, the handler reads `team()` off it, and the
 * signature has to come from the address that comes back. Our database is not
 * consulted for the answer, because the whole point of the contract holding the
 * organizer is that it is the authority on who they are.
 *
 * Two things are checked and both are necessary. The session says which account
 * the draft belongs to. The signature says the person at that account holds the
 * organizer's key. Either alone would let somebody rewrite a hackathon that is
 * not theirs: a session without a signature is anybody with an account, and a
 * signature without a session is a signature that can be replayed by whoever
 * captured it.
 *
 * What makes the signature the organizer's is in `lib/organizer.ts`, apart from
 * this and tested there. Every way that check can be wrong is silent.
 */

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const serviceRole = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

interface Body {
  contract: string;
  /** Signed by the organizer, over the challenge below. */
  signature: string;
  /** Seconds since the epoch, from when the challenge was built. */
  issuedAt: number;
  banner_url?: string;
  logo_url?: string;
  location?: string;
  tags?: string[];
  name?: string;
  tagline?: string;
  description?: string;
  slug?: string;
}

/**
 * The presentation columns for one hackathon, read back.
 *
 * Everything here is already public: it is what the listing and the hackathon
 * page draw for a signed out visitor. It has a handler of its own because the
 * edit form needs it keyed on the contract address, and the public pages are
 * keyed on the slug, which a hackathon does not have until the indexer has
 * caught up.
 *
 * No signature and no session, deliberately. Requiring either would be a check
 * that reads public data with extra steps.
 */
export async function GET(request: Request) {
  const contract = new URL(request.url).searchParams.get("contract");

  if (contract === null || contract.length !== 56) {
    return NextResponse.json({ error: "a contract address is needed" }, { status: 400 });
  }

  const written = await metadataOf(contract);

  return written === null
    ? NextResponse.json({ error: "no such hackathon" }, { status: 404 })
    : NextResponse.json(written);
}

export async function POST(request: Request) {
  if (url === undefined || serviceRole === undefined) {
    /* Said plainly. A deployment without the key cannot write metadata at all,
       and pretending the request failed for some other reason would send
       somebody looking in the wrong place. */
    return NextResponse.json(
      { error: "this deployment cannot write hackathon metadata" },
      { status: 503 },
    );
  }

  const user = await currentUser();

  if (user === null) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  let body: Body;

  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "that is not JSON" }, { status: 400 });
  }

  if (typeof body.contract !== "string" || typeof body.signature !== "string") {
    return NextResponse.json({ error: "a contract and a signature are needed" }, { status: 400 });
  }

  const organizer = await organizerOf(body.contract);

  if (organizer === null) {
    return NextResponse.json(
      { error: "no hackathon could be read at that address" },
      { status: 404 },
    );
  }

  const proved = await signedByOrganizer({
    organizer,
    contract: body.contract,
    account: user.id,
    issuedAt: body.issuedAt,
    signature: body.signature,
  });

  if (!proved) {
    return NextResponse.json(
      { error: "that signature is not the organizer's" },
      { status: 403 },
    );
  }

  /*
    Only the presentation columns. The name and the slug reach URLs and every
    listing, and the rest of the row is written by the chain's own record, so a
    handler that took whatever it was given would be a way to edit things this
    check was never about.
  */
  const patch: Record<string, unknown> = {};

  for (const field of ["banner_url", "logo_url", "location", "name", "tagline", "description"]) {
    const value = body[field as keyof Body];

    if (typeof value === "string") {
      patch[field] = value.length === 0 ? null : value;
    }
  }

  if (Array.isArray(body.tags)) {
    patch["tags"] = body.tags.filter((tag) => typeof tag === "string").slice(0, 8);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to write" }, { status: 400 });
  }

  const written = await fetch(
    `${url}/rest/v1/hackathons?contract_id=eq.${encodeURIComponent(body.contract)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
    },
  );

  if (!written.ok) {
    return NextResponse.json({ error: await written.text() }, { status: written.status });
  }

  return NextResponse.json({ written: Object.keys(patch) });
}

/**
 * What has been written beside one contract, or nothing.
 *
 * Through the anonymous key rather than the service role. These are the columns
 * every visitor already reads, and reaching for the key that bypasses row level
 * security to fetch public data is how a handler that only ever meant to read
 * one row ends up being the one that leaked another.
 */
async function metadataOf(contract: string): Promise<Record<string, unknown> | null> {
  const anon = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (url === undefined || anon === undefined) {
    return null;
  }

  const columns = "name,tagline,location,logo_url,banner_url,tags";

  const answer = await fetch(
    `${url}/rest/v1/hackathons?contract_id=eq.${encodeURIComponent(contract)}&select=${columns}`,
    { headers: { apikey: anon, Authorization: `Bearer ${anon}` } },
  ).catch(() => null);

  if (answer === null || !answer.ok) {
    return null;
  }

  const rows = (await answer.json()) as Record<string, unknown>[];

  return rows[0] ?? null;
}

/** Who the contract says runs this hackathon. */
async function organizerOf(contract: string): Promise<string | null> {
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
