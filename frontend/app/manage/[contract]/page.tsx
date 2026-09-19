import { Eyebrow, Measure } from "../../components/primitives";
import { Console } from "./console";

/**
 * Running a hackathon, keyed on the contract rather than on a name.
 *
 * A hackathon exists on chain before anybody has typed a description for it,
 * and the organizer needs somewhere to go the moment after they create one. A
 * slug would require our indexer to have caught up first, which is the wrong
 * thing to make somebody wait for.
 */

export const metadata = { title: "Manage" };

export const dynamic = "force-dynamic";

export default async function Manage({ params }: PageProps<"/manage/[contract]">) {
  const { contract } = await params;

  return (
    <main className="flex-1">
      <section className="border-b border-rule">
        <Measure wide className="py-16 sm:py-20">
          <Eyebrow>Organizer</Eyebrow>

          <h1 className="mt-4 text-[clamp(2rem,4.5vw,3rem)]">Run it</h1>

          <p className="mt-5 tabular text-[0.8125rem] break-all text-ink-soft">{contract}</p>
        </Measure>
      </section>

      <section className="hatch">
        <Measure wide className="py-16">
          <Console contractId={contract} />
        </Measure>
      </section>
    </main>
  );
}
