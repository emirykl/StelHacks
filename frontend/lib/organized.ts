import { db } from "./chain";

/**
 * The hackathons an address runs.
 *
 * The mirror of `joined.ts` and keyed the same way, by address rather than by
 * account, because the chain recorded an address as the organizer and has never
 * heard of a profile. Building this from our own grants table instead would be
 * the product keeping a second story about who runs what, and the two would
 * disagree the first time somebody organized an event from a wallet they later
 * stopped using.
 *
 * That is also why being an approved organizer is not consulted here. Approval
 * decides who may create; this reports what a key already created. Somebody
 * whose grant was taken back still has to be able to reach the event they are
 * in the middle of running.
 */

export interface Organized {
  contractId: string;
  /** Absent until the indexer has caught up and somebody has written a page. */
  slug: string | null;
  name: string | null;
  logoUrl: string | null;
  phase: number;
}

export async function hackathonsRun(address: string): Promise<Organized[]> {
  if (db === null) {
    return [];
  }

  const { data: rows } = await db
    .from("hackathon_state")
    .select("contract_id, phase, observed_at_ledger")
    .eq("organizer", address)
    /* Most recent first. This is a list somebody opens to get back to the thing
       they were doing, and that is almost always the newest one. */
    .order("observed_at_ledger", { ascending: false });

  if (rows === null || rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => String(row.contract_id));

  const { data: written } = await db
    .from("hackathons")
    .select("contract_id, slug, name, logo_url")
    .in("contract_id", ids);

  const named = new Map((written ?? []).map((row) => [String(row.contract_id), row]));

  /*
    An event with no page yet is kept rather than dropped, which is the opposite
    of what the joined list does, and the difference is whose list it is. A
    participant looking at an untitled row can do nothing with it. The organizer
    looking at one is looking at the event they just created and have not
    described yet, and that row is the way back into it.
  */
  return rows.map((row) => {
    const id = String(row.contract_id);
    const hackathon = named.get(id);

    return {
      contractId: id,
      slug: typeof hackathon?.slug === "string" ? hackathon.slug : null,
      name: typeof hackathon?.name === "string" ? hackathon.name : null,
      logoUrl: typeof hackathon?.logo_url === "string" ? hackathon.logo_url : null,
      phase: Number(row.phase),
    };
  });
}
