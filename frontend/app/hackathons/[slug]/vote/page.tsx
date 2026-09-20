import Link from "next/link";
import { notFound } from "next/navigation";

import { findHackathon } from "../../../../lib/chain";
import { cardsOf } from "../../../../lib/project";
import { rulesFor } from "../../../../lib/rules";
import { entriesOf } from "../../../../lib/submissions";
import { Ballot } from "./ballot";

/**
 * Where the crowd gets its say, on a page of its own.
 *
 * Not a tab on the hackathon. A tab is somewhere a visitor wanders through
 * while deciding what they think of an event; this is a thing somebody came to
 * do, it can be done once, and it is over in a minute. The judge's console is
 * laid out the same way for the same reason.
 *
 * Everything that decides whether a ballot counts is read from the chain rather
 * than from here — who was admitted, how many points they hold, how far they
 * may spread them, whether the window is open. This page only has to be honest
 * about what it read.
 */

export const dynamic = "force-dynamic";

export default async function Vote({ params }: PageProps<"/hackathons/[slug]/vote">) {
  const { slug } = await params;
  const hackathon = await findHackathon(slug);

  if (hackathon === null) {
    notFound();
  }

  const [entries, cards, rules] = await Promise.all([
    entriesOf(hackathon.contract_id, false),
    cardsOf(hackathon.contract_id),
    rulesFor(hackathon.contract_id),
  ]);

  /* A project struck out in screening is not in the running, and a point placed
     on it would fall away at the reveal. Leaving it off the ballot is the only
     honest thing the page can do with it. */
  const standing = entries.filter((entry) => !entry.invalid);

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-[64rem] px-6 py-10 sm:py-12">
        <p className="label text-[0.8125rem] tracking-[0.16em] text-ink-faint">Community vote</p>

        <h1 className="mt-2 text-[clamp(1.75rem,3.5vw,2.5rem)]">{hackathon.name}</h1>

        <p className="mt-3 max-w-[46rem] text-ink-soft">
          <Link href={`/hackathons/${slug}`} className="underline underline-offset-4">
            Back to the hackathon
          </Link>
        </p>

        <Ballot
          contractId={hackathon.contract_id}
          entries={standing.map((entry) => ({
            team: entry.team,
            track: entry.track,
            card: cards[entry.team] ?? null,
          }))}
          power={rules?.votePower ?? 0}
          maxChoices={rules?.maxChoices ?? 0}
        />
      </div>
    </main>
  );
}
