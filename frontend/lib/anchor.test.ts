import { describe, expect, it } from "vitest";

import { awaitingTransfer, completeWithdraw, discover, settled } from "./anchor";

/**
 * The guards around the one irreversible step.
 *
 * Each case asserts the reason, not just the refusal. Without that, a guard
 * that was never reached passes anyway: these ran green once while the memo
 * check sat behind a network check that failed first on a machine with no RPC
 * configured, so the test proved only that something had gone wrong.
 *
 * `completeWithdraw` reads an account, an amount and a memo off a third party's
 * HTTP response and turns them into a payment that cannot be taken back. Every
 * case below is a way that response could be wrong — malformed, missing, or
 * simply early — and every one of them would spend somebody's prize if it got
 * through. None of them would look like an error at the time.
 *
 * They are checked here rather than against a live anchor because a real one
 * will not produce them on request. The reachable half of the flow is proved
 * against two real anchors by `scripts/anchor-check.mts`; this is the half a
 * server would have to be broken or hostile to produce.
 */

const ANCHOR_ACCOUNT = "GCUZ6YLL5RQBTYLTTQLPCM73C5XAIUGK2TIMWQH7HPSGWVS2KJ2F3CHS";
const ME = "GBCWCH2AVBJXWG7ZBJJWYE63FRGUOXLHEQ23D66IPA5TNIYOID466RFO";

const ready = {
  id: "one",
  status: "pending_user_transfer_start",
  withdrawAnchorAccount: ANCHOR_ACCOUNT,
  withdrawMemo: "12345",
  withdrawMemoType: "id",
  amountIn: "15.0000000",
};

describe("paying the anchor", () => {
  it("refuses before the anchor says it is waiting", async () => {
    for (const status of ["incomplete", "pending_anchor", "completed", "error"]) {
      const done = await completeWithdraw({ ...ready, status }, "native", ME);

      expect(refusal(done)).toMatch(/not waiting/);
    }
  });

  it("refuses a destination that is not an account", async () => {
    for (const to of [undefined, "", "not an address", ANCHOR_ACCOUNT.slice(0, -1), ME.toLowerCase()]) {
      const done = await completeWithdraw(
        { ...ready, withdrawAnchorAccount: to },
        "native",
        ME,
      );

      expect(refusal(done)).toMatch(/named no account/);
    }
  });

  /* A contract address passes nothing here on purpose: a payment operation
     cannot pay one, and an anchor naming one has misconfigured itself. */
  it("refuses a contract address as the destination", async () => {
    const done = await completeWithdraw(
      { ...ready, withdrawAnchorAccount: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA" },
      "native",
      ME,
    );

    expect(refusal(done)).toMatch(/named no account/);
  });

  it("refuses an amount it cannot send faithfully", async () => {
    /* Eight decimals is finer than the ledger holds, so sending it would send a
       different number than the anchor asked for. Negative and zero are not
       roundings at all. */
    for (const amount of [undefined, "", "0", "-5", "abc", "1.123456789", "1e3", " 15 "]) {
      const done = await completeWithdraw({ ...ready, amountIn: amount }, "native", ME);

      expect(refusal(done)).toMatch(/named no amount/);
    }
  });

  it("refuses a memo it does not know how to write", async () => {
    const done = await completeWithdraw(
      { ...ready, withdrawMemoType: "something-new" },
      "native",
      ME,
    );

    expect(refusal(done)).toMatch(/memo this cannot write/);
  });

  /* A memo with no kind is the dangerous one: written as the wrong kind it is
     the wrong bytes, and the anchor cannot match the payment to anybody. */
  it("refuses a memo the anchor did not say the kind of", async () => {
    const done = await completeWithdraw(
      { ...ready, withdrawMemoType: undefined },
      "native",
      ME,
    );

    expect(refusal(done)).toMatch(/without saying its kind/);
  });
});

/** The reason it refused, or a failure saying it did not refuse at all. */
function refusal(done: Awaited<ReturnType<typeof completeWithdraw>>): string {
  expect(done.ok).toBe(false);

  return done.ok ? "" : done.why;
}

describe("reading an anchor's domain", () => {
  /* The only place a hostname reaches a URL. Anything that is not a bare domain
     is refused before the fetch, so a caller that one day takes this from a
     query string cannot turn it into a request to somewhere else. */
  it("refuses anything that is not a bare domain", async () => {
    const bad = [
      "",
      "not a domain",
      "localhost",
      "evil.com/../../x",
      "evil.com:8080",
      "https://evil.com",
      "evil.com/path",
      "user@evil.com",
      "127.0.0.1",
      "[::1]",
      "anchor.example.com#x",
      "anchor.example.com?a=b",
    ];

    for (const domain of bad) {
      await expect(discover(domain)).rejects.toThrow();
    }
  });
});

describe("knowing when to stop asking", () => {
  it("treats every ending as an ending", () => {
    for (const status of ["completed", "refunded", "expired", "error"]) {
      expect(settled(status)).toBe(true);
    }
  });

  it("keeps waiting through the ones that are still moving", () => {
    for (const status of [
      "incomplete",
      "pending_user_transfer_start",
      "pending_user_transfer_complete",
      "pending_anchor",
      "pending_external",
      "on_hold",
    ]) {
      expect(settled(status)).toBe(false);
    }
  });

  it("knows the one status that is our turn", () => {
    expect(awaitingTransfer("pending_user_transfer_start")).toBe(true);
    expect(awaitingTransfer("pending_anchor")).toBe(false);
  });
});
