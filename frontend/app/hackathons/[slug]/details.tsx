import { Measure } from "../../components/primitives";
import {
  SpecButton,
  SpecHeading,
  SpecLabel,
  SpecRow,
  SpecRows,
  SpecValue,
} from "../../components/spec";
import { WEIGHT_TOTAL_BPS } from "../../../lib/constitution";
import { prizeLabel, worthOf } from "../../../lib/money";
import type { HackathonDetail } from "../../../lib/chain";
import type { Rules } from "../../../lib/rules";

/**
 * Everything about a hackathon that is not a person and not a build.
 *
 * The order is deliberate and it is the product's argument in miniature. What
 * somebody wrote comes first, because that is what a reader came for. Then the
 * rules that decide the outcome, which nobody can change now. Then the
 * addresses, so a reader can leave this page and check every line of it against
 * the chain.
 *
 * Nothing here is editable and nothing here is ours. The prize table, the
 * weights and the quorum are read from the contract on this request; the page
 * is a rendering of the frozen document rather than a description of it.
 */

export async function Details({ hackathon }: { hackathon: HackathonDetail }) {
  return (
    <>
      {hackathon.description !== null && (
        <Measure wide className="py-14">
          {/* Held to a reading measure but aligned with the rest of the page.
              Centring it would make the one long passage here look like it
              belonged to a different layout. */}
          <p className="max-w-[42rem] whitespace-pre-line text-[1.0625rem] leading-relaxed text-ink-soft">
            {hackathon.description}
          </p>
        </Measure>
      )}

      {hackathon.rules !== null && (
        <Frozen rules={hackathon.rules} asset={hackathon.asset} />
      )}

      {/* Below here the chain is speaking, and the page changes voice to say
          so: condensed capitals, monospaced labels, square corners, hairline
          rows. A reader can tell which half of the page they are in without
          reading a word. */}
      <section className="hatch border-t border-rule">
        <Measure wide className="py-16">
          <SpecLabel index="02">On chain</SpecLabel>

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
    </>
  );
}

/**
 * The rules themselves, as a reader can check them.
 *
 * Every figure on this surface is one the contract will enforce, so it is set
 * in the chain's voice rather than ours. Weights are shown as percentages
 * because that is how a person reads a rubric, and the basis points they came
 * from are what the contract actually holds.
 */
async function Frozen({ rules, asset }: { rules: Rules; asset: string | null }) {
  return (
    <section className="border-t border-rule">
      <Measure wide className="py-16">
        <SpecLabel index="01">Frozen before anybody registered</SpecLabel>

        <SpecHeading className="mt-3">The rules that decide this</SpecHeading>

        <div className="mt-10 grid gap-12 lg:grid-cols-2">
          <div>
            <p className="label text-ink-faint">Prize table</p>

            <div className="mt-4">
              <SpecRows>
                {rules.tiers.length === 0 ? (
                  <SpecRow index="00" label="No positions">
                    <span className="label text-ink-faint">nothing payable</span>
                  </SpecRow>
                ) : (
                  rules.tiers.map((tier) => (
                    <SpecRow
                      key={`${tier.track}-${tier.rank}`}
                      index={String(tier.rank).padStart(2, "0")}
                      label={tier.track}
                      mark
                    >
                      <Amount amount={tier.amount} asset={asset} />
                    </SpecRow>
                  ))
                )}
              </SpecRows>
            </div>
          </div>

          <div>
            <p className="label text-ink-faint">How it is judged</p>

            <div className="mt-4">
              <SpecRows>
                {rules.tracks.map((track, at) => (
                  <SpecRow
                    key={track.id}
                    index={String(at + 1).padStart(2, "0")}
                    label={track.id}
                  >
                    <div className="flex flex-wrap gap-x-5 gap-y-1">
                      {track.criteria.map((criterion) => (
                        <span key={criterion.id} className="label text-ink">
                          {criterion.id}{" "}
                          <span className="text-ink-faint">
                            {percent(criterion.weightBps)}
                          </span>
                        </span>
                      ))}
                    </div>
                  </SpecRow>
                ))}

                <SpecRow index="—" label="Score split">
                  <span className="label text-ink">
                    judges {percent(rules.judgeBps)}
                    {rules.communityBps > 0 && (
                      <> · crowd {percent(rules.communityBps)}</>
                    )}
                  </span>
                </SpecRow>

                <SpecRow index="—" label="Judges">
                  <span className="label text-ink">
                    {rules.judges} authorized · {rules.judgeQuorum} needed per project
                  </span>
                </SpecRow>

                <SpecRow index="—" label="Teams">
                  <span className="label text-ink">
                    up to {rules.maxTeamSize} people ·{" "}
                    {rules.multiTeamAllowed ? "several teams allowed" : "one team each"}
                  </span>
                </SpecRow>

                <SpecRow index="—" label="A build must have">
                  <span className="label text-ink">{needed(rules)}</span>
                </SpecRow>
              </SpecRows>
            </div>
          </div>
        </div>
      </Measure>
    </section>
  );
}

/** One tier, in the asset it will actually be paid in. */
async function Amount({ amount, asset }: { amount: bigint; asset: string | null }) {
  const worth = await worthOf(asset, amount);
  const shown = prizeLabel(worth, amount);

  return (
    <span className="tabular text-[0.9375rem] font-bold text-verified">
      {shown.figure} <span className="label font-bold text-ink-soft">{shown.code}</span>
    </span>
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

  return parts.length === 0 ? "a link, and nothing else is compulsory" : parts.join(" · ");
}
