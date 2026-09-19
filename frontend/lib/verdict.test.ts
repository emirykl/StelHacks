import { describe, expect, it } from "vitest";

import { bound, read, settle, type Findings } from "./verdict";
import type { Proof } from "../app/components/proof-strip";

/**
 * The rules for accusing this site of lying.
 *
 * Every case below is one a reader could hit, and getting any of them wrong has
 * a cost in one direction or the other: a false `verified` tells somebody a
 * digest was checked when it was not, and a false `broken` tells them an honest
 * organizer tampered with a page.
 */

const answered = (value: unknown): PromiseSettledResult<unknown> => ({
  status: "fulfilled",
  value,
});

const refused = (why: string): PromiseSettledResult<unknown> => ({
  status: "rejected",
  reason: new Error(why),
});

const same = (value: unknown) => String(value);

describe("comparing an answer against the page", () => {
  /** The ordinary case, and the only one that may ever read as checked. */
  it("agrees when the contract says what the page says", () => {
    expect(read(answered("abc"), "abc", same)).toEqual({ found: "abc", matches: true });
  });

  /** Without this the site could serve any digest it liked and never be caught. */
  it("disagrees when the contract says something else", () => {
    expect(read(answered("abc"), "def", same)).toEqual({ found: "abc", matches: false });
  });

  /**
   * A page with nothing to show cannot be confirmed by an answer.
   *
   * Treating absent as a match would let a hackathon whose rules were never
   * locked display a verified rules digest, which is the strongest claim the
   * product makes and the emptiest thing to make it about.
   */
  it("does not treat a page that claims nothing as agreeing", () => {
    expect(read(answered("abc"), null, same)).toEqual({ found: "abc", matches: false });
  });

  /** An RPC node that is down has found nothing, not found a problem. */
  it("reports a call that never returned as a failure rather than a mismatch", () => {
    expect(read(refused("connection refused"), "abc", same)).toEqual({
      failed: "connection refused",
    });
  });

  /** A contract answering in an unexpected shape is our bug, not their fraud. */
  it("reports an answer it cannot decode as a failure rather than a mismatch", () => {
    const explode = () => {
      throw new Error("not bytes");
    };

    expect(read(answered("abc"), "abc", explode)).toEqual({
      failed: "the contract answered in a shape this page did not expect",
    });
  });
});

describe("the vault, where a refusal is an answer", () => {
  /**
   * The contract refuses this call until a vault is bound, and a page saying
   * "not bound yet" is then exactly right. Reading the refusal as a failure
   * would leave every hackathon before funding permanently unverifiable.
   */
  it("confirms a page that claims no vault when the contract has none", () => {
    expect(bound(refused("Error(Contract, #7)"), null, true, same)).toEqual({
      found: "not bound yet",
      matches: true,
    });
  });

  /** A page naming a vault the contract never received is the thing to catch. */
  it("contradicts a page that names a vault the contract does not have", () => {
    expect(bound(refused("Error(Contract, #7)"), "CVAULT", true, same)).toEqual({
      found: "no vault is bound",
      matches: false,
    });
  });

  /**
   * The distinction the whole module turns on.
   *
   * The same refusal, with nothing else having come back, means the network
   * never answered. Calling it a mismatch would turn every RPC outage into an
   * accusation against an organizer who did nothing wrong.
   */
  it("says nothing about a vault when the contract never answered at all", () => {
    expect(bound(refused("connection refused"), "CVAULT", false, same)).toEqual({
      failed: "connection refused",
    });
  });
});

describe("folding the findings back into the strip", () => {
  const proofs: Proof[] = [
    { label: "Rules digest", value: "abc", standing: "unchecked" },
    { label: "Stage", value: "Funding", standing: "unchecked" },
    { label: "Hackathon contract", value: "CCQ7…HNB", standing: "unchecked" },
    { label: "Prize vault", value: "not bound yet", standing: "unchecked" },
  ];

  const standings = (findings: Findings) =>
    Object.fromEntries(settle(proofs, findings).map((p) => [p.label, p.standing]));

  it("marks what was confirmed and leaves the rest alone", () => {
    expect(
      standings({
        reached: true,
        digest: { found: "abc", matches: true },
        vault: { found: "not bound yet", matches: true },
      }),
    ).toEqual({
      "Rules digest": "verified",
      Stage: "unchecked",
      "Hackathon contract": "verified",
      "Prize vault": "verified",
    });
  });

  /**
   * The address needs no call of its own: a contract that answered is a
   * contract that exists at the address the page named.
   */
  it("takes any answer at all as proof the contract is where the page said", () => {
    expect(standings({ reached: true })["Hackathon contract"]).toBe("verified");
  });

  /** Nothing came back, so nothing was learned, including about the address. */
  it("confirms nothing when the contract never answered", () => {
    expect(standings({ reached: false, digest: { failed: "connection refused" } })).toEqual({
      "Rules digest": "unchecked",
      Stage: "unchecked",
      "Hackathon contract": "unchecked",
      "Prize vault": "unchecked",
    });
  });

  /**
   * A reader told the page is wrong needs to be told what is right, otherwise
   * the check has raised an alarm and left them with no way to act on it.
   */
  it("prints what the contract actually said next to a claim that failed", () => {
    const [digest] = settle(proofs, { reached: true, digest: { found: "def", matches: false } });

    expect(digest).toMatchObject({ standing: "broken", value: "abc", found: "def" });
  });

  /** The page shows a phase name and the contract answers with a number. */
  it("names the phase the contract reported rather than printing its number", () => {
    const found = settle(proofs, { reached: true, phase: { found: "4", matches: false } })[1];

    expect(found).toMatchObject({ standing: "broken", found: "Judging" });
  });
});
