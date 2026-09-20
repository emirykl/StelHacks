import { NextResponse } from "next/server";

import { lumenPrice } from "../../../lib/money";

/**
 * What a lumen is worth, asked of us rather than of an exchange.
 *
 * The create form needs this to turn a prize written in dollars into the number
 * of lumens the contract will hold. It goes through here rather than the
 * browser calling the price feed directly for three reasons: the answer is the
 * same for everybody and is worth caching once instead of once per visitor, a
 * feed that changes its CORS policy would silently break the one number on the
 * form that decides how much money is committed, and the same figure is already
 * read this way on every listing page.
 *
 * Null when no honest figure is available, and the caller is expected to refuse
 * rather than guess. A prize table built on a made up rate is a prize table
 * that pays the wrong amount, permanently, because the constitution freezes it.
 */

export const revalidate = 900;

export async function GET() {
  const price = await lumenPrice();

  return NextResponse.json(
    { price },
    /* Shared cache for the quarter hour the quote is good for, and stale for a
       minute beyond it, so a slow feed costs a slightly older number rather
       than a form that cannot be filled in. */
    { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" } },
  );
}
