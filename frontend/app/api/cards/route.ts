import { NextResponse } from "next/server";

import { cardsOf } from "../../../lib/project";

/**
 * How the projects in one hackathon present themselves, keyed by team.
 *
 * The banner, the mark, the title and the line under it are ours rather than
 * the chain's: the contract pins a digest and a link, and everything a person
 * actually looks at is written beside it. The organizer's screening tab reads
 * the entries from the contract and needs this to draw them as projects rather
 * than as rows of hex.
 *
 * Public, because it is what the gallery already shows every visitor.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const contract = new URL(request.url).searchParams.get("contract");

  if (contract === null || contract.length !== 56) {
    return NextResponse.json({ cards: {} });
  }

  return NextResponse.json({ cards: await cardsOf(contract) });
}
