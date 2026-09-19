import { notFound } from "next/navigation";

import { CheckableProofStrip } from "../../components/checkable";
import { Details } from "./details";
import { Entries } from "./entries";
import { Hackers } from "./hackers";
import { Join } from "./join";
import { Masthead } from "./masthead";
import { Measure } from "../../components/primitives";
import { ResultsBoard } from "./results";
import { Tabs } from "./tabs";
import { tabFrom } from "./tab";
import { VISIBILITY } from "../../../lib/rules";
import { countHackers } from "../../../lib/hackers";
import { findHackathon, type HackathonDetail } from "../../../lib/chain";
import { phaseName } from "../../../lib/phase";
import { type Proof } from "../../components/proof-strip";

/**
 * One hackathon, as somebody with no account sees it.
 *
 * The page is built in three bands and the order is the argument the product
 * makes. The proof strip is first: what the chain holds is the page, and
 * everything else is written around it. Then the masthead, which is the three
 * facts somebody actually decides on. Then the tabs, which are four different
 * questions about the same event rather than four different pages.
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
  const hackers = await countHackers(hackathon.contract_id);

  return (
    <main className="flex-1">
      <CheckableProofStrip
        contractId={hackathon.contract_id}
        claims={{
          digest: hackathon.constitution_hash,
          phase: hackathon.phase,
          vault: hackathon.vault_id,
        }}
        proofs={proofsFor(hackathon)}
      />

      <Masthead hackathon={hackathon} />

      <Tabs at={at} counts={{ hackers }} />

      {at === "details" && <Details hackathon={hackathon} />}

      {at === "builds" && <Builds hackathon={hackathon} />}

      {at === "hackers" && <Hackers contractId={hackathon.contract_id} />}

      {at === "take-part" && <TakePart hackathon={hackathon} />}
    </main>
  );
}

/**
 * What was entered, and who is allowed to be reading it.
 *
 * The notice above the list is not a disclaimer. Whether a build is readable
 * was decided before the lock and the database enforces the same three levels,
 * so an empty list under "the organizer only" is the rule working rather than a
 * hackathon nobody entered. Saying which of the two this is costs one line and
 * is the difference between a page that is quiet and a page that looks broken.
 */
function Builds({ hackathon }: { hackathon: HackathonDetail }) {
  const visibility = hackathon.rules?.visibility ?? null;

  return (
    <>
      <Measure wide className="pt-14">
        <div className="border border-rule bg-paper-sunk p-5">
          <p className="label text-ink-faint">Who can read these</p>

          <p className="mt-2 max-w-[46rem] text-[0.9375rem] leading-relaxed text-ink">
            {visibility === null
              ? "The contract could not be reached, so this page cannot say who may read the builds."
              : (explained[visibility] ?? explained[2])}
          </p>

          {visibility !== null && (
            <p className="label mt-3 text-ink-faint">
              frozen as {VISIBILITY[visibility] ?? "unknown"} before registration opened
            </p>
          )}
        </div>
      </Measure>

      <Entries contractId={hackathon.contract_id} />

      <ResultsBoard contractId={hackathon.contract_id} />
    </>
  );
}

/* The three levels the contract holds, said the way somebody entering would ask
   the question. Their order is the contract's, so the index is the answer. */
const explained = [
  "Anybody can read every build in this event, signed in or not. The organizer chose that before the rules were locked and cannot narrow it now.",
  "Only people the organizer approved into this event can read the builds. If you are not on that list you will see nothing here, which is the rule working rather than an empty hackathon.",
  "Nobody but the organizer reads a build before the result is published. What is below is what the chain records about a submission, which is a digest and a link rather than the work itself.",
];

/**
 * Entering, which needs a wallet and therefore cannot be a link.
 *
 * The three steps live in `Join` and are read from the contract rather than
 * from our database, so what is offered here is what the contract would
 * actually accept from this address right now.
 */
function TakePart({ hackathon }: { hackathon: HackathonDetail }) {
  return (
    <>
      <Join contractId={hackathon.contract_id} />

      {/* `Join` renders nothing outside the one phase in which any of it is
          allowed, so this says where things stand rather than leaving the tab
          blank. A tab that is empty and a tab that is closed look the same and
          are not. */}
      {hackathon.phase !== 2 && (
        <Measure wide className="py-14">
          <p className="max-w-[36rem] text-[0.9375rem] leading-relaxed text-ink-soft">
            {hackathon.phase === null
              ? "This event has not been published to the chain yet, so there is nothing to join."
              : `Registration is not open. This hackathon is at ${phaseName(hackathon.phase)}, and the contract accepts an application only while it is open.`}
          </p>
        </Measure>
      )}
    </>
  );
}

/**
 * The four promises the strip makes, in the words a person would use.
 *
 * Every one of them leaves here reading `unchecked`, and that is not a
 * placeholder. The page is server rendered and nothing on this side has
 * compared a digest against the contract; saying so is the honest state. The
 * reader changes it by pressing the button, which asks the contract from their
 * own browser.
 */
function proofsFor(hackathon: HackathonDetail): Proof[] {
  return [
    {
      key: "digest",
      claim: "The rules cannot change now",
      because: "Frozen before anybody registered. This is their fingerprint.",
      value: hackathon.constitution_hash ?? "not locked yet",
      standing: "unchecked",
    },
    {
      key: "phase",
      /* Not "the event is at Open", which would say the same word twice: once
         as the claim and again as the value under it. The claim is what the
         phase machine guarantees; the value is where that machine has got to. */
      claim: "No stage can be skipped",
      because: "Fixed order, enforced by the contract. It has got to:",
      value: phaseName(hackathon.phase),
      standing: "unchecked",
    },
    {
      key: "contract",
      claim: "A program runs this, not us",
      because: "It holds the rules and computes the ranking. Open it and read it.",
      value: shorten(hackathon.contract_id),
      standing: "unchecked",
      href: `https://stellar.expert/explorer/testnet/contract/${hackathon.contract_id}`,
    },
    {
      key: "vault",
      claim: "The prize money is already deposited",
      because: "Paid in up front. The vault has no withdraw function, for anyone.",
      value: hackathon.vault_id === null ? "not bound yet" : shorten(hackathon.vault_id),
      standing: "unchecked",
      ...(hackathon.vault_id === null
        ? {}
        : { href: `https://stellar.expert/explorer/testnet/contract/${hackathon.vault_id}` }),
    },
  ];
}

/** Enough of an address to recognise, with the middle left out. */
function shorten(address: string): string {
  return `${address.slice(0, 8)}\u2026${address.slice(-6)}`;
}
