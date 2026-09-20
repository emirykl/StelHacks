import { EXPLORER } from "../../../lib/explorer";
import { Measure } from "../../components/primitives";
import { SpecButton, SpecRow, SpecRows, SpecValue } from "../../components/spec";
import { windowsOf } from "../../../lib/rules";
import { WEIGHT_TOTAL_BPS } from "../../../lib/constitution";
import { prizeLabel, worthOf } from "../../../lib/money";
import type { HackathonDetail } from "../../../lib/chain";
import type { Rules } from "../../../lib/rules";

/**
 * Everything about a hackathon that is not a person and not a build.
 *
 * Read as a document, so it is laid out as one: a contents list down the side
 * and the sections themselves in order beside it. Somebody deciding whether to
 * enter is looking for one thing at a time, usually the prize or the deadline
 * or whether their idea counts, and a page they have to scroll to find out what
 * is on it is a page they scroll past.
 *
 * The sections are the ones the contract can actually answer. Everything below
 * the introduction is read from the frozen document on this request rather than
 * written by us: the prize table, the weights, the quorum, the team limit. That
 * is the difference between a hackathon page and a poster.
 *
 * It is set almost entirely in the interface face. An earlier version put the
 * values in tracked out monospaced capitals, which is the chain's voice, on the
 * theory that they came from the chain. They do, but a reader cannot read them
 * that way: mono capitals are for a digest somebody compares character by
 * character, not for the words "up to five people".
 */

interface Part {
  id: string;
  title: string;
  /** Left out when the contract had nothing to say about it. */
  when?: boolean;
}

export async function Details({ hackathon }: { hackathon: HackathonDetail }) {
  const rules = hackathon.rules;

  const parts: Part[] = [
    { id: "introduction", title: "Introduction", when: hackathon.description !== null },
    { id: "timeline", title: "Timeline", when: rules !== null },
    { id: "prizes", title: "Prizes", when: rules !== null && rules.tiers.length > 0 },
    { id: "judging", title: "Judging criteria", when: rules !== null },
    { id: "taking-part", title: "Taking part", when: rules !== null },
    { id: "on-chain", title: "On chain" },
  ].filter((part) => part.when !== false);

  return (
    <Measure wide className="py-12">
      <div className="grid gap-10 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-14">
        <Outline parts={parts} />

        <div className="grid min-w-0 gap-8">
          {hackathon.description !== null && (
            <Part id="introduction" title="Introduction">
              {/* Held to a reading measure inside a wider box. A line of text
                  past about seventy five characters costs the reader the return
                  sweep, and no amount of screen makes that worth spending. */}
              <p className="max-w-[46rem] whitespace-pre-line text-[1rem] leading-relaxed text-ink-soft">
                {hackathon.description}
              </p>
            </Part>
          )}

          {rules !== null && (
            <>
              <Part id="timeline" title="Timeline">
                <Timeline rules={rules} />
              </Part>

              {rules.tiers.length > 0 && (
                <Part id="prizes" title="Prizes">
                  <Prizes rules={rules} asset={hackathon.asset} />
                </Part>
              )}

              <Part id="judging" title="Judging criteria">
                <Judging rules={rules} />
              </Part>

              <Part id="taking-part" title="Taking part">
                <TakingPart rules={rules} />
              </Part>
            </>
          )}

          <Part id="on-chain" title="On chain">
            {/* The one place the chain's own voice belongs, because these are
                the values somebody compares character by character.

                Everything that has a page on an explorer links to it. Two rows
                used to and three did not, which read as the other three being
                somehow less checkable rather than as nobody having wired them
                up. The digest still does not: it is a hash of a document, not
                an address, and there is nothing at the far end to open. */}
            <SpecRows>
              <SpecRow index="1" label="Rules digest" mark>
                <SpecValue>{hackathon.constitution_hash ?? "not locked yet"}</SpecValue>
              </SpecRow>

              <SpecRow index="2" label="Hackathon" mark>
                <Explorable value={hackathon.contract_id} kind="contract" />
              </SpecRow>

              <SpecRow index="3" label="Prize vault" mark={hackathon.vault_id !== null}>
                <Explorable value={hackathon.vault_id} kind="contract" missing="not bound yet" />
              </SpecRow>

              <SpecRow index="4" label="Organizer">
                <Explorable value={hackathon.organizer} kind="account" missing="not published yet" />
              </SpecRow>

              <SpecRow index="5" label="Prize asset">
                <Explorable
                  value={hackathon.prize_asset}
                  kind="contract"
                  missing="not published yet"
                />
              </SpecRow>
            </SpecRows>

          </Part>
        </div>
      </div>
    </Measure>
  );
}

