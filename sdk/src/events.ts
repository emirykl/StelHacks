import { xdr } from "@stellar/stellar-sdk";

import { spec } from "./spec.js";

/**
 * One event, decoded into the fields the contract declared.
 *
 * The indexer rebuilds the entire application state from this stream and from
 * nothing else, which is what lets the product claim no backend decides
 * anything. That only works if an event nobody recognises is loud rather than
 * quiet, so decoding never silently drops one: an unknown event comes back as
 * [`UnknownEvent`] carrying its raw topics, and the caller decides what to do
 * about it.
 */
export interface DecodedEvent {
  /** The contract's own name for it, such as `PrizePaid`. */
  name: string;
  /** Every declared field, topics and data alike, keyed by the name the
   * contract gave it. */
  fields: Record<string, unknown>;
}

/** An event this build of the SDK has no description for. */
export interface UnknownEvent {
  name: null;
  /** The topic symbols as they arrived, so a caller can log something useful. */
  topics: string[];
}

/** The shape a Soroban RPC event arrives in, reduced to what decoding needs. */
export interface RawEvent {
  topics: xdr.ScVal[];
  value: xdr.ScVal;
}

/**
 * Decodes one event against the contract's published description.
 *
 * Nothing here hardcodes an event layout. The spec says which parameters travel
 * as topics and which travel in the payload, and in what order, so an event
 * whose shape changes in Rust decodes correctly here without anyone editing
 * this file, and an event that gains a field starts returning it.
 */
export function decodeEvent(event: RawEvent): DecodedEvent | UnknownEvent {
  const topics = event.topics.map(readSymbol);
  const definition = find(topics);

  if (definition === undefined) {
    return { name: null, topics: topics.filter((topic): topic is string => topic !== null) };
  }

  const prefix = definition.prefixTopics().length;
  const fields: Record<string, unknown> = {};

  // Topic parameters follow the prefix, in the order the contract declared
  // them. Data parameters are read out of the payload according to the format
  // the contract chose for it.
  let topicAt = prefix;
  const data = definition.params().filter(isData);

  for (const param of definition.params()) {
    if (isData(param)) {
      continue;
    }

    const value = event.topics[topicAt];
    topicAt += 1;

    if (value === undefined) {
      throw new Error(`${definition.name().toString()} is missing topic ${param.name().toString()}`);
    }

    fields[param.name().toString()] = spec.scValToNative(value, param.type());
  }

  for (const [name, value] of payload(definition, event.value, data)) {
    fields[name] = value;
  }

  return { name: definition.name().toString(), fields };
}

/**
 * Decodes a stream, keeping the ones this build understands.
 *
 * The unknown ones are returned rather than dropped, because an indexer that
 * skipped an event it did not recognise would produce a state nobody could
 * reproduce from the chain, which is the one thing the authority rule forbids.
 */
export function decodeEvents(events: readonly RawEvent[]): (DecodedEvent | UnknownEvent)[] {
  return events.map(decodeEvent);
}

/** Every event name this build knows how to decode. */
export function knownEvents(): string[] {
  return definitions().map((definition) => definition.name().toString());
}

function definitions(): xdr.ScSpecEventV0[] {
  return spec.entries
    .filter((entry) => entry.switch().name === "scSpecEntryEventV0")
    .map((entry) => entry.eventV0());
}

function find(topics: (string | null)[]): xdr.ScSpecEventV0 | undefined {
  return definitions().find((definition) => {
    const prefix = definition.prefixTopics().map((topic) => topic.toString());

    return prefix.every((expected, index) => topics[index] === expected);
  });
}

function payload(
  definition: xdr.ScSpecEventV0,
  value: xdr.ScVal,
  data: xdr.ScSpecEventParamV0[],
): [string, unknown][] {
  switch (definition.dataFormat().name) {
    case "scSpecEventDataFormatSingleValue": {
      const only = data[0];

      return only === undefined ? [] : [[only.name().toString(), spec.scValToNative(value, only.type())]];
    }

    case "scSpecEventDataFormatVec": {
      const entries = value.vec() ?? [];

      return data.map((param, index) => {
        const item = entries[index];

        if (item === undefined) {
          throw new Error(`${definition.name().toString()} is missing ${param.name().toString()}`);
        }

        return [param.name().toString(), spec.scValToNative(item, param.type())];
      });
    }

    case "scSpecEventDataFormatMap": {
      const entries = new Map(
        (value.map() ?? []).map((entry) => [readSymbol(entry.key()), entry.val()]),
      );

      return data.map((param) => {
        const name = param.name().toString();
        const item = entries.get(name);

        if (item === undefined) {
          throw new Error(`${definition.name().toString()} is missing ${name}`);
        }

        return [name, spec.scValToNative(item, param.type())];
      });
    }

    default:
      throw new Error(`unknown event data format ${definition.dataFormat().name}`);
  }
}

function isData(param: xdr.ScSpecEventParamV0): boolean {
  return param.location().name === "scSpecEventParamLocationData";
}

function readSymbol(value: xdr.ScVal): string | null {
  return value.switch().name === "scvSymbol" ? value.sym().toString() : null;
}
