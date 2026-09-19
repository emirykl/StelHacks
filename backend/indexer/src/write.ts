import type { Projection } from "./records.js";
import { db } from "./supabase.js";

/**
 * Putting a projection into Postgres.
 *
 * Upserts rather than inserts, everywhere, because the projection is the whole
 * answer rather than a delta: running it again over the same log produces the
 * same rows, and writing them again has to be a no change rather than a
 * conflict. That is what makes a crashed pass safe to repeat.
 */

/**
 * Which columns identify a row, in the order the tables are written.
 *
 * Listed once and used by both directions, so a table added to the projection
 * and forgotten here is a table that stops being written and a table that stops
 * being cleared, rather than one of the two.
 */
const tables = [
  ["hackathon_state", "contract_id"],
  ["participants", "contract_id,address"],
  ["team_members", "contract_id,team_id,address"],
  ["submissions", "contract_id,team_id"],
  ["scores", "contract_id,team_id,judge"],
  ["results", "contract_id,track,rank"],
  ["payments", "contract_id,track,rank,recipient"],
] as const satisfies readonly (readonly [keyof Projection, string])[];

export async function apply(projection: Projection): Promise<void> {
  for (const [table, onConflict] of tables) {
    const rows: readonly object[] = projection[table];

    if (rows.length === 0) {
      continue;
    }

    const { error } = await db.from(table).upsert(rows as never[], { onConflict });

    if (error !== null) {
      throw new Error(`could not write ${table}: ${error.message}`);
    }
  }
}

/**
 * Throws away every projected row for one hackathon.
 *
 * The other half of a rebuild, and a supported operation rather than a repair.
 * What it deliberately does not touch is `chain_events` and `chain_reads`:
 * those are the log, they are derived from nothing, and losing them is the one
 * thing here that cannot be undone.
 */
export async function discard(contract: string): Promise<void> {
  for (const [table] of [...tables].reverse()) {
    const { error } = await db.from(table).delete().eq("contract_id", contract);

    if (error !== null) {
      throw new Error(`could not clear ${table}: ${error.message}`);
    }
  }
}
