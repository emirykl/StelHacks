import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { toHex } from "../src/hex.js";
import {
  ballotLeaf,
  encode,
  hashConstitution,
  hashSubmissionMetadata,
  scorecardLeaf,
} from "../src/hashing.js";
import { node } from "../src/merkle.js";
import {
  canonicalBallot,
  canonicalConstitution,
  canonicalMetadata,
  canonicalScorecard,
  VOTER,
} from "./canonical.js";

/**
 * The digests the Rust contract tests assert against, read from the same files.
 *
 * This is the handshake the product's central claim rests on. A participant
 * rebuilds the rules from the public page, hashes them in a browser, and
 * compares against what the chain stored. If these two implementations ever
 * drifted, that comparison would start failing for honest hackathons and
 * nobody would know which side was wrong. So the agreement is committed, and
 * both suites are measured against it rather than against each other.
 */
function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "..", "..", "fixtures", name), "utf8").trim();
}

describe("the constitution digest", () => {
  /**
   * Bytes before digests, because the two failures mean different things. A
   * digest that moved while the bytes did not means the hashing changed; bytes
   * that moved mean the type did, and that is the change which silently
   * invalidates every constitution already locked on chain.
   */
  it("serializes to the bytes the contract produces", () => {
    expect(toHex(encode(canonicalConstitution(), "Constitution"))).toBe(
      fixture("constitution.xdr.hex"),
    );
  });

  it("reaches the digest the contract stored", () => {
    expect(toHex(hashConstitution(canonicalConstitution()))).toBe(fixture("constitution.sha256"));
  });

  /**
   * Every field decides something, so every field has to move the digest. A
   * field that did not would be one an organizer could quietly change after the
   * lock while the published hash still matched.
   */
  it("moves when any field of the rules moves", () => {
    const original = toHex(hashConstitution(canonicalConstitution()));

    const quorum = canonicalConstitution();
    quorum.judge_quorum = 2;
    expect(toHex(hashConstitution(quorum))).not.toBe(original);

    const prize = canonicalConstitution();
    prize.prize_tiers[0]!.amount = 6_000n;
    expect(toHex(hashConstitution(prize))).not.toBe(original);

    const schedule = canonicalConstitution();
    schedule.schedule.submission_closes_at += 3_600n;
    expect(toHex(hashConstitution(schedule))).not.toBe(original);

    const appeal = canonicalConstitution();
    appeal.discretion.appeal_window = 24n * 3_600n;
    expect(toHex(hashConstitution(appeal))).not.toBe(original);
  });
});

describe("the submission digest", () => {
  it("serializes to the bytes the contract produces", () => {
    expect(toHex(encode(canonicalMetadata(), "SubmissionMetadata"))).toBe(
      fixture("submission.xdr.hex"),
    );
  });

  it("reaches the digest the contract pinned", () => {
    expect(toHex(hashSubmissionMetadata(canonicalMetadata()))).toBe(fixture("submission.sha256"));
  });

  /**
   * Two submissions differing only by which field holds a value must not
   * collide, which is what catches a serializer that runs fields together
   * without recording where each one ends.
   */
  it("separates two submissions that only moved a value between fields", () => {
    const first = canonicalMetadata();
    first.summary = "ab";
    first.description = "c";

    const second = canonicalMetadata();
    second.summary = "a";
    second.description = "bc";

    expect(toHex(hashSubmissionMetadata(first))).not.toBe(toHex(hashSubmissionMetadata(second)));
  });

  it("never shares a digest with a constitution", () => {
    expect(toHex(hashSubmissionMetadata(canonicalMetadata()))).not.toBe(
      toHex(hashConstitution(canonicalConstitution())),
    );
  });
});

describe("sealed leaves", () => {
  /**
   * What a judge checks their own inclusion proof against. If this moved, every
   * judge holding a receipt from before the change would find their proof no
   * longer verified, with nothing to tell them why.
   */
  it("puts a scorecard where the contract puts it", () => {
    expect(toHex(scorecardLeaf(canonicalScorecard()))).toBe(fixture("scorecard-leaf.sha256"));
  });

  it("puts a ballot where the contract puts it", () => {
    expect(toHex(ballotLeaf(VOTER, canonicalBallot()))).toBe(fixture("ballot-leaf.sha256"));
  });

  /**
   * The two leaves, combined, reach the committed root. This ties the domain
   * tags, the encodings and the pair ordering together in one value, which is
   * the thing an inclusion proof actually depends on.
   */
  it("combines into the root the contract computed", () => {
    const combined = node(scorecardLeaf(canonicalScorecard()), ballotLeaf(VOTER, canonicalBallot()));

    expect(toHex(combined)).toBe(fixture("merkle-root.sha256"));
  });
});
