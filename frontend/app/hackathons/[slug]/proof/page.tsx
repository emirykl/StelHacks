import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, Chain, Eyebrow, Measure } from "../../../components/primitives";
import { findHackathon } from "../../../../lib/chain";
import { explorerFor } from "../../../../lib/explorer";
import { countHackers } from "../../../../lib/hackers";
import { cardsOf } from "../../../../lib/project";
import { decisions, resultsOf, tracksOf } from "../../../../lib/results";
import { rootsOf } from "../../../../lib/roots";
import { entriesOf } from "../../../../lib/submissions";
import { titleOf } from "../../../../lib/words";

/**
 * The whole receipt, on one page.
 *
 * Everywhere else the chain is mentioned in passing: a digest under a heading,
 * a strip at the foot of a page, a dialog behind a button. Each of those is the
 * right size for the page it is on and none of them answers the question this
 * one does, which is "show me all of it".
 *
 * Read with no account and no wallet. That is not a nicety: a proof somebody
 * has to sign in to see is a proof about their relationship with us rather than
 * about the event, and the whole argument this page makes is that nothing here
 * depends on us at all.
 *
 * Nothing sealed appears. Before the reveal the scorecards and the ballots are
 * digests nobody can open, including us, and a page that showed a placeholder
 * where they will be would be inviting a reader to watch a space. It shows the
 * root instead, which is the thing that will prove them.
 */

export const dynamic = "force-dynamic";

