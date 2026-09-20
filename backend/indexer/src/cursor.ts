import { db } from "./supabase.js";

/**
 * How far the indexer has read, and nothing else.
 *
 * Kept in Postgres rather than in memory so a restart resumes instead of
 * starting again, and kept per contract because each hackathon is its own
 * contract and they do not begin at the same ledger.
 *
 * Read from Postgres once per contract per run. What is durable is still the
 * row; what is held here is the copy this process already knows to be true,
 * because this process is the only thing that writes it. That distinction is
 * the difference between an idle indexer costing nothing and an idle indexer
 * costing a hosting bill: a lap that finds no new ledgers used to ask the
 * database the same question three times per hackathon, forever, and on a free
 * tier that reading was the largest thing the whole product sent anywhere.
 */
const known = new Map<string, number>();

/** What the row actually holds, as far as this process knows. */
const stored = new Map<string, number>();

export async function resumeFrom(contract: string): Promise<number> {
  const held = known.get(contract);

  if (held !== undefined) {
    return held;
  }

  const { data, error } = await db
    .from("indexer_cursor")
    .select("last_ledger")
    .eq("contract_id", contract)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`could not read the cursor: ${error.message}`);
  }

  const at = data === null ? 0 : Number(data.last_ledger);
  known.set(contract, at);
  stored.set(contract, at);

  return at;
}

/**
 * Moves the cursor, and only ever forwards.
 *
 * Written after the events it covers, never before. A cursor ahead of the rows
 * it claims would skip a range on the next restart, and a skipped range is a
 * gap no later pass would think to look for.
 *
 * Forwards is enforced here rather than promised. It only said so until a pass
 * that had fallen behind the server's window resumed at the window's edge and
 * wrote that back: an edge is behind a caught up cursor, so the contract was
 * dragged back a hundred thousand ledgers, fell off the window again, and did
 * that forever. `rewind` is the one way back, and it says so in its name.
 *
 * The row is written before the memory of it, so a failed write leaves this
 * process believing the older value. That is the safe direction: the next pass
 * re-reads a range it has already stored, and storing is idempotent.
 */
export async function advanceTo(contract: string, ledger: number): Promise<void> {
  if (ledger <= (await resumeFrom(contract))) {
    return;
  }

  await write(contract, ledger);
}

/**
 * How far the scan may run ahead of the stored cursor before it is written.
 *
 * About an hour and a half of ledgers. What it buys is that an indexer watching
 * a quiet week writes once an hour rather than once a lap; what it costs is
 * that a process killed mid-drift rescans up to this many ledgers on the next
 * start, which is free of consequence because storing an event twice is the
 * same as storing it once.
 *
 * It has to stay far inside the node's retention window. A drift wider than
 * what RPC still serves would resume at a ledger the node has dropped, which is
 * the one failure this whole file is careful about.
 */
export const MAX_DRIFT_LEDGERS = 1_000;

/**
 * Records a scan that found nothing, writing the row only now and then.
 *
 * A lap that reads no events has still read ledgers, and forgetting that would
 * mean scanning them again next time. But writing it every lap is a database
 * round trip per hackathon per lap to say "still nothing", which is the cost
 * this indexer was quietly built out of.
 */
export async function noteProgress(contract: string, ledger: number): Promise<void> {
  if (ledger <= (await resumeFrom(contract))) {
    return;
  }

  known.set(contract, ledger);

  if (drifted(ledger, stored.get(contract) ?? 0)) {
    await write(contract, ledger);
  }
}

/** Whether the scan has run far enough ahead of the row to be worth a write. */
export function drifted(scanned: number, written: number): boolean {
  return scanned - written >= MAX_DRIFT_LEDGERS;
}

/**
 * Sends the indexer back to the beginning.
 *
 * This plus truncating the projections is what a rebuild is, and it is a
 * supported operation rather than a repair: the log is the durable thing and
 * everything built from it is disposable by design.
 *
 * It cannot go through `advanceTo`, which refuses to move backwards and would
 * turn this into a call that quietly did nothing.
 */
export async function rewind(contract: string): Promise<void> {
  await write(contract, 0);
}

async function write(contract: string, ledger: number): Promise<void> {
  const { error } = await db
    .from("indexer_cursor")
    .upsert(
      { contract_id: contract, last_ledger: ledger, updated_at: new Date().toISOString() },
      { onConflict: "contract_id" },
    );

  if (error !== null) {
    throw new Error(`could not move the cursor: ${error.message}`);
  }

  known.set(contract, ledger);
  stored.set(contract, ledger);
}
