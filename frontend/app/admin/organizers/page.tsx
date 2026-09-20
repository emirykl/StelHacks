import { notFound } from "next/navigation";

import { Eyebrow, Measure } from "../../components/primitives";
import { Queue } from "./queue";
import { applicationQueue, isStaff } from "../../../lib/organizing";
import { serverClient } from "../../../lib/supabase/server";

/**
 * Where applications are answered.
 *
 * `notFound` rather than a refusal, and the difference matters. A page that
 * says "you are not allowed here" has confirmed that here is somewhere, which
 * is the one fact this address should not hand out. Somebody who is not staff
 * should be unable to tell the page from a typo.
 *
 * The gate is drawn from the same function the policies use, so a reader who
 * got past this and started pressing buttons would be refused by Postgres
 * anyway. This decides what to render; it is not what decides what may be
 * written.
 */

export const dynamic = "force-dynamic";

export default async function Organizers() {
  const db = await serverClient();

  if (db === null || !(await isStaff(db))) {
    notFound();
  }

  const applications = await applicationQueue(db);

  return (
    <main className="flex-1">
      <section className="border-b border-rule">
        <Measure wide className="py-16 sm:py-20">
          <Eyebrow>Staff</Eyebrow>

          <h1 className="mt-4 text-[clamp(2rem,4.5vw,3rem)]">Organizer applications</h1>
        </Measure>
      </section>

      <Measure wide className="py-16">
        <Queue applications={applications} />
      </Measure>
    </main>
  );
}
