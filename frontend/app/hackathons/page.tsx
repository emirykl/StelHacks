import { Eyebrow, Measure, Rule } from "../components/primitives";
import { HackathonCard } from "../components/hackathon-card";
import { listHackathons, type HackathonSummary } from "../../lib/chain";

/**
 * Everything running, readable by anybody.
 *
 * The listing is the observer surface at its simplest, and the thing it must
 * get right is not looking busy. A hackathon is a commitment somebody is
 * deciding whether to spend a weekend on; the two facts that decide it are what
 * stage the event is at and whether the prize is real.
 */

export const metadata = { title: "Hackathons" };

/** Read fresh. A phase that changed an hour ago and still reads as open is a lie. */
export const revalidate = 0;

export default async function Hackathons() {
  const hackathons = await listHackathons();

  return (
    <main className="flex-1">
      <section className="border-b border-rule">
        <Measure wide className="py-16 sm:py-20">
          <Eyebrow>Every event</Eyebrow>

          <h1 className="mt-4 text-[clamp(2rem,4.5vw,3.25rem)]">Hackathons</h1>

          <p className="mt-5 max-w-[38rem] text-[1.0625rem] leading-relaxed text-ink-soft">
            Rules frozen on chain, prize sitting in a contract. Open any of them
            without an account.
          </p>
        </Measure>
      </section>

      <Measure wide className="py-12">
        {hackathons.length === 0 ? <Empty /> : <List hackathons={hackathons} />}
      </Measure>
    </main>
  );
}

/* The same card as the home page, so a hackathon looks like itself wherever it
   turns up and there is one place to change how it reads. */
function List({ hackathons }: { hackathons: HackathonSummary[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {hackathons.map((hackathon) => (
        <HackathonCard key={hackathon.contract_id} hackathon={hackathon} />
      ))}
    </div>
  );
}

/**
 * Nothing to show, said plainly.
 *
 * An empty listing on a product like this usually means the indexer has not
 * reached anything yet rather than that no hackathon exists, and saying so is
 * more useful than an illustration of a box.
 */
function Empty() {
  return (
    <div className="py-16 text-center">
      <p className="text-[1.0625rem] text-ink">Nothing here yet.</p>

      <p className="mx-auto mt-3 max-w-[30rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        Either nobody has created one, or our indexer is behind the chain. The
        contract will tell you which.
      </p>

      <Rule className="mx-auto mt-10 max-w-[12rem]" />
    </div>
  );
}
