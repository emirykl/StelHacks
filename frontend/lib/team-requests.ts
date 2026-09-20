"use client";

import { browserClient } from "./supabase/client";

/**
 * Requests to join a team, kept beside the chain rather than on it.
 *
 * The contract has no notion of asking. It has `add_member`, which either
 * happens or does not, and needs both signatures at once. Everything before
 * that moment — who asked, what they said, whether the captain has looked — is
 * ours to hold, and none of it decides anything: a row here cannot put somebody
 * on a team, and the chain will refuse a request whose signature does not check
 * out however this table is written.
 */

export interface Request {
  id: string;
  teamId: number;
  applicant: string;
  note: string | null;
  /** The joiner's signed half of `add_member`. */
  authEntry: string;
  expiresAtLedger: number;
  status: "pending" | "accepted" | "withdrawn";
  createdAt: string;
}

const COLUMNS = "id, team_id, applicant, note, auth_entry, expires_at_ledger, status, created_at";

function shape(row: Record<string, unknown>): Request {
  return {
    id: String(row["id"] ?? ""),
    teamId: Number(row["team_id"] ?? 0),
    applicant: String(row["applicant"] ?? ""),
    note: typeof row["note"] === "string" && row["note"].length > 0 ? row["note"] : null,
    authEntry: String(row["auth_entry"] ?? ""),
    expiresAtLedger: Number(row["expires_at_ledger"] ?? 0),
    status: (row["status"] as Request["status"]) ?? "pending",
    createdAt: String(row["created_at"] ?? ""),
  };
}

/** Every open request in this event that the reader is allowed to see. */
export async function requestsFor(contractId: string): Promise<Request[]> {
  const db = browserClient();

  if (db === null) {
    return [];
  }

  const { data } = await db
    .from("team_requests")
    .select(COLUMNS)
    .eq("contract_id", contractId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => shape(row as Record<string, unknown>));
}

/**
 * File a request, replacing any earlier one from the same person.
 *
 * Upserted rather than inserted because the table holds one live request per
 * person per team, and the usual reason somebody asks again is that their first
 * signature expired. Refusing the second ask would leave them stuck behind
 * their own stale one.
 */
export async function askToJoin(
  contractId: string,
  teamId: number,
  applicant: string,
  authEntry: string,
  expiresAtLedger: number,
  note: string,
): Promise<string | null> {
  const db = browserClient();

  if (db === null) {
    return "Accounts are not configured on this deployment.";
  }

  const { error } = await db.from("team_requests").upsert(
    {
      contract_id: contractId,
      team_id: teamId,
      applicant,
      auth_entry: authEntry,
      expires_at_ledger: expiresAtLedger,
      note: note.trim().length === 0 ? null : note.trim(),
      status: "pending",
    },
    { onConflict: "contract_id,team_id,applicant" },
  );

  if (error === null) {
    return null;
  }

  /* The one refusal worth translating. Everything else is a bug on our side and
     reads better as its own message than as a guess. */
  return error.code === "42501"
    ? "Link the wallet you are asking with to your account first."
    : error.message;
}

/** Mark a request answered, after the chain has already agreed. */
export async function markAccepted(id: string): Promise<void> {
  const db = browserClient();

  if (db === null) {
    return;
  }

  await db
    .from("team_requests")
    .update({ status: "accepted", decided_at: new Date().toISOString() })
    .eq("id", id);
}

/** Take a request back. */
export async function withdraw(id: string): Promise<void> {
  const db = browserClient();

  if (db === null) {
    return;
  }

  await db
    .from("team_requests")
    .update({ status: "withdrawn", decided_at: new Date().toISOString() })
    .eq("id", id);
}
