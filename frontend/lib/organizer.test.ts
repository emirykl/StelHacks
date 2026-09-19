import { Keypair, hash } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";

import { challengeFor, signedByOrganizer, timely, WINDOW_SECONDS } from "./organizer";

/**
 * The rules for letting somebody rewrite a hackathon.
 *
 * Every case below is a way the check could be wrong, and none of them would
 * show up as an error. Accepting one signature too many lets a stranger rewrite
 * an organizer's hackathon; accepting too few locks the organizer out of their
 * own. Both fail quietly, which is why they fail here instead.
 */

const CONTRACT = "CAURPTIPWAPOYRAQV5RVMV4QDTQUI5UJDCIYDASBCSFINPSEKCS5N5ZG";
const ACCOUNT = "3f1f1d8a-0000-4000-8000-000000000001";

/** Signs the way a wallet does: SEP-53 prefix, hashed, digest signed. */
function signAs(key: Keypair, message: string): string {
  const payload = hash(Buffer.from(`Stellar Signed Message:\n${message}`, "utf8"));

  return Buffer.from(key.sign(Buffer.from(payload))).toString("hex");
}

describe("who may describe a hackathon", () => {
  const organizer = Keypair.random();
  const now = 1_800_000_000;
  const challenge = challengeFor(CONTRACT, ACCOUNT, now);

  const ask = (over: Partial<Parameters<typeof signedByOrganizer>[0]> = {}) =>
    signedByOrganizer({
      organizer: organizer.publicKey(),
      contract: CONTRACT,
      account: ACCOUNT,
      issuedAt: now,
      signature: signAs(organizer, challenge),
      now,
      ...over,
    });

  it("accepts the organizer signing their own challenge", async () => {
    expect(await ask()).toBe(true);
  });

  /** Without this, anybody with an account could rewrite anybody's hackathon. */
  it("refuses a signature from another key", async () => {
    const stranger = Keypair.random();

    expect(await ask({ signature: signAs(stranger, challenge) })).toBe(false);
  });

  /** A signature lifted from one hackathon must not work on the next. */
  it("refuses a signature made for a different contract", async () => {
    const elsewhere = challengeFor("CBOT4YZXYBEJMC7T7RMC7NIU2RTX65PAGIJWFNZM6KW6R3IETCAN5YMJ", ACCOUNT, now);

    expect(await ask({ signature: signAs(organizer, elsewhere) })).toBe(false);
  });

  /**
   * The account binding is what makes a captured signature useless to whoever
   * captured it: it only verifies inside the session it was made in.
   */
  it("refuses a signature made under a different account", async () => {
    const theirs = challengeFor(CONTRACT, "another-account", now);

    expect(await ask({ signature: signAs(organizer, theirs) })).toBe(false);
  });

  it("refuses one that has gone stale", async () => {
    expect(await ask({ now: now + WINDOW_SECONDS + 1 })).toBe(false);
  });

  /** A clock bounded in one direction is a window that does not close. */
  it("refuses one dated in the future", async () => {
    expect(await ask({ now: now - WINDOW_SECONDS - 1 })).toBe(false);
  });

  it("refuses an organizer address that is not an address", async () => {
    expect(await ask({ organizer: "not a key" })).toBe(false);
  });

  it("refuses a signature that is not hex, rather than throwing", async () => {
    expect(await ask({ signature: "zzzz" })).toBe(false);
  });
});

describe("the window", () => {
  it("holds at both edges and lets go past them", () => {
    expect(timely(1000, 1000 + WINDOW_SECONDS)).toBe(true);
    expect(timely(1000, 1000 - WINDOW_SECONDS)).toBe(true);
    expect(timely(1000, 1000 + WINDOW_SECONDS + 1)).toBe(false);
    expect(timely(1000, 1000 - WINDOW_SECONDS - 1)).toBe(false);
  });

  it("refuses a timestamp that is not a number at all", () => {
    expect(timely(Number.NaN)).toBe(false);
  });
});
