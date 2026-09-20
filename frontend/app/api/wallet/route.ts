import { NextResponse } from "next/server";

import { currentUser } from "../../../lib/supabase/server";

/**
 * Tying an address to an account, which is the one join between the two halves
 * of somebody's identity.
 *
 * The schema has expected this since the beginning — `wallet_links` says it is
 * "written only by the challenge verifier" — and the verifier was never built,
 * so the table stayed empty and every surface that reads it reported that
 * nobody had an account. The addresses were right and the names were missing.
 *
 * Two steps, because one would not prove anything. A GET issues a nonce bound
 * to this account and this address and stored where no client can read it; a
 * POST takes the signature over that nonce and, if it checks out, writes the
 * link with the service key. A signature over a string the client chose would
 * prove only that somebody can sign their own words.
 *
 * The link is an assertion about a key, not about a hackathon. Nothing here
 * touches the chain, and nothing on chain depends on it: the contract approves
 * an address whether or not anybody ever signed in.
 */

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const serviceRole = process.env["SUPABASE_SERVICE_ROLE_KEY"];

/** How long a nonce is worth answering. */
const GOOD_FOR_MINUTES = 10;

export async function GET(request: Request) {
  if (url === undefined || serviceRole === undefined) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const user = await currentUser();

  if (user === null) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const address = new URL(request.url).searchParams.get("address") ?? "";

  if (!/^G[A-Z2-7]{55}$/.test(address)) {
    return NextResponse.json({ error: "that is not a Stellar address" }, { status: 400 });
  }

  const nonce = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + GOOD_FOR_MINUTES * 60_000).toISOString();

  const written = await fetch(`${url}/rest/v1/wallet_challenges`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      profile_id: user.id,
      address,
      nonce,
      expires_at: expiresAt,
    }),
  });

  if (!written.ok) {
    return NextResponse.json({ error: (await written.text()).slice(0, 200) }, { status: 502 });
  }

  return NextResponse.json({ message: messageFor(nonce) });
}

export async function POST(request: Request) {
  if (url === undefined || serviceRole === undefined) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const user = await currentUser();

  if (user === null) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  let body: { address?: string; signature?: string };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "unreadable" }, { status: 400 });
  }

  const address = String(body.address ?? "");

  if (!/^G[A-Z2-7]{55}$/.test(address)) {
    return NextResponse.json({ error: "that is not a Stellar address" }, { status: 400 });
  }

  /* The newest open challenge for this pair, and only this pair. Asking by
     account as well as address is what stops a nonce issued to one person from
     being answered on behalf of another. */
  const asked = await fetch(
    `${url}/rest/v1/wallet_challenges?profile_id=eq.${user.id}` +
      `&address=eq.${address}&consumed_at=is.null&order=issued_at.desc&limit=1` +
      `&select=id,nonce,expires_at`,
    { headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` } },
  );

  const [challenge] = (await asked.json()) as { id: string; nonce: string; expires_at: string }[];

  if (challenge === undefined) {
    return NextResponse.json({ error: "ask for a challenge first" }, { status: 400 });
  }

  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "that challenge has expired" }, { status: 400 });
  }

  if (!(await signed(address, messageFor(challenge.nonce), String(body.signature ?? "")))) {
    return NextResponse.json({ error: "that signature is not from this address" }, { status: 403 });
  }

  /* Consumed before the link is written. A nonce that survived a failed write
     would be a nonce somebody could answer twice. */
  await fetch(`${url}/rest/v1/wallet_challenges?id=eq.${challenge.id}`, {
    method: "PATCH",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ consumed_at: new Date().toISOString() }),
  });

  /* Cleared and written rather than upserted, because the service role is
     granted select, insert and delete on this table and deliberately not
     update. An address moving to a different account is a re-link, not an
     amendment, and doing it in two statements keeps `verified_at` honest: it
     dates the proof that is standing, not the first one anybody ever gave. */
  await fetch(`${url}/rest/v1/wallet_links?address=eq.${address}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      Prefer: "return=minimal",
    },
  });

  const linked = await fetch(`${url}/rest/v1/wallet_links`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ address, profile_id: user.id }),
  });

  if (!linked.ok) {
    return NextResponse.json({ error: (await linked.text()).slice(0, 200) }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * What the wallet is asked to sign.
 *
 * Prefixed and named, so somebody reading the prompt can tell what they are
 * agreeing to. A bare nonce is a string a wallet will happily sign for anybody.
 */
function messageFor(nonce: string): string {
  return `stelhacks.v1.link:${nonce}`;
}

async function signed(address: string, message: string, signature: string): Promise<boolean> {
  const { Keypair, hash } = await import("@stellar/stellar-sdk/base");

  /* The same envelope the wallet kit signs a message in, so what is verified
     here is what the person was shown. Hex because that is the encoding every
     other route in this product verifies, and one convention is worth more than
     the two bytes base64 would save. */
  const payload = hash(Buffer.from(`Stellar Signed Message:\n${message}`, "utf8"));

  try {
    return Keypair.fromPublicKey(address).verify(
      Buffer.from(payload),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}
