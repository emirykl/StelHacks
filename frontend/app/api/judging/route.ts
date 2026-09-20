import { NextResponse } from "next/server";

import { listHackathons } from "../../../lib/chain";
import { phaseName } from "../../../lib/phase";
import { rulesFor } from "../../../lib/rules";

/**
 * Which hackathons a wallet has been named a judge of.
 *
 * Asked of the chain rather than of our tables, because the judge list lives in
 * the frozen constitution and nothing else is allowed to be the authority on
 * it. A row in Postgres saying somebody is a judge would be a claim; the
 * contract's list is the thing the scoring service actually checks.
 *
 * That means one contract read per hackathon, which is why it happens here and
 * not in the browser: a judge opening the site should pay for one request, not
 * for a round trip per event that exists. The listing is already bounded to a
 * page, so the cost is bounded with it.
 *
 * Nothing here is private. The judge list is public in the constitution and the
 * address comes from the query, so this reveals only what anybody could read
 * off the chain themselves; it is a convenience, not an authorization.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");

  if (address === null || address.length !== 56) {
    return NextResponse.json({ judging: [] });
  }

  const hackathons = await listHackathons();

  const found = await Promise.all(
    hackathons.map(async (hackathon) => {
      const rules = await rulesFor(hackathon.contract_id).catch(() => null);

      if (rules === null || !rules.judgeAddresses.includes(address)) {
        return null;
      }

      return {
        contract: hackathon.contract_id,
        name: hackathon.name,
        slug: hackathon.slug,
        phase: hackathon.phase,
        phaseName: phaseName(hackathon.phase),
        /* So the panel can say whether this one is waiting on them now, and
           until when, without a second round trip per row. */
        judgingCloses: rules.schedule.judgingCloses,
        tracks: rules.tracks.length,
      };
    }),
  );

  return NextResponse.json({ judging: found.filter((one) => one !== null) });
}
