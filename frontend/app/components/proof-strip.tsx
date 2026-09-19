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
 */

export type Standing = "verified" | "broken" | "unchecked";

export interface Proof {
  /** What is being claimed. */
  label: string;
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
  verified: "checks out",
  broken: "does not match",
  unchecked: "not checked yet",
};

export function ProofStrip({ proofs }: { proofs: Proof[] }) {
  return (
    <section
      aria-label="What the chain says"
      className="grain relative overflow-hidden bg-night text-night-ink"
    >
      <div className="mx-auto grid w-full max-w-[76rem] gap-px px-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
        {proofs.map((proof) => (
          <Fact key={proof.label} proof={proof} />
        ))}
      </div>
    </section>
  );
}

function Fact({ proof }: { proof: Proof }) {
  const body = (
    <>
      <p className="label text-night-ink-soft">{proof.label}</p>

      <p className="mt-2 tabular text-sm break-all text-night-ink">{proof.value}</p>

      <p className="label mt-3 flex items-center gap-2 text-night-ink-soft">
        <Dot standing={proof.standing} />
        {standingText[proof.standing]}
      </p>

      {proof.found !== undefined && (
        <p className="mt-2 border-l-2 border-broken pl-2.5">
          <span className="label text-night-ink-soft">the contract says</span>

          <span className="mt-1 block tabular text-sm break-all text-night-ink">
            {proof.found}
          </span>
        </p>
      )}
    </>
  );

  if (proof.href === undefined) {
    return <div className="px-4 py-4">{body}</div>;
  }

  return (
    <a
      href={proof.href}
      target="_blank"
      rel="noreferrer"
      className="px-4 py-4 transition-colors duration-150 ease-settle hover:bg-night-raised"
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
        className="size-2 rounded-full ring-1 ring-night-ink-soft"
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`size-2 rounded-full ${
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
