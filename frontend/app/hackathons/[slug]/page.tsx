import { notFound } from "next/navigation";

import { Chain, Eyebrow, Measure, Rule } from "../../components/primitives";
import { ProofStrip, type Proof } from "../../components/proof-strip";
import { findHackathon, phaseName, type HackathonDetail } from "../../../lib/chain";

/**
 * One hackathon, as somebody with no account sees it.
 *
 * The proof strip comes first and everything else is below it. That order is
 * the argument the product makes: what the chain holds is the page, and the
 * name and the description are what somebody wrote around it.
 */

export const revalidate = 0;

export async function generateMetadata({ params }: PageProps<"/hackathons/[slug]">) {
  const { slug } = await params;
  const hackathon = await findHackathon(slug);

  return { title: hackathon?.name ?? "Hackathon" };
}

export default async function Hackathon({ params }: PageProps<"/hackathons/[slug]">) {
  const { slug } = await params;
  const hackathon = await findHackathon(slug);

  if (hackathon === null) {
    notFound();
  }

  return (
    <main className="flex-1">
      <ProofStrip proofs={proofsFor(hackathon)} />

      <section className="border-b border-rule">
        <Measure wide className="py-16">
          <Eyebrow>{phaseName(hackathon.phase)}</Eyebrow>

          <h1 className="mt-4 text-[clamp(2rem,4.5vw,3.25rem)]">{hackathon.name}</h1>

          {hackathon.tagline !== null && (
            <p className="mt-5 max-w-[38rem] text-[1.0625rem] leading-relaxed text-ink-soft">
              {hackathon.tagline}
            </p>
          )}
        </Measure>
      </section>

      {hackathon.description !== null && (
        <Measure wide className="py-14">
          {/* Held to a reading measure but aligned with the rest of the page.
              Centring it would make the one long passage on the page look like
              it belonged to a different layout. */}
          <p className="max-w-[42rem] whitespace-pre-line text-[1.0625rem] leading-relaxed text-ink-soft">
            {hackathon.description}
          </p>
        </Measure>
      )}

      <Measure wide className="pb-20">
        <Rule />

        <div className="mt-10">
          <Eyebrow>Where to check it yourself</Eyebrow>
        </div>

        <dl className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          <Row label="Hackathon contract" value={hackathon.contract_id} />
          <Row label="Prize vault" value={hackathon.vault_id} />
          <Row label="Organizer" value={hackathon.organizer} />
          <Row label="Prize asset" value={hackathon.prize_asset} />
        </dl>
      </Measure>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[0.8125rem] text-ink-faint">{label}</dt>

      <dd className="mt-1.5">
        {value === null ? (
          <span className="text-[0.8125rem] text-ink-faint">not published yet</span>
        ) : (
          <Chain>{value}</Chain>
        )}
      </dd>
    </div>
  );
}

/**
 * The four claims the strip carries.
 *
 * Every one of them reads `unchecked`, and that is not a placeholder. The page
 * is server rendered and nothing here has compared a digest against the
 * contract; saying so is the honest state. Checking happens in the browser
 * through the SDK, and until that lands the strip says what it knows rather
 * than what would look better.
 */
function proofsFor(hackathon: HackathonDetail): Proof[] {
  return [
    {
      label: "Rules digest",
      value: hackathon.constitution_hash ?? "not locked yet",
      standing: "unchecked",
    },
    {
      label: "Stage",
      value: phaseName(hackathon.phase),
      standing: "unchecked",
    },
    {
      label: "Hackathon contract",
      value: shorten(hackathon.contract_id),
      standing: "unchecked",
      href: `https://stellar.expert/explorer/testnet/contract/${hackathon.contract_id}`,
    },
    {
      label: "Prize vault",
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
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}
