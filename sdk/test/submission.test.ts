import { describe, expect, it } from "vitest";

import { validateSubmission } from "../src/submission.js";
import { canonicalMetadata } from "./canonical.js";

const codeAndVideo = {
  repository_required: true,
  demo_video_required: true,
  live_url_required: false,
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
    expect(validateSubmission(metadata, { ...codeAndVideo, live_url_required: true })).toEqual([
      "live_url",
    ]);
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
        repository_required: false,
        demo_video_required: false,
        live_url_required: false,
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
