import { notFound } from "next/navigation";

import { Details } from "./details";
import { Entries } from "./entries";
import { cardsOf } from "../../../lib/project";
import { Hackers } from "./hackers";
import { Masthead } from "./masthead";
import { Teams } from "./teams";
import { Progress } from "./progress";
import { ResultsBoard } from "./results";
import { Tabs } from "./tabs";
import { tabFrom } from "./tab";
import { countHackers } from "../../../lib/hackers";
import { countSubmissions } from "../../../lib/submissions";
import { findHackathon, type HackathonDetail } from "../../../lib/chain";

/**
 * One hackathon, as somebody with no account sees it.
 *
 * The order is the argument the product makes. Where it stands and how long is
 * left, then the masthead, which is the three facts somebody actually decides
 * on, then the tabs, which are four different questions about the same event
 * rather than four different pages.
 *
 * The offer to check the page against the contract used to be a black band over
 * all of it. It now sits inside "On chain" on the Details tab, beside the
 * addresses it checks, which is where a reader who wants to compare something
 * character by character was already going.
 *
 * Only the tab changes when a tab is chosen. The banner, the prize and the
 * deadline stay where they are, because those are what the whole page is about
 * and a reader comparing the builds against the deadline should not have to
 * scroll back for one of them.
 */

export const revalidate = 0;

export default async function Hackathon({
  params,
  searchParams,
}: PageProps<"/hackathons/[slug]">) {
  const [{ slug }, asked] = await Promise.all([params, searchParams]);
  const hackathon = await findHackathon(slug);

  if (hackathon === null) {
    notFound();
  }

  const at = tabFrom(asked["tab"]);
  const [projects, hackers] = await Promise.all([
    countSubmissions(hackathon.contract_id),
    countHackers(hackathon.contract_id),
  ]);

  return (
    <main className="flex-1">
      <Progress phase={hackathon.phase} rules={hackathon.rules} />

      <Masthead hackathon={hackathon} />

      <Tabs at={at} counts={{ projects, hackers }} />

      {at === "details" && <Details hackathon={hackathon} />}

      {at === "projects" && <Projects hackathon={hackathon} />}

      {/* Its own tab rather than the foot of the projects one. A result is what
          somebody comes back for after the event and it was reached by
          scrolling past every entry, which is the wrong order for a reader who
          already knows what was entered. */}
      {at === "results" && <ResultsBoard contractId={hackathon.contract_id} />}

      {at === "hackers" && <Hackers contractId={hackathon.contract_id} />}

      {/* Its own tab rather than a band under the three steps. Looking for a
          team is a different errand from entering: somebody browsing for people
          to build with is not halfway through applying, and the two stacked on
          one page read as one long form. */}
      {at === "find-team" && <Teams contractId={hackathon.contract_id} />}
    </main>
  );
}

/**
 * What was entered, when anything was.
 *
 * The notice about who may read these is drawn by `Entries`, which is the only
 * thing that knows whether there is anything to read. It used to be here, above
 * a list that turned out to be empty, so an event nobody had entered opened on
 * a paragraph about the reading rules of a gallery that did not exist.
 */
async function Projects({ hackathon }: { hackathon: HackathonDetail }) {
  /* Read here rather than inside the gallery, because the gallery is a client
     component: the entries come from the chain over RPC and the browser is
     where that has to happen. What the teams wrote is ours, and reading ours on
     the server keeps the cards from arriving a beat after their frames. */
  const cards = await cardsOf(hackathon.contract_id);

  return (
    <>
      <Entries
        contractId={hackathon.contract_id}
        slug={hackathon.slug}
        cards={cards}
      />
    </>
  );
}

