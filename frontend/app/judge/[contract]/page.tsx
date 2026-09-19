import { Eyebrow, Measure } from "../../components/primitives";
import { JudgeConsole } from "./console";

/**
 * The judge's one visit.
 *
 * Keyed on the contract rather than on a name, for the same reason the
 * organizer's console is: a judge is given an address by the organizer, and
 * making them wait for our indexer to have caught up before they can score is
 * the wrong thing to make anybody wait for.
 */

export const dynamic = "force-dynamic";

export default async function Judge({ params }: PageProps<"/judge/[contract]">) {
  const { contract } = await params;

  return (
    <main className="flex-1">
      <section className="border-b border-rule">
        <Measure wide className="py-16 sm:py-20">
          <Eyebrow>Judge</Eyebrow>

          <h1 className="mt-4 text-[clamp(2rem,4.5vw,3rem)]">Score</h1>

          <p className="mt-5 max-w-[40rem] text-[1.0625rem] leading-relaxed text-ink-soft">
            One card per project, signed once. Nothing goes on chain and nothing
            costs you a fee; the cards stay sealed until the reveal opens them
            all at once.
          </p>
        </Measure>
      </section>

      <section className="hatch">
        <Measure wide className="py-16">
          <JudgeConsole contractId={contract} />
        </Measure>
      </section>
    </main>
  );
}
