import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who may run a hackathon here, and how somebody asks to be one of them.
 *
 * Distinct from `organizer.ts`, which is about proving that an account holds
 * the address a particular hackathon already names as its organizer. That is a
 * question about an event. This is the question asked before any event exists,
 * and the two are kept apart because conflating them is what would let a person
 * who has been approved to run events edit somebody else's, or the reverse.
 *
 * The gate lives off chain and says so. Anybody can deploy a copy of the core
 * contract; what is decided here is only who appears on this site, which is a
 * thing we are entitled to decide and the ledger is not.
 */

/**
 * What was agreed with an organizer, recorded when the application is answered.
 *
 * The tier names a rate rather than holding one, and that rate reaches an event
 * exactly once: the create page reads it here and writes it into the
 * constitution, which is hashed and frozen along with everything else. Nothing
 * consults this file again afterwards, settlement included.
 *
 * That one-way trip is the point. A cut looked up from our tables at payout time
 * would be a number we could still move after people had entered and built, and
 * charging it would be the platform breaking exactly the promise the frozen
 * rules exist to make.
 */
export type Tier = "community" | "standard" | "annual";

export const TIERS: { id: Tier; name: string; note: string }[] = [
  {
    id: "community",
    name: "Community",
    note: "No cut. Student and community events, roughly under five thousand in prizes.",
  },
  {
    id: "standard",
    name: "Standard",
    note: "Five percent, paid on top of the prize table rather than out of it.",
  },
  {
    id: "annual",
    name: "Annual",
    note: "Flat yearly fee, no cut. For anybody running several events a year.",
  },
];

export function isTier(value: string): value is Tier {
  return TIERS.some((tier) => tier.id === value);
}

/**
 * What each tier costs, in basis points of the prize table.
 *
 * The rate is looked up here and written into the constitution at creation, and
 * from the lock onwards the contract reads it from the frozen document rather
 * than from this file. That is the whole arrangement: changing a number here
 * changes what the next event is quoted and cannot touch an event that already
 * locked, us included.
 *
 * Annual is zero because the money was already paid, once, off chain. The tier
 * on the grant is the record of that, and an annual organizer whose year lapses
 * is moved back to standard by changing their grant rather than by anything
 * reaching into an event in flight.
 */
export const FEE_BPS: Record<Tier, number> = {
  community: 0,
  standard: 500,
  annual: 0,
};

/** Which tier the reader was granted, or none if they were not granted one. */
export async function tierOf(db: SupabaseClient, userId: string): Promise<Tier | null> {
  const { data } = await db
    .from("organizer_grants")
    .select("tier")
    .eq("account", userId)
    .maybeSingle();

  const tier = data === null ? null : String((data as Record<string, unknown>)["tier"] ?? "");

  return tier !== null && isTier(tier) ? tier : null;
}

export type Status = "pending" | "approved" | "rejected";

/**
 * Where one reader stands, which is everything the door needs to know.
 *
 * Gathered once per render and handed to whichever surface is drawing the way
 * in. Four states and each changes what the panel says: no account yet, asked
 * and waiting, refused, or through. A panel that knew only whether somebody was
 * signed in would offer the form again to somebody already in the queue.
 */
export interface Standing {
  signedIn: boolean;
  /** Offered as the address to write back to. */
  email: string | null;
  /** Their most recent application, or none. */
  status: Status | null;
  /** Why it was refused, when it was. */
  note: string | null;
}

export interface Application {
  id: string;
  applicant: string;
  organization: string;
  contactEmail: string;
  link: string | null;
  eventName: string;
  eventWindow: string;
  /** US dollars, so two applications can be compared. */
  prizeEstimate: number;
  participantsEstimate: number;
  submittedAt: string;
  status: Status;
  decisionNote: string | null;
}

const COLUMNS =
  "id, applicant, organization, contact_email, link, event_name, event_window, prize_estimate, participants_estimate, submitted_at, status, decision_note";

