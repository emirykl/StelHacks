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

  if (typeof body.contract !== "string") {
    return NextResponse.json({ error: "a contract is needed" }, { status: 400 });
  }

  const organizer = await organizerOf(body.contract);

  if (organizer === null) {
    return NextResponse.json(
      { error: "no hackathon could be read at that address" },
      { status: 404 },
    );
  }

  /*
    Two ways to prove the organizer's key, and they are the same strength.

    A signature over the challenge is one. The other is a row in `wallet_links`,
    which exists only because the address already signed a challenge the server
    verified, and which only the verifier can write. So an organizer who has
    linked their wallet to their account has proved this key once already, and
    asking them to sign a message every time they change a tagline is asking for
    a proof we are holding.

    The session is still required either way. A link says the key belongs to an
    account; it takes the cookie to say the person at the keyboard is in it.
  */
  const linked = await linkedToAccount(organizer, user.id);

  const signed =
    !linked &&
    typeof body.signature === "string" &&
    (await signedByOrganizer({
      organizer,
      contract: body.contract,
      account: user.id,
      issuedAt: body.issuedAt,
      signature: body.signature,
    }));

  /*
    A signature that verified is kept, so it is never asked for twice.

    `wallet_links` is exactly this fact written down: that this address signed a
    challenge naming this account, checked by the server. Having just checked
    one, recording it is not a shortcut around the proof, it is the proof filed
    where the rest of the product already looks for it. Without this the third
    wallet prompt came back on every hackathon, asking somebody to re-prove a
    key they had proved an hour earlier.
  */
  if (signed) {
    await rememberLink(organizer, user.id);
  }

  if (!linked && !signed) {
    return NextResponse.json(
      { error: "that is not the organizer's key" },
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

  /*
    Written rather than only updated, and this was the bug under everything.

    This handler used to PATCH the row for the contract. PostgREST answers a
    PATCH that matches nothing with success and an empty list, so a hackathon
    created through the site — which has no row until something makes one, and
    nothing did — saved its name to no rows at all and was told it worked. The
    event then had no name, never appeared in the listing, and could not be
    found by the page that lists what a judge has been asked to score.

    Upserted on the primary key, so the first write creates the row and every
    one after it edits the same row. The slug is only ever chosen here, on the
    way in, because it is in URLs from that moment and a name changed later must
    not move the page somebody bookmarked.
  */
  const fresh = (await metadataOf(body.contract)) === null;

  if (fresh) {
    patch["contract_id"] = body.contract;
    patch["slug"] = await freeSlug(String(patch["name"] ?? "hackathon"), body.contract);
  }

  const written = await fetch(
    fresh
      ? `${url}/rest/v1/hackathons`
      : `${url}/rest/v1/hackathons?contract_id=eq.${encodeURIComponent(body.contract)}`,
    {
      method: fresh ? "POST" : "PATCH",
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
 * A slug nobody else is using, from the name somebody typed.
 *
 * The shape is what the column's own check demands: lowercase, digits and
 * dashes, three characters at least. A name of nothing but punctuation, or a
 * slug already taken, falls back to the end of the contract address, which is
 * unique by construction and readable enough for a URL nobody types by hand.
 */
async function freeSlug(name: string, contract: string): Promise<string> {
  const tail = contract.slice(-8).toLowerCase();

  const wanted = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  if (wanted.length < 3) {
    return `event-${tail}`;
  }

  const taken = await fetch(
    `${url}/rest/v1/hackathons?slug=eq.${encodeURIComponent(wanted)}&select=slug`,
    { headers: { apikey: serviceRole!, Authorization: `Bearer ${serviceRole!}` } },
  ).catch(() => null);

  if (taken === null || !taken.ok) {
    return `${wanted}-${tail}`;
  }

  const rows = (await taken.json().catch(() => [])) as unknown[];

  return Array.isArray(rows) && rows.length === 0 ? wanted : `${wanted}-${tail}`;
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

/**
 * Files a proved address against the account that proved it.
 *
 * Ignored on conflict rather than overwritten: an address already linked to
 * somebody is not something a second person gets to claim by signing, and the
 * caller has nothing to do about it either way.
 */
async function rememberLink(address: string, account: string): Promise<void> {
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
async function linkedToAccount(address: string, account: string): Promise<boolean> {
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
