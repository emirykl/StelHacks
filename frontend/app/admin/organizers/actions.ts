"use server";

import { revalidatePath } from "next/cache";

import { isTier, type Tier } from "../../../lib/organizing";
import { serverClient } from "../../../lib/supabase/server";

/**
 * Answering an application.
 *
 * Both halves of an approval happen inside one Postgres function, so this file
 * has one call in it rather than two writes and a comment apologising for the
 * gap between them. What is left here is the part a server action is for:
 * checking the arguments before they reach the database and turning whatever
 * comes back into a sentence.
 *
 * Staff is not checked here. It is checked in the policies and again at the top
 * of the function, and adding a third copy in the client's own process would be
 * the copy that eventually disagrees with the other two.
 */

export interface Answered {
  ok: boolean;
  message: string | null;
}

export async function answer(
  target: string,
  verdict: "approved" | "rejected",
  tier: string | null,
  note: string,
): Promise<Answered> {
  if (verdict === "approved" && (tier === null || !isTier(tier))) {
    return { ok: false, message: "Pick the tier this was granted on." };
  }

  /* A refusal with no words is the thing the rest of this product refuses to
     do, and it would be strange to allow it at the front door. */
  if (verdict === "rejected" && note.trim().length === 0) {
    return { ok: false, message: "Say why. They are shown this." };
  }

  const db = await serverClient();

  if (db === null) {
    return { ok: false, message: "Your session has expired. Sign in again." };
  }

  const { error } = await db.rpc("answer_application", {
    target,
    verdict,
    at_tier: verdict === "approved" ? (tier as Tier) : null,
    note: note.trim().length === 0 ? null : note.trim(),
  });

  if (error !== null) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/organizers");

  return { ok: true, message: null };
}
