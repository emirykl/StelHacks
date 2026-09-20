import type { ReactNode } from "react";

/**
 * The offer to check this page, at the foot of it.
 *
 * Four things the chain holds that anybody can verify without an account, and
 * the one control that verifies them.
 *
 * It used to be a black band across the top, above the name of the hackathon.
 * That put the product's argument before the thing the argument is about: a
 * reader arriving to see a hackathon met four claims in a vocabulary they had
 * no reason to have yet, in the heaviest treatment on the page. Nobody has to
 * check anything, and a control nobody has to use should not be the first thing
 * they meet or the loudest. It reads better as the last word: here is what the
 * page said, and here is how to confirm none of it came from us.
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
    <section aria-label="What the chain says">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {proofs.map((proof) => (
            <li
              key={proof.key}
              /* The value the claim rests on, reachable without taking a line
                 of its own. The full version is on the Details tab. */
              title={proof.value}
              className="flex items-center gap-2 text-[0.875rem] text-ink-soft"
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
        <div className="mt-5 border-t border-broken/40 bg-broken/5 px-4 py-4">
          <div>
            <p className="text-[0.875rem] font-semibold text-broken">
              The contract does not agree with this page.
            </p>

            <ul className="mt-3 grid gap-2">
              {broken.map((proof) => (
                <li key={proof.key} className="text-[0.8125rem] text-ink-soft">
                  <span className="font-semibold text-ink">{proof.claim}</span> — the contract
                  says <span className="tabular break-all text-ink">{proof.found}</span>
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
    return <span aria-hidden className="size-2 shrink-0 rounded-full ring-1 ring-ink-faint" />;
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
