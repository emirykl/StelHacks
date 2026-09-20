"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "../../components/primitives";
import { TIERS, type Application, type Tier } from "../../../lib/organizing";
import { answer } from "./actions";

/**
 * The queue somebody works through.
 *
 * Drawn in the editorial voice rather than the spec one, and the choice is not
 * cosmetic. The spec components are the chain speaking: digests, phases,
 * ledgers, things a stranger can check. An application is a person writing to
 * us and a person answering, none of it on chain and none of it checkable by
 * anybody else. Dressing it as a specification would be the interface claiming a
 * kind of authority this decision does not have.
 *
 * A refusal needs words and the approve button needs a tier, and both are
 * refused here before the request rather than after. The tier is what the
 * eventual fee will be read from, so approving without choosing one would leave
 * an organizer whose terms nobody ever agreed.
 */

export function Queue({ applications }: { applications: Application[] }) {
  const waiting = applications.filter((one) => one.status === "pending");

  return (
    <div>
      <p className="label text-ink-faint">
        {waiting.length === 0 ? "Nothing waiting" : `${waiting.length} waiting`}
      </p>

      <div className="mt-8 border-t border-rule">
        {applications.map((application) => (
          <Row key={application.id} application={application} />
        ))}
      </div>

      {applications.length === 0 && (
        <p className="mt-8 text-[1rem] leading-relaxed text-ink-soft">
          Nobody has applied yet.
        </p>
      )}
    </div>
  );
}

function Row({ application }: { application: Application }) {
  const router = useRouter();
  const [tier, setTier] = useState<Tier>("standard");
  const [refusing, setRefusing] = useState(false);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  function decide(verdict: "approved" | "rejected") {
    setProblem(null);

    start(async () => {
      const result = await answer(application.id, verdict, tier, note);

      if (result.ok) {
        setRefusing(false);
        setNote("");
        /* The list is rendered on the server, so the page is asked again rather
           than the row being edited in place. One source for what the queue
           currently is. */
        router.refresh();
      } else {
        setProblem(result.message);
      }
    });
  }

  const pending = application.status === "pending";

  return (
    <div className="border-b border-rule py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-[1.3125rem] text-ink">{application.organization}</h2>

        <span
          className={`label ${
            pending
              ? "text-ink"
              : application.status === "approved"
                ? "text-verified"
                : "text-ink-faint"
          }`}
        >
          {application.status}
        </span>
      </div>

      {/* The four facts a reviewer actually decides on, on one line, so two
          applications can be compared without opening either. */}
      <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-4">
        <Fact name="Event">{application.eventName}</Fact>
        <Fact name="When">{application.eventWindow}</Fact>
        <Fact name="Prize">{dollars(application.prizeEstimate)}</Fact>
        <Fact name="Hackers">{application.participantsEstimate.toLocaleString("en-US")}</Fact>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.9375rem] text-ink-soft">
        <a href={`mailto:${application.contactEmail}`} className="hover:text-ink">
          {application.contactEmail}
        </a>

        {application.link !== null && (
          <a
            href={application.link}
            target="_blank"
            rel="noreferrer"
            className="truncate hover:text-ink"
          >
            {application.link.replace(/^https?:\/\//, "")}
          </a>
        )}
      </div>

      {!pending && application.decisionNote !== null && (
        <p className="mt-4 max-w-[42rem] text-[0.9375rem] leading-relaxed text-ink-soft">
          {application.decisionNote}
        </p>
      )}

      {pending && (
        <div className="mt-6 grid gap-4">
          {/* The tier is picked before the approval rather than after, because
              afterwards there is nowhere to put it: the grant is written in the
              same transaction as the answer. */}
          <div className="flex flex-wrap gap-2">
            {TIERS.map((one) => (
              <button
                key={one.id}
                type="button"
                title={one.note}
                onClick={() => setTier(one.id)}
                aria-pressed={tier === one.id}
                className={`label h-8 rounded-full px-3.5 transition-colors duration-150 ease-settle ${
                  tier === one.id
                    ? "bg-ink text-paper"
                    : "bg-paper-sunk text-ink-soft ring-1 ring-inset ring-rule hover:text-ink"
                }`}
              >
                {one.name}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={working} onClick={() => decide("approved")}>
              {working ? "Saving" : "Approve"}
            </Button>

            <Button
              size="sm"
              intent="ghost"
              disabled={working}
              onClick={() => setRefusing(!refusing)}
            >
              Refuse
            </Button>
          </div>

          {refusing && (
            <div className="max-w-[34rem] space-y-3">
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Why, in writing"
                maxLength={500}
                className="h-11 w-full bg-paper px-3.5 text-[1rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
              />

              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  intent="danger"
                  disabled={working || note.trim().length === 0}
                  onClick={() => decide("rejected")}
                >
                  Refuse
                </Button>

                {/* Said plainly, because it is the part a reviewer would
                    otherwise learn from the applicant's reply. */}
                <p className="text-[0.8125rem] leading-relaxed text-ink-faint">
                  They are shown this.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {problem !== null && (
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-broken" role="status">
          {problem}
        </p>
      )}
    </div>
  );
}

function Fact({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label text-ink-faint">{name}</dt>
      <dd className="mt-1 text-[1rem] text-ink">{children}</dd>
    </div>
  );
}

/* Whole dollars. The estimate is somebody's guess and rendering it to the cent
   would give it a precision it does not have. */
function dollars(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
