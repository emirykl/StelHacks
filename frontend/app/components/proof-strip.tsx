import type { ReactNode } from "react";

/**
 * The strip pinned to the top of every hackathon page.
 *
 * This is the product in one line. Four things the chain holds that anybody can
 * check without an account, and the one control that checks them.
 *
 * It has been rewritten three times and the arc is worth keeping, because each
 * version was a reasonable answer to the last one's problem.
 *
 * It began as four terms over four hashes: "Rules digest", "Prize vault". Every
 * one precise, none of them English, so a reader could not tell whether the
 * strip was reassuring them or warning them. That was fixed by explaining each
 * term, which turned it into six paragraphs on a black band that nobody
 * finishes. Explaining harder was the wrong axis.
 *
 * What is left says each promise in three words and shows nothing else. The
 * digests and the addresses have not been hidden or softened; they are in full
 * on the Details tab under "On chain", which is where somebody who wants to
 * compare one character by character is going to want them anyway. A summary
 * that repeats the thing it is summarising is not a summary.
 */

export type Standing = "verified" | "broken" | "unchecked";

/**
 * Which of the four facts a row is, independent of how it reads.
 *
 * The verifier used to find its rows by matching the words on them, so
 * rewriting a heading silently stopped a claim from ever being checked and the
 * page went on saying "not checked yet" forever with nobody the wiser. Copy is
 * allowed to change; this is not.
 */
export type Claim = "digest" | "phase" | "contract" | "vault";

export interface Proof {
  key: Claim;
  /**
   * The promise, in as few words as carry it.
   *
   * Not a field name and not a sentence. "Rules locked" rather than "Rules
   * digest", and rather than a paragraph about what a digest is.
   */
  claim: string;
  /** The value the chain holds. Not printed; carried for the failure case. */
  value: string;
  /** Whether anybody has checked it yet, and what they found. */
  standing: Standing;
  /**
   * What the contract said, when that is not what the page said.
   *
   * Only ever set after a check found a mismatch. "Does not match" on its own
   * tells a reader something is wrong and leaves them no way to find out what;
   * the value the contract actually holds is the thing they came for.
   */
  found?: string;
}

export function ProofStrip({ proofs, action }: { proofs: Proof[]; action?: ReactNode }) {
  const broken = proofs.filter((proof) => proof.standing === "broken");

  return (
    <section
      aria-label="What the chain says"
      className="grain relative overflow-hidden bg-night text-night-ink"
    >
      <div className="mx-auto flex w-full max-w-[96rem] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 py-3.5">
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {proofs.map((proof) => (
            <li
              key={proof.key}
              /* The value the claim rests on, reachable without taking a line
                 of its own. The full version is on the Details tab. */
              title={proof.value}
              className="flex items-center gap-2 text-[0.875rem] text-night-ink-soft"
            >
              <Dot standing={proof.standing} />
              {proof.claim}
            </li>
          ))}
        </ul>

        {action}
      </div>

      {/* Only when something is actually wrong, and then in full. This is the
          one case where the strip is allowed more than a line: a reader told
          the page is lying needs to be told what the truth is, or the check has
          raised an alarm and left them nothing to act on. */}
      {broken.length > 0 && (
        <div className="border-t border-broken/40 bg-broken/10 px-6 py-4">
          <div className="mx-auto w-full max-w-[96rem]">
            <p className="text-[0.875rem] font-semibold text-night-ink">
              The contract does not agree with this page.
            </p>

            <ul className="mt-3 grid gap-2">
              {broken.map((proof) => (
                <li key={proof.key} className="text-[0.8125rem] text-night-ink-soft">
                  <span className="font-semibold text-night-ink">{proof.claim}</span> — the
                  contract says{" "}
                  <span className="tabular break-all text-night-ink">{proof.found}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The state, as a shape rather than only a colour.
 *
 * A ring for unchecked, a filled dot for checked, a filled dot in the alarm
 * colour for broken. Somebody who cannot separate the two colours still gets
 * the answer from the ring being hollow.
 */
function Dot({ standing }: { standing: Standing }) {
  if (standing === "unchecked") {
    return <span aria-hidden className="size-2 shrink-0 rounded-full ring-1 ring-night-ink-soft" />;
  }

  return (
    <span
      aria-hidden
      className={`size-2 shrink-0 rounded-full ${
        standing === "verified" ? "bg-verified" : "bg-broken"
      }`}
    />
  );
}
