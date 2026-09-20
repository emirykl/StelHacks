import { NextResponse } from "next/server";

import { peopleFor } from "../../../lib/hackers";

/**
 * The people behind a handful of addresses, for a surface that has the
 * addresses and wants faces.
 *
 * An address is allowed to belong to nobody, and that is the normal case rather
 * than a gap: the contract approves a key, and only somebody who signed in and
 * proved they hold it has a name here. So this answers for what it can and says
 * nothing about the rest.
 *
 * Everything it returns is already public — a username, a display name, an
 * avatar and the links somebody chose to put on their profile are what that
 * profile page shows anyone who visits it.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get("addresses") ?? "";

  const addresses = asked
    .split(",")
    .map((address) => address.trim())
    .filter((address) => address.length === 56)
    /* Bounded, because the caller names them and a page asking about a
       thousand addresses is a page asking the wrong question. */
    .slice(0, 60);

  return NextResponse.json({ people: await peopleFor(addresses) });
}
