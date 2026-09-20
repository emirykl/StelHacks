import { createClient } from "@supabase/supabase-js";

import { settings } from "./config.js";
import { stillMoving } from "./due.js";

/**
 * Which hackathons are worth a lap.
 *
 * The chain holds no list of its own instances, so the list has to come from
 * the database. Nothing else does: whether a phase is due is asked of the
 * contract every time, because a projection written by another process is the
 * wrong thing to decide that on.
 */

const db = createClient(settings.supabaseUrl, settings.serviceRoleKey, {
  auth: { persistSession: false },
});

/**
 * Read fresh every lap rather than once at startup, so a hackathon created
 * while this is running is kept to its deadlines without a restart.
 */
export async function following(): Promise<string[]> {
  const [all, state] = await Promise.all([
    db.from("hackathons").select("contract_id"),
    db.from("hackathon_state").select("contract_id, phase"),
  ]);

  if (all.error !== null) {
    throw new Error(all.error.message);
  }

  /* A state table that could not be read is not a reason to stop. Without it
     every hackathon gets a lap, which is the cautious direction: some wasted
     simulations rather than an event stuck at a deadline that has passed. */
  const phases = new Map(
    (state.data ?? []).map((row) => [String(row.contract_id), Number(row.phase)]),
  );

  return stillMoving({
    contracts: (all.data ?? []).map((row) => String(row.contract_id)),
    phases,
  });
}