/** An address, and the way to go and check it. */
function Explorable({
  value,
  kind,
  missing,
}: {
  value: string | null;
  /** An account and a contract are different pages on the explorer. */
  kind: "contract" | "account";
  missing?: string;
}) {
  if (value === null) {
    return <span className="text-[0.875rem] text-ink-faint">{missing ?? "not published yet"}</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <SpecValue>{value}</SpecValue>

      <SpecButton href={`https://stellar.expert/explorer/${EXPLORER}/${kind}/${value}`}>
        Explorer
      </SpecButton>
    </div>
  );
}

/**
 * The contents, which is what turns a long page into a short one.
 *
 * Sticky under the tab bar, so it stays reachable however far down somebody
 * has read. Hidden on a narrow screen: stacked above the content it becomes a
 * list somebody scrolls past to reach the thing the list was pointing at.
 */
function Outline({ parts }: { parts: Part[] }) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-32">
        <p className="label text-ink-faint">Outline</p>

        <nav className="mt-4 grid gap-1" aria-label="On this page">
          {parts.map((part) => (
            <a
              key={part.id}
              href={`#${part.id}`}
              className="-mx-2 rounded-xs px-2 py-1.5 text-[0.875rem] text-ink-soft transition-colors duration-150 ease-settle hover:bg-paper-sunk hover:text-ink"
            >
              {part.title}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}

/**
 * One section, with its name sitting on its own top edge.
 *
 * The heading straddles the border rather than sitting inside it, which is the
 * shape a fieldset has had since forms were paper. It does one useful thing: a
 * reader scrolling fast sees where a section starts without the heading needing
 * to be large, so the page can carry six of them without shouting six times.
 *
 * `scroll-mt` is what makes the contents list land correctly. Without it an
 * anchor puts the heading under the sticky tab bar and the reader arrives at a
 * section whose name they cannot see.
 */
function Part({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="relative scroll-mt-32 border border-rule bg-paper px-6 pb-6 pt-9">
      <h2 className="absolute -top-3.5 left-5 bg-paper px-2 text-[1.375rem]">{title}</h2>

      {children}
    </section>
  );
}

/**
 * The deadlines, one line each.
 *
 * Only the closing moment is shown. A window was printed as "opens → closes",
 * which is twice the text for one fact somebody acts on: what they have to be
 * done by. When it opened matters on the day it opens and never again.
 *
 * Set in the interface face rather than the chain's. Mono figures are for a
 * digest compared character by character; a date is read, not compared.
 */
function Timeline({ rules }: { rules: Rules }) {
  const windows = windowsOf(rules);

  return (
    <ul className="grid gap-0">
      {windows.map((span, at) => (
        <li
          key={span.label}
          className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 ${
            at === windows.length - 1 ? "" : "border-b border-rule"
          }`}
        >
          <span
            className={`text-[0.9375rem] ${
              span.standing === "now"
                ? "text-ink"
                : span.standing === "past"
                  ? "text-ink-faint"
                  : "text-ink"
            }`}
          >
            {span.label}
            {span.standing === "now" && <span className="ml-2.5 text-verified">·</span>}
          </span>

          <span
            className={`text-[0.9375rem] ${
              span.standing === "past" ? "text-ink-faint" : "text-ink-soft"
            }`}
          >
            <When at={span.to ?? span.from} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A deadline in the reader's own clock.
 *
 * It was UTC, with a line under the table explaining so. UTC is right for a
 * digest and wrong for a person working out whether they can finish by Sunday
 * evening, and a footnote explaining a timezone is a footnote that exists
 * because the number above it was the wrong one.
 *
 * Hydration is suppressed because the server and the browser are in different
 * places, and the browser is the one that is right.
 */
function When({ at }: { at: number }) {
  return (
    <span suppressHydrationWarning>
      {new Date(at * 1_000).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </span>
  );
}

/**
 * What each place pays, per track.
 *
 * The table used to carry a pool total under it and a paragraph under that
 * about the vault. Both are true and neither is what somebody reads a prize
 * table for: they want to know what winning gets them. The pool is already the
 * headline figure in the rail at the top of the page, and how the vault works
 * is the whole of the how-it-works page.
 */
function Prizes({ rules, asset }: { rules: Rules; asset: string | null }) {
  /* Grouped under the category that pays them rather than repeating its name on
     every row. A track with three places said "in payments" three times. */
  const tracks = [...new Set(rules.tiers.map((tier) => tier.track))];

  return (
    <div className="grid gap-6">
      {tracks.map((track) => {
        const tiers = rules.tiers.filter((tier) => tier.track === track);

        return (
          <div key={track}>
            <h3 className="mb-1 text-[0.9375rem] text-ink-soft">{track}</h3>

            <ul className="grid gap-0">
              {tiers.map((tier, at) => (
                <li
                  key={tier.rank}
                  className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 ${
                    at === tiers.length - 1 ? "" : "border-b border-rule"
                  }`}
                >
                  <span className="flex items-baseline gap-2.5 text-[0.9375rem] text-ink">
                    {/* A medal for the three places that have one. Hidden from
                        a screen reader: the word beside it already says which
                        place this is, and "first place medal, First" is the
                        same fact twice. */}
                    <span aria-hidden className="text-[1.0625rem]">
                      {MEDALS[tier.rank] ?? ""}
                    </span>
                    {ordinal(tier.rank)}
                  </span>

                  <Amount amount={tier.amount} asset={asset} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Gold, silver and bronze. Fourth place onwards has no medal and gets none. */
const MEDALS: Record<number, string> = { 1: "\u{1F947}", 2: "\u{1F948}", 3: "\u{1F949}" };

/** One tier, in the asset it will actually be paid in. */
async function Amount({ amount, asset }: { amount: bigint; asset: string | null }) {
  const worth = await worthOf(asset, amount);
  const shown = prizeLabel(worth, amount);

  return (
    <span className="text-[0.9375rem] text-ink">
      {shown.figure} <span className="font-bold text-ink">{shown.code}</span>
    </span>
  );
}

/**
 * What a judge scores and how much each thing is worth.
 *
 * The weights are the whole of it. They were locked before anybody entered, so
 * a team can read this and know exactly what they are being measured against,
 * which is the difference between a rubric and a promise.
 */
function Judging({ rules }: { rules: Rules }) {
  return (
    <>
      {rules.tracks.map((track) => (
        <div key={track.id} className="mb-7 last:mb-0">
          {/* Named only when there is more than one. A heading over the single
              category every small event has is a heading that labels the whole
              section twice. */}
          {rules.tracks.length > 1 && (
            <h3 className="mb-2 text-[0.9375rem] text-ink-soft">{track.id}</h3>
          )}

          <ul className="grid gap-0">
            {track.criteria.map((criterion, at) => (
              <li
                key={criterion.id}
                className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 ${
                  at === track.criteria.length - 1 ? "" : "border-b border-rule"
                }`}
              >
                <span className="text-[0.9375rem] text-ink">{criterion.id}</span>

                <span className="text-[0.9375rem] text-ink-soft">
                  {percent(criterion.weightBps)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Only when the crowd has a share. "Judges 100%" is the answer to a
          question nobody asked about an event with no community vote. */}
      {rules.communityBps > 0 && (
        <p className="mt-5 border-t border-rule pt-4 text-[0.875rem] text-ink-soft">
          Judges decide {percent(rules.judgeBps)}, the crowd {percent(rules.communityBps)}.
        </p>
      )}
    </>
  );
}

/** Who can enter, in what shape, with what attached. */
function TakingPart({ rules }: { rules: Rules }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <Fact
        term="Team size"
        said={`Up to ${rules.maxTeamSize} ${rules.maxTeamSize === 1 ? "person" : "people"}`}
      />

      <Fact
        term="More than one team"
        said={rules.multiTeamAllowed ? "Allowed" : "One team each"}
      />

      <Fact term="A build must have" said={needed(rules)} />
    </dl>
  );
}

/** A named fact, set so the name is quiet and the answer is not. */
function Fact({ term, said }: { term: string; said: string }) {
  return (
    <div>
      <dt className="label text-ink-faint">{term}</dt>

      <dd className="mt-1.5 text-[0.9375rem] font-semibold leading-snug text-ink">{said}</dd>
    </div>
  );
}

/** Basis points, as the percentage a person reads them as. */
function percent(bps: number): string {
  const share = (bps / WEIGHT_TOTAL_BPS) * 100;

  return `${Number.isInteger(share) ? share : share.toFixed(1)}%`;
}

/** What the contract will refuse a submission for missing. */
function needed(rules: Rules): string {
  const parts = [
    rules.requires.repository ? "a repository" : null,
    rules.requires.demoVideo ? "a demo video" : null,
    rules.requires.liveUrl ? "something running" : null,
  ].filter((part): part is string => part !== null);

  return parts.length === 0 ? "A link, and nothing else is compulsory" : upper(parts.join(", "));
}

function upper(said: string): string {
  return said.charAt(0).toUpperCase() + said.slice(1);
}

/**
 * A payable position, said the way somebody would say it out loud.
 *
 * "First place" rather than "First" or "1st". This is the line a person reads
 * to work out what winning is worth, and the compact forms are for a badge
 * beside a result that is already labelled, not for the prize table itself.
 */
function ordinal(rank: number): string {
  const names = [
    "",
    "First place winner",
    "Second place winner",
    "Third place winner",
    "Fourth place winner",
    "Fifth place winner",
  ];

  return names[rank] ?? `Place ${rank} winner`;
}
