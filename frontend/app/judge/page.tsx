import { Mine } from "./mine";

/**
 * Everything one wallet has been asked to judge.
 *
 * A judge used to have no way in at all: the organizer sent them a link to one
 * contract and that link was the whole product as far as they were concerned.
 * Lose it and there was nothing to go back to, and judging two events meant
 * keeping two links somewhere.
 *
 * Laid out as the organizer's panel is, because it is the same kind of room:
 * a desk with a job on it, reached by somebody who already knows why they came.
 */

export const dynamic = "force-dynamic";

export default function Judging() {
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-[60rem] px-6 py-10 sm:py-12">
        <p className="label text-[0.8125rem] tracking-[0.16em] text-ink-faint">Judge</p>

        <h1 className="mt-2 text-[clamp(1.75rem,3.5vw,2.5rem)]">Judging</h1>

        <p className="mt-4 max-w-[40rem] text-[1rem] leading-relaxed text-ink-soft">
          The hackathons whose rules name your wallet. Nobody can add you to one
          after it is locked, and nobody can take you off it either.
        </p>
      </div>

      <div className="mx-auto w-full max-w-[60rem] px-6 pb-24">
        <Mine />
      </div>
    </main>
  );
}
