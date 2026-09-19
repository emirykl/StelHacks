import { Measure } from "../../components/primitives";
import { SpecButton, SpecRow, SpecRows, SpecValue } from "../../components/spec";
import { VISIBILITY, windowsOf, type Window } from "../../../lib/rules";
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
            <p className="max-w-[46rem] text-[0.9375rem] leading-relaxed text-ink-soft">
              Every address below can be opened in a block explorer. Nothing on
              this page has to be taken on our word, including this page.
            </p>

            {/* The one place the chain's own voice belongs, because these are
                the values somebody compares character by character. */}
            <div className="mt-6">
              <SpecRows>
                <SpecRow index="01" label="Rules digest" mark>
                  <SpecValue>{hackathon.constitution_hash ?? "not locked yet"}</SpecValue>
                </SpecRow>

                <SpecRow index="02" label="Hackathon" mark>
                  <div className="flex flex-wrap items-center gap-4">
                    <SpecValue>{hackathon.contract_id}</SpecValue>
                    <SpecButton
                      href={`https://stellar.expert/explorer/testnet/contract/${hackathon.contract_id}`}
                    >
                      Explorer
                    </SpecButton>
                  </div>
                </SpecRow>

                <SpecRow index="03" label="Prize vault" mark={hackathon.vault_id !== null}>
                  {hackathon.vault_id === null ? (
                    <span className="text-[0.875rem] text-ink-faint">not bound yet</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-4">
                      <SpecValue>{hackathon.vault_id}</SpecValue>
                      <SpecButton
                        href={`https://stellar.expert/explorer/testnet/contract/${hackathon.vault_id}`}
                      >
                        Explorer
                      </SpecButton>
                    </div>
                  )}
                </SpecRow>

                <SpecRow index="04" label="Organizer">
                  <SpecValue>{hackathon.organizer ?? "not published yet"}</SpecValue>
                </SpecRow>

                <SpecRow index="05" label="Prize asset">
                  <SpecValue>{hackathon.prize_asset ?? "not published yet"}</SpecValue>
                </SpecRow>
              </SpecRows>
            </div>
          </Part>
        </div>
      </div>
    </Measure>
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

/** The windows, spelled out in words rather than compressed into a rail. */
function Timeline({ rules }: { rules: Rules }) {
  const windows = windowsOf(rules);

  return (
    <ul className="grid gap-0">
      {windows.map((span, at) => (
        <li
          key={span.label}
          className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3.5 ${
            at === windows.length - 1 ? "" : "border-b border-rule"
          }`}
        >
          <span
            className={`text-[0.9375rem] ${
              span.standing === "now"
                ? "font-bold text-ink"
                : span.standing === "past"
                  ? "text-ink-faint"
                  : "text-ink"
            }`}
          >
            {span.label}
            {span.standing === "now" && (
              <span className="ml-3 bg-verified px-2 py-0.5 align-middle text-[0.75rem] font-bold text-paper">
                now
              </span>
            )}
          </span>

          <span
            className={`tabular text-[0.875rem] ${
              span.standing === "past" ? "text-ink-faint" : "text-ink-soft"
            }`}
          >
            <When span={span} />
          </span>
        </li>
      ))}

      <li className="pt-4 text-[0.8125rem] text-ink-faint">
        All times UTC, from the schedule the contract froze.
      </li>
    </ul>
  );
}

function When({ span }: { span: Window }) {
  const full = (at: number) => {
    const when = new Date(at * 1_000);
    const pad = (value: number) => String(value).padStart(2, "0");

    return `${when.getUTCDate()} ${MONTHS[when.getUTCMonth()]} ${when.getUTCFullYear()} ${pad(
      when.getUTCHours(),
    )}:${pad(when.getUTCMinutes())}`;
  };

  return span.to === null ? (
    <>{full(span.from)}</>
  ) : (
    <>
      {full(span.from)} <span className="text-ink-faint">→</span> {full(span.to)}
    </>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * What is payable, per position.
 *
 * Ranked within a track, because that is how the contract holds it and how it
 * will pay. The total sits under the table rather than over it: a reader wants
 * to know what first place gets before they want to know what the pool is.
 */
async function Prizes({ rules, asset }: { rules: Rules; asset: string | null }) {
  const total = await worthOf(asset, rules.total);
  const shown = prizeLabel(total, rules.total);

  return (
    <>
      <ul className="grid gap-0">
        {rules.tiers.map((tier) => (
          <li
            key={`${tier.track}-${tier.rank}`}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule py-3.5"
          >
            <span className="text-[0.9375rem] text-ink">
              <span className="font-bold">{ordinal(tier.rank)}</span>
              <span className="text-ink-soft"> in {tier.track}</span>
            </span>

            <Amount amount={tier.amount} asset={asset} />
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <span className="text-[0.9375rem] font-semibold text-ink">Total in the vault</span>

        <span className="tabular text-[1.25rem] font-bold text-verified">
          {shown.figure} <span className="text-[0.875rem] font-bold text-ink-soft">{shown.code}</span>
        </span>
      </div>

      <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-faint">
        The vault was funded before registration opened and no one can withdraw
        from it. It pays out when the contract says the result is final.
      </p>
    </>
  );
}

/** One tier, in the asset it will actually be paid in. */
async function Amount({ amount, asset }: { amount: bigint; asset: string | null }) {
  const worth = await worthOf(asset, amount);
  const shown = prizeLabel(worth, amount);

  return (
    <span className="tabular text-[0.9375rem] font-bold text-verified">
      {shown.figure} <span className="text-[0.8125rem] font-bold text-ink-soft">{shown.code}</span>
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
        <div key={track.id} className="mb-8 last:mb-0">
          <h3 className="text-[1rem] font-semibold text-ink">{track.id}</h3>

          <ul className="mt-3 grid gap-0">
            {track.criteria.map((criterion) => (
              <li
                key={criterion.id}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule py-3"
              >
                <span className="text-[0.9375rem] text-ink">{criterion.id}</span>

                <span className="tabular text-[0.9375rem] font-bold text-ink">
                  {percent(criterion.weightBps)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <dl className="mt-6 grid gap-3 border-t border-rule pt-5 sm:grid-cols-2">
        <Fact
          term="Who decides"
          said={
            rules.communityBps > 0
              ? `Judges ${percent(rules.judgeBps)}, the crowd ${percent(rules.communityBps)}`
              : `Judges ${percent(rules.judgeBps)}`
          }
        />

        <Fact
          term="Judges"
          said={`${rules.judges} authorized, ${rules.judgeQuorum} needed on every project`}
        />
      </dl>
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
        said={rules.multiTeamAllowed ? "Allowed" : "One team each, and the contract enforces it"}
      />

      <Fact term="A build must have" said={needed(rules)} />

      <Fact
        term="Who reads the builds"
        said={
          [
            "Anybody, signed in or not",
            "Only entrants the organizer approved",
            "The organizer only, until the result",
          ][rules.visibility] ?? `Frozen as ${VISIBILITY[rules.visibility] ?? "unknown"}`
        }
      />
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

/** First, second, third: the way a prize table is read aloud. */
function ordinal(rank: number): string {
  const names = ["", "First", "Second", "Third", "Fourth", "Fifth"];

  return names[rank] ?? `Rank ${rank}`;
}
