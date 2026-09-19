import { notFound } from "next/navigation";

import { Eyebrow, Measure } from "../../components/primitives";
import {
  SpecButton,
  SpecHeading,
  SpecLabel,
  SpecRow,
  SpecRows,
  SpecValue,
} from "../../components/spec";
import { CheckableProofStrip } from "../../components/checkable";
import { Join } from "./join";
import { Entries } from "./entries";
import { ResultsBoard } from "./results";
import { type Proof } from "../../components/proof-strip";
import { findHackathon, type HackathonDetail } from "../../../lib/chain";
import { phaseName } from "../../../lib/phase";

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
      <CheckableProofStrip
        contractId={hackathon.contract_id}
        claims={{
          digest: hackathon.constitution_hash,
          phase: hackathon.phase,
          vault: hackathon.vault_id,
        }}
        proofs={proofsFor(hackathon)}
      />

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

      <Join contractId={hackathon.contract_id} />

      <Entries contractId={hackathon.contract_id} />

      <ResultsBoard contractId={hackathon.contract_id} />

      {/* Below here the chain is speaking, and the page changes voice to say
          so: condensed capitals, monospaced labels, square corners, hairline
          rows. A reader can tell which half of the page they are in without
          reading a word. */}
      <section className="hatch border-t border-rule">
        <Measure wide className="py-16">
          <SpecLabel index="01">On chain</SpecLabel>

          <SpecHeading className="mt-3">Where all of this lives</SpecHeading>

          <div className="mt-10">
            <SpecRows>
              <SpecRow index="01" label="Rules digest" mark>
                <SpecValue>{hackathon.constitution_hash ?? "not locked yet"}</SpecValue>
              </SpecRow>

              <SpecRow index="02" label="Hackathon contract" mark>
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
                  <span className="label text-ink-faint">not bound yet</span>
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
        </Measure>
      </section>
    </main>
  );
}

/**
 * The four claims the strip carries.
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
