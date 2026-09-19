import { xdr } from "@stellar/stellar-sdk";
import { decodeEvent } from "@stelhacks/sdk";

import type { ProjectedEvent, StoredEvent } from "./records.js";

/**
 * Turning the log back into named fields.
 *
 * The log stores what the chain published and nothing else: the topics and the
 * value, as they arrived, in XDR. That is deliberate, because a log that stored
 * an interpretation would be worth less every time the interpretation changed.
 * The cost is this step, and running the indexer against a live contract is
 * what showed it was missing: the stored name is the topic symbol the chain
 * emitted, `created`, while the contract's own name for the event is `Created`,
 * and the fields were still sitting in an XDR blob nothing had opened.
 *
 * Both are answered by the contract's published description rather than by a
 * table kept here, so an event that gains a field starts arriving with it and
 * an event this build has never heard of is passed through under its topic
 * name rather than dropped.
 */
export function decode(events: readonly StoredEvent[]): ProjectedEvent[] {
  return events.map((event) => {
    const raw = raws(event);

    if (raw === null) {
      return { ...event, fields: {}, tx_hash: hashOf(event) };
    }

    const decoded = decodeEvent(raw);

    return {
      contract_id: event.contract_id,
      ledger: event.ledger,
      event_index: event.event_index,
      // A recognised event takes the contract's name for itself. An
      // unrecognised one keeps the topic it was published under, which is the
      // most a later reader can be told about it honestly.
      name: decoded.name ?? event.name,
      fields: decoded.name === null ? {} : decoded.fields,
      tx_hash: hashOf(event),
      occurred_at: event.occurred_at,
    };
  });
}

/** The transaction hash the log kept beside the event. */
function hashOf(event: StoredEvent): string {
  const hash = event.payload["tx_hash"];

  return typeof hash === "string" ? `\\x${hash}` : "\\x";
}

/**
 * The ScVals back out of the row.
 *
 * A row whose payload cannot be read is a row from a different shape of log,
 * and there is no honest field set to invent for it. It arrives with none,
 * which projects to nothing, rather than throwing and stopping a rebuild that
 * every other row would have survived.
 */
function raws(event: StoredEvent): { topics: xdr.ScVal[]; value: xdr.ScVal } | null {
  const topics = event.payload["topics"];
  const value = event.payload["value"];

  if (!Array.isArray(topics) || typeof value !== "string") {
    return null;
  }

  try {
    return {
      topics: topics.map((topic) => xdr.ScVal.fromXDR(String(topic), "base64")),
      value: xdr.ScVal.fromXDR(value, "base64"),
    };
  } catch {
    return null;
  }
}