function shape(row: Record<string, unknown>): Application {
  return {
    id: String(row["id"] ?? ""),
    applicant: String(row["applicant"] ?? ""),
    organization: String(row["organization"] ?? ""),
    contactEmail: String(row["contact_email"] ?? ""),
    link: text(row["link"]),
    eventName: String(row["event_name"] ?? ""),
    eventWindow: String(row["event_window"] ?? ""),
    prizeEstimate: Number(row["prize_estimate"] ?? 0),
    participantsEstimate: Number(row["participants_estimate"] ?? 0),
    submittedAt: String(row["submitted_at"] ?? ""),
    status: (row["status"] as Status) ?? "pending",
    decisionNote: text(row["decision_note"]),
  };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Whether the reader may create a hackathon.
 *
 * Asked through the function in the schema rather than by selecting from the
 * grants table, so the page that hides the button and the action that would
 * have handled the press cannot answer it differently.
 */
export async function mayOrganize(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.rpc("may_organize");

  return error === null && data === true;
}

/** Whether the reader reviews applications. */
export async function isStaff(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.rpc("is_staff");

  return error === null && data === true;
}

/**
 * The reader's own most recent application, so the page can say where it stands
 * instead of offering the form again to somebody already in the queue.
 */
export async function ownApplication(
  db: SupabaseClient,
  userId: string,
): Promise<Application | null> {
  const { data } = await db
    .from("organizer_applications")
    .select(COLUMNS)
    .eq("applicant", userId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data === null ? null : shape(data as Record<string, unknown>);
}

/**
 * The queue, oldest first.
 *
 * Oldest rather than newest, because this is a list somebody works through and
 * the one that has been waiting longest is the one that should be answered
 * next. A newest-first queue quietly starves its own bottom.
 */
export async function applicationQueue(db: SupabaseClient): Promise<Application[]> {
  const { data } = await db
    .from("organizer_applications")
    .select(COLUMNS)
    .order("status", { ascending: true })
    .order("submitted_at", { ascending: true });

  return (data ?? []).map((row) => shape(row as Record<string, unknown>));
}

/** What somebody types into the form. Every field a string, because a form is strings. */
export interface Draft {
  organization: string;
  contactEmail: string;
  link: string;
  eventName: string;
  eventWindow: string;
  prizeEstimate: string;
  participantsEstimate: string;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LINK = /^https?:\/\/.{3,200}$/;

/**
 * The first thing wrong with a draft, said the way the person would say it.
 *
 * The same rules are constraints in the schema. Those are what actually hold
 * the line; this exists so a mistyped email comes back as a sentence rather
 * than as the name of a Postgres constraint.
 */
export function whatIsWrong(draft: Draft): string | null {
  if (draft.organization.length === 0 || draft.organization.length > 120) {
    return "Tell us who is running it, in at most a hundred and twenty characters.";
  }

  if (!EMAIL.test(draft.contactEmail)) {
    return "That email address does not look like one we could write back to.";
  }

  if (draft.link.length > 0 && !LINK.test(draft.link)) {
    return "A link is the full https:// address.";
  }

  if (draft.eventName.length === 0 || draft.eventName.length > 120) {
    return "The event needs a name, even a working one.";
  }

  if (draft.eventWindow.length === 0 || draft.eventWindow.length > 80) {
    return "Say roughly when. A month is enough.";
  }

  const prize = Number(draft.prizeEstimate);

  if (!Number.isFinite(prize) || prize < 0 || prize > 100000000) {
    return "The prize estimate is a number of US dollars.";
  }

  const people = Number(draft.participantsEstimate);

  if (!Number.isInteger(people) || people <= 0 || people > 1000000) {
    return "The participant estimate is a whole number above zero.";
  }

  return null;
}

/** The columns as the schema spells them, from a draft that has already passed the check. */
export function columnsFrom(draft: Draft, applicant: string) {
  return {
    applicant,
    organization: draft.organization,
    contact_email: draft.contactEmail,
    link: draft.link.length === 0 ? null : draft.link,
    event_name: draft.eventName,
    event_window: draft.eventWindow,
    prize_estimate: Number(draft.prizeEstimate),
    participants_estimate: Number(draft.participantsEstimate),
  };
}
