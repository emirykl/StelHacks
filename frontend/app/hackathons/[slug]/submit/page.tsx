import { notFound } from "next/navigation";

import { SubmitForm } from "./form";
import { currentUser } from "../../../../lib/supabase/server";
import { findHackathon } from "../../../../lib/chain";

/**
 * Submitting a project, which is a page rather than a dialog.
 *
 * It was a modal with four boxes in it. What a team enters is read by judges
 * and by anybody browsing the event, so the form that produces it is shaped
 * like the thing it produces and gets the room to be.
 *
 * The categories come from the frozen rules on this request, so the list
 * somebody picks from is the contract's own and cannot drift from it.
 */

export const revalidate = 0;

export default async function Submit({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [hackathon, user] = await Promise.all([findHackathon(slug), currentUser()]);

  if (hackathon === null) {
    notFound();
  }

  return (
    <main className="flex-1">
      <SubmitForm
        contractId={hackathon.contract_id}
        slug={slug}
        tracks={hackathon.rules?.tracks ?? []}
        requires={
          hackathon.rules?.requires ?? { repository: true, demoVideo: false, liveUrl: false }
        }
        userId={user?.id ?? null}
      />
    </main>
  );
}
