import { NextResponse } from "next/server";

import { canWrite, linkedToAccount, organizerOf, rememberLink } from "../../../lib/authority";
import { currentUser } from "../../../lib/supabase/server";
import { signedByOrganizer } from "../../../lib/organizer";

/**
 * Whether a backer's name goes on the wall, asked and answered.
 *
 * Two requests and two different people. `POST` is the sponsor, a moment after
 * their contribution landed, asking to be named for it. `PATCH` is the
 * organizer saying yes or no. Neither touches a single unit of money: the
 * contribution is on chain before this handler hears about it, and the wall
 * reads the amounts from the contract whatever is decided here.
 *
 * What each side has to prove is the same thing in both directions — that the
 * address they are speaking for is theirs. A sponsor proves it by having linked
 * that wallet to their account, which is a signature the server checked and
 * kept. An organizer proves it the way they prove every other write on their
 * own event: the contract is asked who the organizer is, and the answer has to
 * be an address linked to the session, or signed for on the spot.
 *
 * Without the sponsor's half, anybody with an account could put their name
 * beside somebody else's money. Without the organizer's half, anybody who sent
 * a stroop could put a display name on an event they have nothing to do with.
 */

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const serviceRole = process.env["SUPABASE_SERVICE_ROLE_KEY"];

interface Claim {
  contract: string;
  address: string;
  /** What the sponsor asked to be called, and what the on chain digest covers. */
  name?: string;
  url?: string;
  note?: string;
}

interface Decision extends Claim {
  shown: boolean;
  /** Only when the organizer's wallet is not already linked to the session. */
  signature?: string;
  issuedAt?: number;
}

export async function POST(request: Request) {
  if (!canWrite()) {
    return NextResponse.json(
      { error: "this deployment cannot record sponsor credits" },
      { status: 503 },
    );
  }

  const user = await currentUser();

  if (user === null) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const body = await read<Claim>(request);

  if (body === null || typeof body.contract !== "string" || typeof body.address !== "string") {
    return NextResponse.json({ error: "a contract and an address are needed" }, { status: 400 });
  }

  /* The wallet that signed the contribution has to be one this account has
     already proved. A claim is a request to print a name, and the name comes
     from the account, so the two have to be the same person. */
  if (!(await linkedToAccount(body.address, user.id))) {
    return NextResponse.json({ error: "that wallet is not linked to this account" }, { status: 403 });
  }

  /*
    Ignored on conflict rather than upserted, which is the whole behaviour of a
    second contribution from the same sponsor.

    An organizer who has already decided — either way — has decided about that
    person, and a fresh donation must not quietly reset a name they took down or
    re-ask a question they have answered. The wall is one line per backer; so is
    this table.
  */
  const written = await fetch(`${url}/rest/v1/sponsor_credits`, {
    method: "POST",
    headers: {
      apikey: serviceRole!,
      Authorization: `Bearer ${serviceRole!}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates",
    },
    /* Trimmed and capped at the same lengths the column checks, so an oversized
       field comes back as a refusal from here rather than as a constraint
       violation the caller has to read Postgres to understand. */
    body: JSON.stringify({
      contract_id: body.contract,
      address: body.address,
      profile_id: user.id,
      sponsor_name: said(body.name, 80),
      sponsor_url: said(body.url, 200),
      sponsor_note: said(body.note, 500),
    }),
  }).catch(() => null);

  if (written === null || !written.ok) {
    return NextResponse.json(
      { error: written === null ? "the database could not be reached" : await written.text() },
      { status: written?.status ?? 502 },
    );
  }

  return NextResponse.json({ claimed: true });
}

export async function PATCH(request: Request) {
  if (!canWrite()) {
    return NextResponse.json(
      { error: "this deployment cannot record sponsor credits" },
      { status: 503 },
    );
  }

  const user = await currentUser();

  if (user === null) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const body = await read<Decision>(request);

  if (
    body === null ||
    typeof body.contract !== "string" ||
    typeof body.address !== "string" ||
    typeof body.shown !== "boolean"
  ) {
    return NextResponse.json({ error: "a contract, an address and an answer are needed" }, { status: 400 });
  }

  const organizer = await organizerOf(body.contract);

  if (organizer === null) {
    return NextResponse.json(
      { error: "no hackathon could be read at that address" },
      { status: 404 },
    );
  }

  /* The same two proofs the metadata handler takes, and for the same reason:
     naming a backer on an event page is editing the event page. A signature
     that verified here is filed, so it is only ever asked for once. */
  const linked = await linkedToAccount(organizer, user.id);

  const signed =
    !linked &&
    typeof body.signature === "string" &&
    (await signedByOrganizer({
      organizer,
      contract: body.contract,
      account: user.id,
      issuedAt: body.issuedAt ?? 0,
      signature: body.signature,
    }));

  if (signed) {
    await rememberLink(organizer, user.id);
  }

  if (!linked && !signed) {
    return NextResponse.json({ error: "that is not the organizer's key" }, { status: 403 });
  }

  const written = await fetch(
    `${url}/rest/v1/sponsor_credits` +
      `?contract_id=eq.${encodeURIComponent(body.contract)}` +
      `&address=eq.${encodeURIComponent(body.address)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRole!,
        Authorization: `Bearer ${serviceRole!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: body.shown ? "shown" : "hidden",
        decided_at: new Date().toISOString(),
      }),
    },
  ).catch(() => null);

  if (written === null || !written.ok) {
    return NextResponse.json(
      { error: written === null ? "the database could not be reached" : await written.text() },
      { status: written?.status ?? 502 },
    );
  }

  return NextResponse.json({ status: body.shown ? "shown" : "hidden" });
}

/**
 * One typed field, or nothing.
 *
 * Null rather than an empty string for a field left blank, because the digest
 * on chain was taken over what was actually written and a row holding "" for a
 * website claims the sponsor gave one.
 */
function said(value: unknown, cap: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const written = value.trim().slice(0, cap);

  return written.length === 0 ? null : written;
}

async function read<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