export default async function Proof({ params }: PageProps<"/hackathons/[slug]/proof">) {
  const { slug } = await params;
  const hackathon = await findHackathon(slug);

  if (hackathon === null) {
    notFound();
  }

  const contract = hackathon.contract_id;
  const tracks = await tracksOf(contract);

  const [entries, cards, results, roots, hackers] = await Promise.all([
    entriesOf(contract, false),
    cardsOf(contract),
    resultsOf(contract, tracks),
    rootsOf(contract),
    countHackers(contract),
  ]);

  const rules = hackathon.rules;
  const ranked = results.filter((result) => result.places.length > 0);

  return (
    <main className="flex-1">
      <Measure className="py-10 sm:py-14">
        <Eyebrow>Proof</Eyebrow>

        <h1 className="mt-2 text-[clamp(1.75rem,3.5vw,2.5rem)] text-balance">{hackathon.name}</h1>

        <p className="mt-4 max-w-[42rem] text-ink-soft">
          Everything below was read from the chain, not from us. Follow any link to check it against
          a block explorer, and hash the rules yourself to see that they are the ones announced
          before anybody entered.
        </p>

        <p className="mt-4">
          <Link
            href={`/hackathons/${slug}`}
            className="text-[0.9375rem] underline underline-offset-4 hover:text-ink"
          >
            Back to the hackathon
          </Link>
        </p>

        <div className="mt-10 grid gap-6">
          <Section title="The rules">
            <Line
              label="Rules digest"
              said="A fingerprint of the frozen rules. Rebuild them from the public page, hash them, and compare."
              value={hackathon.constitution_hash}
              waiting="The rules are not locked yet."
            />
            {rules !== null && (
              <>
                <Line label="Document version" value={String(rules.version)} plain />
                <Line
                  label="Score split"
                  value={`${rules.judgeBps / 100}% judges, ${rules.communityBps / 100}% community`}
                  plain
                />
                {rules.communityBps > 0 && (
                  <Line
                    label="One ballot"
                    value={`${rules.votePower} points across at most ${rules.maxChoices} projects`}
                    plain
                  />
                )}
                <Line label="Judges" value={String(rules.judges)} plain />
                <Line label="Scorecards a project needs" value={String(rules.judgeQuorum)} plain />
              </>
            )}
          </Section>

          <Section title="The money">
            <Line
              label="Prize vault"
              said="Holds the prize. It has no owner and no withdrawal; only the hackathon contract can move anything out, and only once a result is final."
              value={hackathon.vault_id}
              kind="contract"
              waiting="No vault is bound yet."
            />
            <Line
              label="Prize token"
              said="The token the prizes are denominated in and paid in."
              value={hackathon.asset ?? hackathon.prize_asset}
              kind="contract"
            />
          </Section>

          <Section title="Who is responsible">
            <Line
              label="Hackathon contract"
              said="Holds the rules, the phase and the result."
              value={contract}
              kind="contract"
            />
            <Line
              label="Organizer"
              said="The only key that can screen entries or move the event on. It cannot change the rules or reach the money."
              value={hackathon.organizer}
              kind="account"
            />
            <Line label="Admitted to take part" value={String(hackers)} plain />
          </Section>

          <Section title="The entries">
            {entries.length === 0 ? (
              <Empty>Nothing has been entered yet.</Empty>
            ) : (
              <ul className="grid gap-4">
                {entries.map((entry) => (
                  <li key={entry.team} className="grid gap-1.5">
                    <p className="font-medium">
                      {cards[entry.team]?.title ?? `Team ${entry.team}`}
                      {entry.invalid && (
                        <span className="ml-2 text-[0.875rem] font-normal text-ink-faint">
                          ruled out in screening
                        </span>
                      )}
                    </p>

                    <p className="text-[0.875rem] text-ink-faint">Track: {titleOf(entry.track)}</p>

                    <Chain title="What the contract pinned about this project">
                      {entry.digest}
                    </Chain>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="The sealed work">
            <Line
              label="Scorecard root"
              said="One digest committing to every scorecard, published while they were all still unreadable. A judge holding a receipt can prove theirs is under it."
              value={roots.scores}
              waiting="The judging window has not closed yet."
            />
            <Line
              label="Ballot root"
              said="The same for the community vote."
              value={roots.ballots}
              waiting={
                rules !== null && rules.communityBps === 0
                  ? "This hackathon is decided by its judges, so there is no community vote."
                  : "The vote has not closed yet."
              }
            />
          </Section>

          <Section title="The result">
            {ranked.length === 0 ? (
              <Empty>No ranking has been computed yet.</Empty>
            ) : (
              ranked.map((result) => (
                <div key={result.track} className="grid gap-3">
                  <p className="label text-[0.8125rem] tracking-[0.16em] text-ink-faint">
                    {titleOf(result.track)}
                  </p>

                  <ol className="grid gap-2">
                    {result.places.map((place) => (
                      <li
                        key={place.team}
                        className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1"
                      >
                        <span>
                          <span className="tabular-nums text-ink-faint">{place.rank}.</span>{" "}
                          {cards[place.team]?.title ?? `Team ${place.team}`}
                        </span>

                        <span className="text-[0.875rem] text-ink-soft">
                          decided {decisions[place.decidedBy] ?? "on score"}
                          {place.paid && " · prize paid"}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))
            )}
          </Section>
        </div>
      </Measure>
    </main>
  );
}

/** One titled card, which is how every long page here is broken up. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="text-[1.25rem]">{title}</h2>

      <div className="mt-5 grid gap-5">{children}</div>
    </Card>
  );
}

/**
 * One fact, with what it means underneath and a way to check it beside.
 *
 * A value that is not there yet says why in the same place the value would
 * have been, rather than being left out. Which of the two is right depends on
 * whether the absence is information: "no vault bound yet" tells a reader
 * where the event has got to, and an empty space tells them nothing.
 */
function Line({
  label,
  said,
  value,
  kind,
  waiting,
  plain = false,
}: {
  label: string;
  said?: string;
  value: string | null | undefined;
  kind?: "contract" | "account";
  waiting?: string;
  /** A value to read rather than to check: a count, a percentage, a version. */
  plain?: boolean;
}) {
  const missing = value === null || value === undefined || value.length === 0;

  if (missing && waiting === undefined) {
    return null;
  }

  return (
    <div className="grid gap-1.5">
      <p className="text-[0.875rem] font-medium">{label}</p>

      {said !== undefined && <p className="max-w-[40rem] text-[0.875rem] text-ink-soft">{said}</p>}

      {missing ? (
        <p className="text-[0.875rem] text-ink-faint">{waiting}</p>
      ) : plain ? (
        <p>{value}</p>
      ) : kind === undefined ? (
        <Chain>{value}</Chain>
      ) : (
        <a
          href={explorerFor(kind, value)}
          target="_blank"
          rel="noreferrer"
          className="tabular break-all text-[0.875rem] text-ink underline underline-offset-4 hover:text-ink-soft"
        >
          {value}
        </a>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.9375rem] text-ink-faint">{children}</p>;
}
