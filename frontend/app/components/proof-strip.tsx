import { Chain } from "./primitives";

/**
 * The strip pinned to the top of every hackathon page.
 *
 * This is the product in one component. Everything on it is a fact the chain
 * holds and anybody can check without an account, and the whole visual system
 * exists so that this can be the one loud thing on a page: it is the only place
 * the accent colour appears, and it is the only surface that inverts.
 *
 * What it must never do is claim more than it knows. A digest that has not been
 * checked is shown as unchecked rather than as a green tick, because a strip
 * that reassures by default is worse than no strip at all.
 *
 * It has been rewritten twice, and both reasons are worth keeping. The first
 * version was four terms over four hashes: "Rules digest", "Stage", "Hackathon
 * contract", "Prize vault". Every one is precise and none is English, so a
 * reader could not tell whether the strip was reassuring them or warning them,
 * which is the only thing it exists to do. The second version fixed that by
 * explaining each term at length, and became a wall of prose nobody finishes.
 *
 * What is left is the shape both were reaching for: each fact leads with the
 * promise it makes, backs it in one clause, and then shows the value. The value
 * has never moved and has never been softened. It is still the exact digest,
 * still in full, still comparable character by character. Anybody who wants the
 * long version can read `/how-it-works`, which is where it belongs.
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
   * The claim this fact is making, said as a person would say it.
   *
   * Not a field name. "The rules cannot change now" rather than "Rules
   * digest": a reader has to be able to tell what is being promised before
   * they can care whether it holds.
   */
  claim: string;
  /** How the claim is backed, in one line. */
  because: string;
  /** The value the chain holds, shown as it holds it. */
  value: string;
  /** Whether anybody has checked it yet, and what they found. */
  standing: Standing;
  /** Where a reader goes to check it for themselves. */
  href?: string;
  /**
   * What the contract said, when that is not what the page said.
   *
   * Only ever set after a check found a mismatch. "Does not match" on its own
   * tells a reader something is wrong and leaves them no way to find out what;
   * the value the contract actually holds is the thing they came for.
   */
  found?: string;
}

const standingText: Record<Standing, string> = {
  verified: "Checked, and it matches",
  broken: "Checked, and it does not match",
  unchecked: "Not checked yet",
};

export function ProofStrip({ proofs }: { proofs: Proof[] }) {
  return (
    <section
      aria-label="What the chain says"
      className="grain relative overflow-hidden bg-night text-night-ink"
    >
      <div className="mx-auto w-full max-w-[96rem] px-6 py-9">
        {/* Said once, above the four of them. Without it the strip is four
            unexplained strings on a black band, and a reader who cannot tell
            what it is for reads it as decoration and never presses the button
            underneath. */}
        <p className="text-[0.9375rem] text-night-ink-soft">
          <span className="font-semibold text-night-ink">Four promises</span>, none of
          them ours to break. Check each one against the contract below.
        </p>

        <div className="mt-7 grid gap-7 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-10">
          {proofs.map((proof) => (
            <Fact key={proof.key} proof={proof} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Fact({ proof }: { proof: Proof }) {
  const body = (
    <>
      <p className="text-[0.9375rem] font-semibold leading-snug text-night-ink">{proof.claim}</p>

      <p className="mt-1.5 text-[0.8125rem] leading-snug text-night-ink-soft">{proof.because}</p>

      <p className="tabular mt-2.5 text-[0.8125rem] break-all text-night-ink-soft">{proof.value}</p>

      <p className="mt-2.5 flex items-center gap-2 text-[0.8125rem] text-night-ink-soft">
        <Dot standing={proof.standing} />
        {standingText[proof.standing]}
      </p>

      {proof.found !== undefined && (
        <p className="mt-3 border-l-2 border-broken pl-2.5">
          <span className="text-[0.8125rem] font-semibold text-night-ink">
            The contract says
          </span>

          <span className="tabular mt-1 block text-[0.8125rem] break-all text-night-ink">
            {proof.found}
          </span>
        </p>
      )}
    </>
  );

  if (proof.href === undefined) {
    return <div>{body}</div>;
  }

  return (
    <a
      href={proof.href}
      target="_blank"
      rel="noreferrer"
      className="-mx-3 rounded-xs px-3 py-1 transition-colors duration-150 ease-settle hover:bg-night-raised"
    >
      {body}
    </a>
  );
}

/**
 * The state, as a shape rather than only a colour.
 *
 * A ring for unchecked, a filled dot for checked, a filled dot in the alarm
 * colour for broken. Somebody who cannot separate the two colours still gets
 * the answer, and the words beside it say it outright anyway.
 */
function Dot({ standing }: { standing: Standing }) {
  if (standing === "unchecked") {
    return (
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full ring-1 ring-night-ink-soft"
      />
    );
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

/**
 * The single claim a page leads with, spelled out rather than abbreviated.
 *
 * Used where there is room to say the whole thing: the transparency page, and
 * the top of a finished hackathon.
 */
export function ProofHeadline({
  standing,
  digest,
}: {
  standing: Standing;
  digest: string;
}) {
  const said = {
    verified: "These are the rules that were locked.",
    broken: "These are not the rules that were locked.",
    unchecked: "Nobody has checked these against the chain yet.",
  }[standing];

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2.5 text-[0.9375rem] text-ink">
        <Dot standing={standing} />
        {said}
      </p>

      <Chain title="The digest the contract stored when the rules were locked">
        {digest}
      </Chain>
    </div>
  );
}
