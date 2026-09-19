/**
 * What the indexer stores, and what it builds out of it.
 *
 * The two halves are kept apart on purpose. `chain_events` and `chain_reads`
 * are the durable log: append only, never edited, and between them they carry
 * everything any page needs. Everything in `Projection` is a view of that log
 * and can be thrown away at any time, which is what makes the rebuild claim
 * something you can actually test rather than something you hope about.
 */

/**
 * One event, as it came off the chain and went into Postgres.
 *
 * `name` is the topic symbol the chain published, and `payload` holds the
 * topics and value in XDR exactly as they arrived. Neither has been
 * interpreted, because a log that stored an interpretation would be worth less
 * every time the interpretation changed.
 */
export interface StoredEvent {
  contract_id: string;
  ledger: number;
  event_index: number;
  name: string;
  payload: Record<string, unknown>;
  occurred_at: string;
}

/**
 * The same event with its fields opened, which is what a projection reads.
 *
 * `name` here is the contract's own name for the event rather than the topic it
 * was published under, and `fields` are the parameters it declared.
 */
export interface ProjectedEvent {
  contract_id: string;
  ledger: number;
  event_index: number;
  name: string;
  fields: Record<string, unknown>;
  occurred_at: string;
}

/**
 * One answer read from contract state while it was still live.
 *
 * Three things a page needs are in no event: the visibility and prize asset in
 * the constitution, a submission's URI, and the ranking itself. Soroban entries
 * expire, so these are read once at ingest and kept here rather than fetched
 * again later, when the contract may no longer be able to answer.
 */
export interface StoredRead {
  contract_id: string;
  ledger: number;
  kind: "constitution" | "submission" | "ranking";
  key: string;
  data: Record<string, unknown>;
}

export interface HackathonStateRow {
  contract_id: string;
  organizer: string;
  constitution_hash: string;
  phase: number;
  visibility: number;
  prize_asset: string | null;
  vault_id: string | null;
  observed_at_ledger: number;
}

export interface ParticipantRow {
  contract_id: string;
  address: string;
  approved_at_ledger: number;
}

export interface TeamMemberRow {
  contract_id: string;
  team_id: number;
  address: string;
  joined_at_ledger: number;
}

export interface SubmissionRow {
  contract_id: string;
  team_id: number;
  track: string;
  metadata_hash: string;
  uri: string;
  submitted_at: string;
  updated_at: string;
  status: number;
  reason_hash: string | null;
}

export interface ScoreRow {
  contract_id: string;
  team_id: number;
  judge: string;
  weighted: number;
  revealed_at_ledger: number;
}

export interface ResultRow {
  contract_id: string;
  track: string;
  rank: number;
  team_id: number;
  final_score: number;
  judge_average: number;
  community: number;
  decided_by: number;
}

export interface PaymentRow {
  contract_id: string;
  track: string;
  rank: number;
  recipient: string;
  amount: string;
  kind: number;
  ledger: number;
  tx_hash: string;
}

/** Every derived table, as one value. */
export interface Projection {
  hackathon_state: HackathonStateRow[];
  participants: ParticipantRow[];
  team_members: TeamMemberRow[];
  submissions: SubmissionRow[];
  scores: ScoreRow[];
  results: ResultRow[];
  payments: PaymentRow[];
}

/** The phases, numbered as the contract numbers them. */
export const Phase = {
  Draft: 0,
  Funding: 1,
  Open: 2,
  Screening: 3,
  Judging: 4,
  Reveal: 5,
  Finalization: 6,
  Settlement: 7,
  Completed: 8,
  Cancelled: 9,
} as const;

/** How a submission stands, numbered as the contract numbers it. */
export const SubmissionStatus = {
  Valid: 0,
  Invalidated: 1,
  Disqualified: 2,
} as const;

/**
 * Which of the three endings sent a payment.
 *
 * Kept apart because they mean very different things on a page: one says a
 * winner was paid, one says nobody came for it, one says the track awarded
 * nothing at all.
 */
export const PaymentKind = {
  Paid: 0,
  Swept: 1,
  Returned: 2,
} as const;
