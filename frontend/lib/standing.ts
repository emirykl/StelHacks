import { ownApplication, type Standing } from "./organizing";
import { currentUser, serverClient } from "./supabase/server";

/**
 * Where the reader of this request stands with us, read once and handed down.
 *
 * Kept apart from `organizing.ts` because that file is imported by client
 * components and this one reaches for cookies. The split is the only thing
 * stopping a session read from being pulled into a browser bundle.
 *
 * It never throws and never refuses to answer. Every caller is drawing a door,
 * and a door that fails to render because the database was slow is worse than
 * one that offers the form to somebody who turns out to have already applied.
 */
export async function standingNow(): Promise<Standing> {
  const user = await currentUser();

  if (user === null) {
    return { signedIn: false, email: null, status: null, note: null };
  }

  const db = await serverClient();
  const application = db === null ? null : await ownApplication(db, user.id);

  return {
    signedIn: true,
    email: user.email ?? null,
    status: application?.status ?? null,
    note: application?.status === "rejected" ? application.decisionNote : null,
  };
}
