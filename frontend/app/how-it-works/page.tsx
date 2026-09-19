import { ButtonLink, Badge, Display, Eyebrow, Measure } from "../components/primitives";
import { SpecHeading, SpecLabel, SpecRow, SpecRows } from "../components/spec";
import { PHASES } from "../../lib/phase";

/**
 * The whole thing, explained once.
 *
 * Somebody deciding whether to run an event here, judge one, or give up a
 * weekend for one needs to know what they will be asked to do and in what
 * order. That is three different readers, and the page is arranged so each of
 * them can find their own list without reading the other two.
 *
 * The lifecycle comes first because everything else refers to it, and it is set
 * in the chain's voice because it is not our description of a process: it is
 * the state machine the contract compiled, in its own order and its own words.
 */

export const metadata = {
  description:
    "The ten stages a hackathon moves through, what each role does at each one, and what anybody can check without an account.",
};

export default function HowItWorks() {
  return (
    <main className="flex-1">
      <Intro />
      <Lifecycle />
      <Roles />
      <Checking />
    </main>
  );
}

function Intro() {
  return (
    <section className="border-b border-rule">
      {/* Wide, like every section below it. A narrower measure would read
          better on its own and would also start the page on a left edge that
          nothing else on it shares. */}
      <Measure wide className="py-20 sm:py-24">
        <Eyebrow>How it works</Eyebrow>

        <Display className="mt-5 max-w-[20ch] text-[clamp(2rem,5vw,3.5rem)]">
          Ten stages, one direction
        </Display>

        <p className="mt-6 max-w-[42rem] text-[1.0625rem] leading-relaxed text-ink-soft">
          A hackathon here is a contract that moves forward one stage at a time
          and never back. Each stage opens exactly one door. Below is the whole
          sequence, then what you actually do in it, depending on whether you are
          running the event, judging it, or building in it.
        </p>
      </Measure>
    </section>
  );
}

/**
 * The stages, named as the contract names them.
 *
 * Not translated into friendlier words. Somebody reading "Screening" here and
 * "Screening" on the contract can tell they are the same claim, and that is
 * worth more than a softer noun.
 */
function Lifecycle() {
  const stages: string[] = [
    "The organizer writes the rules. Nothing is binding and anything can still change.",
    "The prize goes into the vault. Registration cannot open until the whole prize table is in there.",
    "The event runs. People apply, teams form, projects arrive.",
    "The organizer clears spam and rule breaches, before a single score exists to be swayed by it.",
    "Judges score and eligible wallets vote. Both are sealed, so the crowd never votes with the judge table in front of it.",
    "Every scorecard and every ballot opens at once.",
    "The contract computes the ranking from the formula that was locked. It will not accept one from anywhere else.",
    "The vault pays the winners, one place at a time.",
    "Nothing can change. The page is the record.",
  ];

  return (
    <section className="hatch border-b border-rule">
      <Measure wide className="py-16 sm:py-20">
        <SpecLabel index="01">Lifecycle</SpecLabel>

        <SpecHeading className="mt-3">The stages, in order</SpecHeading>

        <div className="mt-10">
          <SpecRows>
            {stages.map((what, index) => (
              <SpecRow
                key={PHASES[index]}
                index={String(index).padStart(2, "0")}
                label={PHASES[index] ?? ""}
              >
                <p className="text-[0.9375rem] leading-relaxed">{what}</p>
              </SpecRow>
            ))}
          </SpecRows>
        </div>

        {/* Cancelled is not the tenth step of the sequence, it is the way out of
            it, and putting it at the bottom of the same list would read as
            somewhere every hackathon eventually arrives. */}
        <div className="mt-10 max-w-[46rem] border-l-2 border-rule-strong pl-5">
          <SpecLabel index="09">Cancelled</SpecLabel>

          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
            The one exit off that line. A hackathon can only end this way under a
            cancellation policy the organizer declared before the rules were
            locked, and once a ranking exists it cannot be taken. Everything in
            the vault goes back.
          </p>
        </div>
      </Measure>
    </section>
  );
}

/**
 * The same process again, as three lists of things to do.
 *
 * The lifecycle above says what happens. This says what is asked of you, which
 * is the only part most readers came for.
 */
