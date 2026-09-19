import { rpc, xdr } from "@stellar/stellar-sdk";

import { settings } from "./config.js";
import { decode } from "./decode.js";
import { gather } from "./reads.js";
import { db } from "./supabase.js";
import type { StoredEvent, StoredRead } from "./records.js";

/**
 * Reading the chain, and writing down what it said.
 *
 * Two things come out of a pass: the events themselves, and the answers to the
 * few questions the events do not answer. Both go into append only tables, and
 * everything a page shows is built from those afterwards. Nothing here decides
 * anything; it copies.
 */

const server = new rpc.Server(settings.rpcUrl);

export interface Pass {
  events: StoredEvent[];
  reads: StoredRead[];
  /** The last ledger this pass actually covers. */
  through: number;
}

/**
 * Everything one contract published from `after` onwards, up to a page.
 *
 * Soroban RPC keeps only a recent window of events, so a cursor that falls
 * further behind than that window cannot be caught up from here. That is worth
 * knowing rather than discovering: the log in Postgres is the archive, and this
 * is only how it gets filled.
 */
export async function read(contract: string, after: number): Promise<Pass> {
  // A cursor of zero means the indexer has never run against this contract, and
  // there is no ledger zero to ask for. RPC serves a retention window and
  // refuses anything older, so a first pass starts at the oldest ledger it says
  // it still holds. A hackathon older than that cannot be ingested from here at
  // all, which is why the log in Postgres is the archive and this is only how
  // it gets filled.
  const startLedger = after === 0 ? (await server.getHealth()).oldestLedger : after + 1;

  const page = await server.getEvents({
    startLedger,
    filters: [{ type: "contract", contractIds: [contract] }],
    limit: settings.pageSize,
  });

  const events = page.events.map(toStored);

  return {
    events,
    // The reads a batch calls for are worked out from the decoded events, so
    // knowing which team submitted or which track was ranked does not mean
    // guessing at an XDR blob here.
    reads: await gather(contract, decode(events)),
    // How far this call actually got, which is not how far it was asked to go.
    //
    // RPC scans a bounded stretch per request and hands back a cursor saying
    // where it stopped, whether or not it found anything. Treating an empty
    // page as "nothing happened all the way to the head of the chain" moves the
    // cursor past ledgers nobody ever looked at, and a skipped range is a gap
    // no later pass would think to look for. Measured against a live contract
    // that was seven thousand ledgers wide.
    through: scannedThrough(page.cursor, startLedger, events),
  };
}

/**
 * The last ledger a page really covered.
 *
 * The cursor is a token of the form `<toid>-<index>`, and the toid packs the
 * ledger into its high bits. Reading it back is the only honest answer to how
 * far a pass got; the events themselves only say where the last match was,
 * which is earlier whenever the tail of the range was empty.
 *
 * Anything unparseable falls back to standing still. Re-reading a range costs a
 * request and changes nothing, because every write is idempotent; guessing
 * forward costs an event nobody notices is missing.
 */
function scannedThrough(cursor: string, startLedger: number, events: StoredEvent[]): number {
  const [toid] = cursor.split("-");
  const standStill = Math.max(startLedger - 1, ...events.map((event) => event.ledger));

  if (toid === undefined || !/^\d+$/.test(toid)) {
    return standStill;
  }

  return Math.max(standStill, Number(BigInt(toid) >> 32n));
}

/**
 * Writes a pass down, events before reads before the cursor.
 *
 * The order is the whole of the crash safety. Everything is idempotent, so a
 * pass interrupted anywhere is simply re-read next time; what must never happen
 * is the cursor moving past rows that did not land, because no later pass would
 * think to look for them again.
 */
export async function store(contract: string, pass: Pass): Promise<void> {
  if (pass.events.length > 0) {
    const { error } = await db
      .from("chain_events")
      .upsert(pass.events, { onConflict: "contract_id,ledger,event_index" });

    if (error !== null) {
      throw new Error(`could not store events for ${contract}: ${error.message}`);
    }
  }

  if (pass.reads.length > 0) {
    const { error } = await db
      .from("chain_reads")
      .upsert(pass.reads, { onConflict: "contract_id,ledger,kind,key" });

    if (error !== null) {
      throw new Error(`could not store reads for ${contract}: ${error.message}`);
    }
  }
}

/** The whole log for one contract, which is what a rebuild replays. */
export async function replayable(contract: string): Promise<{
  events: StoredEvent[];
  reads: StoredRead[];
}> {
  const events = await db
    .from("chain_events")
    .select("contract_id, ledger, event_index, name, payload, occurred_at")
    .eq("contract_id", contract)
    .order("ledger", { ascending: true })
    .order("event_index", { ascending: true });

  const reads = await db
    .from("chain_reads")
    .select("contract_id, ledger, kind, key, data")
    .eq("contract_id", contract)
    .order("ledger", { ascending: true });

  if (events.error !== null || reads.error !== null) {
    throw new Error(`could not read the log back: ${events.error?.message ?? reads.error?.message}`);
  }

  return { events: events.data as StoredEvent[], reads: reads.data as StoredRead[] };
}

/**
 * One RPC event, flattened into the row that records it.
 *
 * The topics stay as they arrived rather than being decoded here. Decoding
 * belongs to whoever projects the row, and a log that stored an interpretation
 * instead of the thing itself would be worth less every time the interpretation
 * changed.
 */
function toStored(event: rpc.Api.EventResponse): StoredEvent {
  return {
    contract_id: event.contractId?.toString() ?? "",
    ledger: event.ledger,
    event_index: indexWithinLedger(event.id),
    name: topicName(event.topic),
    payload: {
      topics: event.topic.map((topic) => topic.toXDR("base64")),
      value: event.value.toXDR("base64"),
      tx_hash: event.txHash,
    },
    occurred_at: event.ledgerClosedAt,
  };
}

/**
 * The position of an event inside its ledger.
 *
 * RPC hands out an identifier shaped `<ledger>-<index>`, and the index is what
 * makes two events in one ledger distinguishable. Without it they would collide
 * on the primary key and a replay would quietly lose one.
 */
function indexWithinLedger(id: string): number {
  const [, index] = id.split("-");

  return index === undefined ? 0 : Number(index);
}

/** The first topic is the event's name, by the convention the SDK emits. */
function topicName(topics: xdr.ScVal[]): string {
  const first = topics[0];

  if (first === undefined || first.switch().name !== "scvSymbol") {
    return "";
  }

  return first.sym().toString();
}
