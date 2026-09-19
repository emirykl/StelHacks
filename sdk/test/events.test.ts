import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Address, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { decodeEvent, decodeEvents, knownEvents, type DecodedEvent } from "../src/events.js";
import { fromHex, toHex } from "../src/hex.js";
import { VOTER } from "./canonical.js";

/**
 * A real event, captured from the contract by the Rust suite and committed.
 *
 * Decoding tested against a hand written ScVal would only prove the decoder
 * agrees with whoever wrote the test. This is the shape the chain actually
 * emits, so a change to how the contract publishes an event breaks this
 * immediately.
 */
function publishedEvent(name: string): { topics: xdr.ScVal[]; value: xdr.ScVal } {
  const path = join(import.meta.dirname, "..", "..", "fixtures", name);
  const event = xdr.ContractEvent.fromXDR(Buffer.from(fromHex(readFileSync(path, "utf8"))));
  const body = event.body().v0();

  return { topics: body.topics(), value: body.data() };
}

describe("decoding what the contract published", () => {
  const submitted = publishedEvent("event-project-submitted.hex");

  it("names the event the contract named", () => {
    const decoded = decodeEvent(submitted) as DecodedEvent;

    expect(decoded.name).toBe("ProjectSubmitted");
  });

  /**
   * Topics and data are read from the spec rather than from a layout written
   * here, so this covers both halves at once: `team` travels as a topic and the
   * rest travel in the payload.
   */
  it("returns every declared field, from the topics and from the payload", () => {
    const decoded = decodeEvent(submitted) as DecodedEvent;

    expect(decoded.fields["team"]).toBe(1);
    expect(decoded.fields["track"]).toBe("payments");
    expect(decoded.fields["revised"]).toBe(false);
    expect(toHex(new Uint8Array(decoded.fields["metadata_hash"] as Buffer))).toBe("03".repeat(32));
  });

  /**
   * The authority rule turns on this. An indexer that quietly skipped an event
   * it did not recognise would build a state nobody could reproduce from the
   * chain, and the omission would be invisible.
   */
  it("hands back an event it does not recognise rather than dropping it", () => {
    const stranger = {
      topics: [xdr.ScVal.scvSymbol("nothing")],
      value: xdr.ScVal.scvVoid(),
    };

    const decoded = decodeEvent(stranger);

    expect(decoded.name).toBeNull();
    expect((decoded as { topics: string[] }).topics).toEqual(["nothing"]);
  });

  it("decodes a stream in order, known and unknown alike", () => {
    const stranger = { topics: [xdr.ScVal.scvSymbol("nothing")], value: xdr.ScVal.scvVoid() };
    const decoded = decodeEvents([submitted, stranger, submitted]);

    expect(decoded.map((event) => event.name)).toEqual([
      "ProjectSubmitted",
      null,
      "ProjectSubmitted",
    ]);
  });
});

describe("the events this build understands", () => {
  /**
   * Every state change the contract makes emits an event, because a change the
   * proof page cannot show is a change that did not happen as far as a reader
   * is concerned. The count is asserted loosely: what matters is that the list
   * comes from the contract's own description rather than from a list kept by
   * hand here, so a new event needs no change to this package.
   */
  it("comes from the contract rather than from a list kept here", () => {
    const names = knownEvents();

    expect(names.length).toBeGreaterThan(30);
    expect(names).toContain("ProjectSubmitted");
    expect(names).toContain("PrizePaid");
    expect(names).toContain("DeadlineExtended");
    expect(names).toContain("DisqualificationResolved");
    expect(names).toContain("HackathonCancelled");
  });

  it("has no duplicate names", () => {
    const names = knownEvents();

    expect(new Set(names).size).toBe(names.length);
  });
});

describe("addresses survive the round trip", () => {
  /**
   * An address arriving as a topic has to come back as the strkey a client can
   * show, not as raw bytes. Following one participant through the stream is the
   * most common thing anybody does with these events.
   */
  it("decodes an address topic back to its strkey", () => {
    const applied = {
      topics: [xdr.ScVal.scvSymbol("applied"), new Address(VOTER).toScVal()],
      value: xdr.ScVal.scvMap([]),
    };

    const decoded = decodeEvent(applied) as DecodedEvent;

    expect(decoded.name).toBe("Applied");
    expect(decoded.fields["applicant"]).toBe(VOTER);
  });
});
