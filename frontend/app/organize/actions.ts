"use server";

import { revalidatePath } from "next/cache";

import { columnsFrom, whatIsWrong, type Draft, type Standing } from "../../lib/organizing";
import { currentUser, serverClient } from "../../lib/supabase/server";
import { tellUs } from "../../lib/notify";
import { standingNow } from "../../lib/standing";

/**
 * Asking to run events here.
 *
 * A server action rather than a fetch, for the reason the profile save is one:
 * the client never names whose application this is. The session decides, the
 * policy in the schema checks it again, and a request that tried to apply on
 * somebody else's behalf fails at Postgres rather than here.
 */

export interface Sent {
  ok: boolean;
  message: string | null;
}

/**
 * Where the reader stands, asked for when the panel opens rather than rendered
 * into the page that holds the trigger.
 *
 * The trigger lives on the landing page and in the footer, and the footer is in
 * the layout, so reading the session to draw it would make every page in the
 * product dynamic. That is a real cost paid on every request for a panel almost
 * nobody opens. Asking once, when somebody actually opens it, keeps the pages
 * static and puts the work where the interest is.
 */
export async function myStanding(): Promise<Standing> {
  return standingNow();
}

export async function applyToOrganize(_before: Sent, form: FormData): Promise<Sent> {
  const draft: Draft = {
    organization: read(form, "organization"),
    contactEmail: read(form, "contactEmail"),
    link: read(form, "link"),
    eventName: read(form, "eventName"),
    eventWindow: read(form, "eventWindow"),
    prizeEstimate: read(form, "prizeEstimate"),
    participantsEstimate: read(form, "participantsEstimate"),
  };

  const wrong = whatIsWrong(draft);

  if (wrong !== null) {
    return { ok: false, message: wrong };
  }

  const db = await serverClient();
  const user = await currentUser();

  if (db === null || user === null) {
    return { ok: false, message: "Your session has expired. Sign in again." };
  }

  const { error } = await db
    .from("organizer_applications")
    .insert(columnsFrom(draft, user.id));

  if (error !== null) {
    /* The one failure worth naming, because it is the only one the person can
       do anything about: the partial unique index refusing a second open
       request from the same account. */
    return {
      ok: false,
      message: /duplicate key|unique/i.test(error.message)
        ? "You already have an application waiting. We will write back to it."
        : error.message,
    };
  }

  /* Awaited rather than left running. A server action's process can be torn
     down the moment it returns, so a floating promise here is a notification
     that arrives on a fast machine and not on a slow one. It cannot fail the
     application either way: `tellUs` swallows everything. */
  await tellUs({
    subject: `Organizer application: ${draft.organization}`,
    body: [
      `${draft.organization} <${draft.contactEmail}>`,
      draft.link.length === 0 ? null : draft.link,
      "",
      `Event: ${draft.eventName}`,
      `When: ${draft.eventWindow}`,
      `Prize: $${draft.prizeEstimate}`,
      `Hackers: ${draft.participantsEstimate}`,
      "",
      "Answer it at /admin/organizers.",
    ]
      .filter((line) => line !== null)
      .join("\n"),
  });

  /* The whole tree, because the create page and the account menu both change
     shape once there is an application to talk about. */
  revalidatePath("/", "layout");

  return { ok: true, message: null };
}

function read(form: FormData, field: string): string {
  const value = form.get(field);

  return typeof value === "string" ? value.trim() : "";
}
