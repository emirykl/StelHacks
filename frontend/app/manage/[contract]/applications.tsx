"use client";

import { useCallback, useEffect, useState } from "react";

import { SpecLabel, SpecRow, SpecRows, SpecValue } from "../../components/spec";
import { arg, send, type Sent } from "../../../lib/send";
import { applicantsOf, reasonHash, type Applicant } from "../../../lib/applications";

/**
 * The queue, and the two things that can be done with each row.
 *
 * A refusal needs a written reason. That is the contract's rule, not this
 * page's: `reject_application` will not take a call without a digest, because a
 * refusal that leaves no trace is exactly the quiet back door the rest of the
 * product is built to close. So the field is required here and the words are
 * hashed in the browser before anything is signed.
 */

export function Applications({
  contractId,
  reviewer,
}: {
  contractId: string;
  reviewer: string | null;
}) {
  const [applicants, setApplicants] = useState<Applicant[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<Sent | null>(null);

  const reread = useCallback(async () => {
    setApplicants(await applicantsOf(contractId));
  }, [contractId]);

  useEffect(() => {
    void reread();
  }, [reread]);

  async function decide(address: string, work: () => Promise<Sent>) {
    setBusy(address);
    setResult(null);

    const outcome = await work();

    setResult(outcome.ok || !outcome.refused ? outcome : null);
    setBusy(null);

    if (outcome.ok) {
      setRefusing(null);
      setReason("");
      await reread();
    }
  }

  if (applicants === null) {
    return (
      <section>
        <SpecLabel index="3">Applications</SpecLabel>
        <p className="mt-6 label text-ink-faint">Reading the log</p>
      </section>
    );
  }

  const waiting = applicants.filter((applicant) => applicant.status === "pending");

  return (
    <section>
      <SpecLabel index="3">Applications</SpecLabel>

      {applicants.length === 0 ? (
        <p className="mt-6 max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
          Nobody has applied yet.
        </p>
      ) : (
        <div className="mt-8">
          <SpecRows>
            {applicants.map((applicant, index) => (
              <SpecRow
                key={applicant.address}
                index={String(index + 1)}
                label={applicant.status}
                mark={applicant.status === "pending"}
              >
                <div className="space-y-3">
                  <SpecValue>{applicant.address}</SpecValue>

                  {applicant.status === "pending" && reviewer !== null && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          void decide(applicant.address, async () =>
                            send(
                              contractId,
                              "approve_application",
                              [await arg.address(reviewer), await arg.address(applicant.address)],
                              reviewer,
                            ),
                          )
                        }
                        className="label h-8 bg-ink px-3 text-paper transition-colors duration-150 ease-settle hover:bg-ink/85 disabled:opacity-40"
                      >
                        {busy === applicant.address ? "Signing" : "Approve"}
                      </button>

                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          setRefusing(refusing === applicant.address ? null : applicant.address)
                        }
                        className="label h-8 px-3 text-ink-soft transition-colors duration-150 ease-settle hover:text-broken disabled:opacity-40"
                      >
                        Refuse
                      </button>
                    </div>
                  )}

                  {refusing === applicant.address && reviewer !== null && (
                    <div className="max-w-[34rem] space-y-2">
                      <input
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Why, in writing"
                        className="h-10 w-full bg-paper px-3 text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
                      />

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={busy !== null || reason.trim().length === 0}
                          onClick={() =>
                            void decide(applicant.address, async () =>
                              send(
                                contractId,
                                "reject_application",
                                [
                                  await arg.address(reviewer),
                                  await arg.address(applicant.address),
                                  await arg.bytes32(await reasonHash(reason.trim())),
                                ],
                                reviewer,
                              ),
                            )
                          }
                          className="label h-8 bg-broken px-3 text-paper transition-colors duration-150 ease-settle hover:bg-broken/85 disabled:opacity-40"
                        >
                          Refuse
                        </button>

                        {/* Said plainly, because it is the part somebody would
                            otherwise learn afterwards: the words are hashed and
                            the hash is permanent. */}
                        <p className="text-[0.75rem] leading-relaxed text-ink-faint">
                          A hash of this goes on chain and stays there.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </SpecRow>
            ))}
          </SpecRows>

          {waiting.length > 0 && (
            <p className="mt-6 label text-ink-faint">
              {waiting.length} waiting
            </p>
          )}
        </div>
      )}

      {result !== null && (
        <p
          className={`mt-6 max-w-[46rem] text-[0.875rem] leading-relaxed ${
            result.ok ? "text-verified" : "text-broken"
          }`}
        >
          {result.ok ? `Recorded. ${result.hash}` : result.why}
        </p>
      )}
    </section>
  );
}
