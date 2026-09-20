import { FieldRule } from "hackathon-core";
import { describe, expect, it } from "vitest";

import { validateSubmission } from "../src/submission.js";
import { canonicalMetadata } from "./canonical.js";

const codeAndVideo = {
  repository: FieldRule.Required,
  demo_video: FieldRule.Required,
  live_url: FieldRule.Optional,
  pitch_deck: FieldRule.Optional,
  deployed_contract: FieldRule.Optional,
};

describe("what an organizer asked for", () => {
  it("accepts a submission carrying every link", () => {
    expect(validateSubmission(canonicalMetadata(), codeAndVideo)).toEqual([]);
  });

  it("names every missing field rather than only the first", () => {
    const metadata = canonicalMetadata();
    metadata.name = "";
    metadata.repository_url = "";

    expect(validateSubmission(metadata, codeAndVideo)).toEqual(["name", "repository_url"]);
  });

  it("only asks for what the rules asked for", () => {
    const metadata = canonicalMetadata();
    metadata.live_url = "";

    expect(validateSubmission(metadata, codeAndVideo)).toEqual([]);
    expect(
      validateSubmission(metadata, { ...codeAndVideo, live_url: FieldRule.Required }),
    ).toEqual(["live_url"]);
  });

  /**
   * The difference the third rule exists for, from this side. A field nobody
   * asked for is not missing when it is empty and not a breach when it is
   * filled in, because the form it was never on could not have promised
   * either way.
   */
  it("treats a field nobody asked for as neither missing nor a breach", () => {
    const metadata = canonicalMetadata();
    metadata.pitch_deck_url = "";

    expect(validateSubmission(metadata, { ...codeAndVideo, pitch_deck: FieldRule.Unasked })).toEqual(
      [],
    );

    metadata.pitch_deck_url = "https://cdn.example.com/deck.pdf";

    expect(validateSubmission(metadata, { ...codeAndVideo, pitch_deck: FieldRule.Unasked })).toEqual(
      [],
    );
  });

  /** A contracts only track can insist on the thing it exists to judge. */
  it("can demand a deployed contract", () => {
    const metadata = canonicalMetadata();
    metadata.deployed_contract = "";

    expect(
      validateSubmission(metadata, { ...codeAndVideo, deployed_contract: FieldRule.Required }),
    ).toEqual(["deployed_contract"]);
  });

  /**
   * A design focused event can ask for nothing but a name, and that has to
   * work: the requirements are the organizer's to set before the lock.
   */
  it("lets an event ask for nothing but a name", () => {
    const metadata = canonicalMetadata();
    metadata.repository_url = "";
    metadata.demo_video_url = "";
    metadata.live_url = "";

    expect(
      validateSubmission(metadata, {
        repository: FieldRule.Unasked,
        demo_video: FieldRule.Unasked,
        live_url: FieldRule.Unasked,
        pitch_deck: FieldRule.Unasked,
        deployed_contract: FieldRule.Unasked,
      }),
    ).toEqual([]);
  });

  /**
   * Whitespace is not a repository link. A field holding only spaces would
   * otherwise pass a presence check and fail a human one.
   */
  it("treats a field of whitespace as missing", () => {
    const metadata = canonicalMetadata();
    metadata.repository_url = "   ";

    expect(validateSubmission(metadata, codeAndVideo)).toEqual(["repository_url"]);
  });
});
