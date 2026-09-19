import { db } from "./supabase.js";

/**
 * How far the indexer has read, and nothing else.
 *
 * Kept in Postgres rather than in memory so a restart resumes instead of
 * starting again, and kept per contract because each hackathon is its own
 * contract and they do not begin at the same ledger.
 */
export async function resumeFrom(contract: string): Promise<number> {
  const { data, error } = await db
    .from("indexer_cursor")
    .select("last_ledger")
    .eq("contract_id", contract)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`could not read the cursor: ${error.message}`);
  }

  return data === null ? 0 : Number(data.last_ledger);
}

/**
 * Moves the cursor, and only ever forwards.
 *
 * Written after the events it covers, never before. A cursor ahead of the rows
 * it claims would skip a range on the next restart, and a skipped range is a
 * gap no later pass would think to look for.
 */
export async function advanceTo(contract: string, ledger: number): Promise<void> {
  const { error } = await db
    .from("indexer_cursor")
    .upsert(
      { contract_id: contract, last_ledger: ledger, updated_at: new Date().toISOString() },
      { onConflict: "contract_id" },
    );

  if (error !== null) {
    throw new Error(`could not move the cursor: ${error.message}`);
  }
}

/**
 * Sends the indexer back to the beginning.
 *
 * This plus truncating the projections is what a rebuild is, and it is a
 * supported operation rather than a repair: the log is the durable thing and
 * everything built from it is disposable by design.
 */
export async function rewind(contract: string): Promise<void> {
  await advanceTo(contract, 0);
}
