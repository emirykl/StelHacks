import { NextResponse } from "next/server";

import { hackathonsRun } from "../../../lib/organized";

/**
 * The hackathons one address runs, for the switcher inside the panel.
 *
 * Keyed on the address rather than on the session, because the chain recorded
 * an address as the organizer and has never heard of an account. It is the same
 * question `/manage` answers server side; this exists because the panel knows
 * the address only in the browser, where the wallet is.
 *
 * Nothing private. Who organizes what is on chain and on the public listing, so
 * this is a convenience over data anybody can already read.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");

  if (address === null || address.length !== 56) {
    return NextResponse.json({ organized: [] });
  }

  return NextResponse.json({ organized: await hackathonsRun(address) });
}