function Roles() {
  const roles = [
    {
      who: "If you are running it",
      steps: [
        "Write the rules in Draft: tracks, the prize for each place, the rubric and what each criterion is worth, the schedule, the judges, and any discretion you might need later.",
        "Lock them. They are hashed and frozen from that moment, and the digest goes on the hackathon page for anyone to compare.",
        "Create the vault, bind it to the hackathon, and deposit the full prize table. Anyone can top it up; nobody can take anything out.",
        "Publish, then work through applications and screening as they come.",
        "Move each stage on once its deadline has passed. The contract will not let you skip one.",
      ],
      note: "Extensions, disqualification and cancellation stay available, but only if you announced them before the lock, and each one leaves a reason on chain.",
    },
    {
      who: "If you are judging",
      steps: [
        "Score your assigned projects under seal. Your card is hashed and only the root of the tree goes on chain, so nothing leaks before the reveal.",
        "Recuse yourself from anything you are too close to. It is recorded as a recusal, so it never reads as a card you quietly withheld.",
        "At the reveal every card opens together, yours included.",
        "Keep your receipt. It proves your card was in the tree that was counted, and it is what you produce if it was not.",
      ],
      note: "A disqualification or a cancellation needs judge signatures, not just the organizer's word.",
    },
    {
      who: "If you are building",
      steps: [
        "Read the rules before you commit anything. The prize, the rubric and the deadline are all fixed by the time registration opens.",
        "Apply, then start a team or join one once you are approved.",
        "Submit before the deadline. What goes on chain is a link and a hash of what you handed in, so nobody can swap it afterwards.",
        "If you are disqualified you get an appeal window, and the ranking waits for it.",
      ],
      note: "A team prize is split equally between members and paid to each wallet directly. Nobody holds anybody else's share.",
    },
  ];

  return (
    <section className="border-b border-rule">
      <Measure wide className="py-16 sm:py-20">
        <div className="max-w-[34rem]">
          <Eyebrow>What you do</Eyebrow>

          <h2 className="mt-4 text-[clamp(1.75rem,3.5vw,2.5rem)]">
            Three lists, pick yours
          </h2>
        </div>

        <div className="mt-14 grid gap-x-10 gap-y-14 lg:grid-cols-3">
          {roles.map((role) => (
            <div key={role.who}>
              <h3 className="display text-[1.375rem]">{role.who}</h3>

              {/* Numbered, because these are ordered and a bullet would say they
                  are not. The number sits outside the text column so the steps
                  read as a column rather than as a ragged left edge. */}
              <ol className="mt-6 border-t border-rule">
                {role.steps.map((step, index) => (
                  <li
                    key={step}
                    className="grid grid-cols-[1.75rem_1fr] gap-3 border-b border-rule py-4"
                  >
                    <span className="label pt-0.5 text-ink-faint">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{step}</p>
                  </li>
                ))}
              </ol>

              <p className="mt-5 text-[0.875rem] leading-relaxed text-ink-faint">
                {role.note}
              </p>
            </div>
          ))}
        </div>
      </Measure>
    </section>
  );
}

/**
 * The closing section, which is the reason for all of the above.
 *
 * Everything on this site is served by our database, and the point of the whole
 * design is that a reader never has to take that on faith. Saying which four
 * things they can check, and where, is the last instruction the page owes them.
 */
function Checking() {
  const checks = [
    ["Rules digest", "Hash the published constitution and compare it against what the contract stored."],
    ["The prize", "Read the vault balance straight off the ledger. It is a public account like any other."],
    ["The ranking", "Rederive it from the revealed scorecards. Our SDK does it from chain data alone."],
    ["Every payment", "Each payout is a transaction on the ledger, addressed to the wallet that received it."],
  ];

  return (
    <section className="hatch">
      <Measure wide className="py-16 sm:py-20">
        <SpecLabel index="02">Without an account</SpecLabel>

        <SpecHeading className="mt-3">What you can check yourself</SpecHeading>

        <div className="mt-10">
          <SpecRows>
            {checks.map(([label, how], index) => (
              <SpecRow
                key={label}
                index={String(index + 1).padStart(2, "0")}
                label={label ?? ""}
                mark
              >
                <p className="text-[0.9375rem] leading-relaxed">{how}</p>
              </SpecRow>
            ))}
          </SpecRows>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <ButtonLink href="/hackathons">
            Browse hackathons
            <Badge>→</Badge>
          </ButtonLink>

          <p className="text-[0.875rem] text-ink-soft">
            Every hackathon page has a button that does the first one for you,
            from your own browser.
          </p>
        </div>
      </Measure>
    </section>
  );
}
