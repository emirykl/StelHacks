import {
  PaymentKind,
  Phase,
  SubmissionStatus,
  type PaymentRow,
  type Projection,
  type ResultRow,
  type ScoreRow,
  type ProjectedEvent,
  type StoredRead,
  type SubmissionRow,
  type TeamMemberRow,
} from "./records.js";

/**
 * Every derived row, rebuilt from the log and from nothing else.
 *
 * This is a pure function on purpose, and it is the reason the rebuild claim is
 * testable at all. Given the same events and reads it returns the same rows,
 * every time, with no database and no network in the way. Dropping every
 * derived table and running this again is what a rebuild is.
 *
 * Order matters and is the caller's job: the events must arrive in the order
 * the chain published them. Two events in the same ledger are separated by
 * their index, which is what makes "the same ledger range twice" mean the same
 * thing twice.
 */
export function project(events: readonly ProjectedEvent[], reads: readonly StoredRead[]): Projection {
  const state = new Map<string, Projection["hackathon_state"][number]>();
  const participants = new Map<string, Projection["participants"][number]>();
  const members = new Map<string, TeamMemberRow>();
  const submissions = new Map<string, SubmissionRow>();
  const scores = new Map<string, ScoreRow>();
  const results = new Map<string, ResultRow>();
  const payments = new Map<string, PaymentRow>();

  const readIndex = index(reads);

  for (const event of ordered(events)) {
    const contract = event.contract_id;
    const at = event.ledger;
    const field = event.fields;

    switch (event.name) {
      // The lifecycle ---------------------------------------------------------
      //
      // Phase changes arrive by three different routes, because the contract
      // announces the work that closed a stage rather than the stage itself
      // wherever the work is the interesting part. Locking the rules moves a
      // hackathon into funding, publishing moves it into the open, and closing
      // the ranking moves it into finalization; only the transitions with
      // nothing else to say emit `PhaseAdvanced`.
      case "Created": {
        // Both contracts announce their own creation, and they mean different
        // things by it: a hackathon names its organizer, a vault names the
        // hackathon it serves. An event without an organizer is the vault's,
        // and there is no hackathon row to build from it. Coercing the missing
        // field into a string instead was caught by the database refusing an
        // address shaped `undefined`, which is a poor way to find out.
        const organizer = address(field["organizer"]);

        if (organizer === null) {
          break;
        }

        state.set(contract, {
          contract_id: contract,
          organizer,
          judges: [],
          constitution_hash: "\\x",
          phase: Phase.Draft,
          visibility: 2,
          prize_asset: null,
          vault_id: null,
          observed_at_ledger: at,
        });
        break;
      }

      case "RulesLocked": {
        const locked = readIndex.get(key(contract, "constitution", "")) ?? {};

        update(state, contract, at, {
          constitution_hash: bytes(field["constitution_hash"]),
          phase: Phase.Funding,
          // Until the constitution has been read the gallery stays closed,
          // which is the same direction the policy fails in.
          visibility: typeof locked["visibility"] === "number" ? locked["visibility"] : 2,
          prize_asset: locked["prize_asset"] === undefined ? null : text(locked["prize_asset"]),
          judges: addresses(locked["judges"]),
        });
        break;
      }

      case "VaultBound":
        update(state, contract, at, { vault_id: text(field["vault"]) });
        break;

      case "Published":
        update(state, contract, at, { phase: Phase.Open });
        break;

      case "PhaseAdvanced":
        update(state, contract, at, { phase: Number(field["phase"]) });
        break;

      case "ResultsFinalized":
        update(state, contract, at, { phase: Phase.Finalization });
        break;

      case "HackathonCancelled":
        update(state, contract, at, { phase: Phase.Cancelled });
        break;

      // Who is inside ---------------------------------------------------------

      case "ApplicationDecided":
        // A refusal is recorded on chain and belongs on the page, but it does
        // not put anybody on the guest list.
        if (field["approved"] === true) {
          const address = text(field["applicant"]);
          participants.set(key(contract, address), {
            contract_id: contract,
            address,
            approved_at_ledger: at,
          });
        }
        break;

      case "TeamFounded":
        addMember(members, contract, Number(field["team"]), text(field["captain"]), at);
        break;

      case "MemberJoined":
        addMember(members, contract, Number(field["team"]), text(field["member"]), at);
        break;

      // What they entered -----------------------------------------------------

      case "ProjectSubmitted": {
        const team = Number(field["team"]);
        const entry = readIndex.get(key(contract, "submission", String(team))) ?? {};
        const existing = submissions.get(key(contract, String(team)));

        submissions.set(key(contract, String(team)), {
          contract_id: contract,
          team_id: team,
          track: text(field["track"]),
          metadata_hash: bytes(field["metadata_hash"]),
          uri: entry["uri"] === undefined ? "" : text(entry["uri"]),
          // A revision keeps the moment the entry first arrived, because
          // submission order is the last step of the tie break and editing a
          // typo must not buy a better place in it.
          submitted_at: existing?.submitted_at ?? event.occurred_at,
          updated_at: event.occurred_at,
          status: existing?.status ?? SubmissionStatus.Valid,
          reason_hash: existing?.reason_hash ?? null,
        });
        break;
      }

      case "SubmissionInvalidated":
        ruleOut(submissions, contract, Number(field["team"]), SubmissionStatus.Invalidated, bytes(field["reason"]));
        break;

      case "DisqualificationResolved":
        // A case that fell short of the threshold leaves the entry exactly as
        // it was, which is why only an upheld one reaches the row.
        if (field["upheld"] === true) {
          ruleOut(submissions, contract, Number(field["team"]), SubmissionStatus.Disqualified, null);
        }
        break;

      // The result ------------------------------------------------------------

      case "ScoreRevealed": {
        const team = Number(field["team"]);
        const judge = text(field["judge"]);

        scores.set(key(contract, String(team), judge), {
          contract_id: contract,
          team_id: team,
          judge,
          weighted: Number(field["weighted"]),
          revealed_at_ledger: at,
        });
        break;
      }

      case "TrackRanked": {
        // The event says how many projects were placed, not which. The ranking
        // itself was read from the contract at this ledger and kept, because by
        // the time anybody rebuilds this the contract may no longer be able to
        // answer.
        const track = text(field["track"]);
        const placements = readIndex.get(key(contract, "ranking", track))?.["placements"];

        if (Array.isArray(placements)) {
          for (const placement of placements as Record<string, unknown>[]) {
            const rank = Number(placement["rank"]);

            results.set(key(contract, track, String(rank)), {
              contract_id: contract,
              track,
              rank,
              team_id: Number(placement["team"]),
              final_score: Number(placement["final_score"]),
              judge_average: Number(placement["judge_average"]),
              community: Number(placement["community"]),
              decided_by: Number(placement["decided_by"]),
            });
          }
        }
        break;
      }

      // Where the money went ---------------------------------------------------

      case "PrizePaid":
        pay(payments, contract, event, text(field["track"]), text(field["to"]), PaymentKind.Paid);
        break;

      case "ShareSwept":
        pay(payments, contract, event, text(field["track"]), text(field["member"]), PaymentKind.Swept);
        break;

      case "PrizeSwept":
        // A position nobody won has no member to name, so the organizer is the
        // recipient and the row says so rather than leaving it blank.
        pay(payments, contract, event, text(field["track"]), organizerOf(state, contract), PaymentKind.Swept);
        break;

      default:
        // Everything else is recorded in `chain_events` and shapes no derived
        // row. An event this build does not recognise is not dropped, because
        // the log keeps it whether or not anything projects it today.
        break;
    }
  }

  return {
    hackathon_state: sorted([...state.values()], (row) => [row.contract_id]),
    participants: sorted([...participants.values()], (row) => [row.contract_id, row.address]),
    team_members: sorted([...members.values()], (row) => [
      row.contract_id,
      pad(row.team_id),
      row.address,
    ]),
    submissions: sorted([...submissions.values()], (row) => [row.contract_id, pad(row.team_id)]),
    scores: sorted([...scores.values()], (row) => [row.contract_id, pad(row.team_id), row.judge]),
    results: sorted([...results.values()], (row) => [row.contract_id, row.track, pad(row.rank)]),
    payments: sorted([...payments.values()], (row) => [
      row.contract_id,
      row.track,
      pad(row.rank),
      row.recipient,
    ]),
  };
}

/**
 * The events in the order the chain published them.
 *
 * Sorting here rather than trusting the caller is what makes a replay of an
 * overlapping range produce the same answer as the original pass. Two events in
 * one ledger are separated by their index, which the chain assigns and nobody
 * else can.
 */
function ordered(events: readonly ProjectedEvent[]): ProjectedEvent[] {
  return [...events].sort(
    (left, right) =>
      left.contract_id.localeCompare(right.contract_id) ||
      left.ledger - right.ledger ||
      left.event_index - right.event_index,
  );
}

function index(reads: readonly StoredRead[]): Map<string, Record<string, unknown>> {
  const found = new Map<string, Record<string, unknown>>();

  // Later reads win, so a constitution read twice leaves the newer answer.
  for (const read of [...reads].sort((left, right) => left.ledger - right.ledger)) {
    found.set(key(read.contract_id, read.kind, read.key), read.data);
  }

  return found;
}

function update(
  state: Map<string, Projection["hackathon_state"][number]>,
  contract: string,
  at: number,
  changes: Partial<Projection["hackathon_state"][number]>,
): void {
  const current = state.get(contract);

  // An event for a hackathon that was never created is not something to invent
  // a row for. It means the log starts mid story, and the gap is the thing to
  // notice rather than paper over.
  if (current === undefined) {
    return;
  }

  state.set(contract, { ...current, ...changes, observed_at_ledger: at });
}

function addMember(
  members: Map<string, TeamMemberRow>,
  contract: string,
  team: number,
  address: string,
  at: number,
): void {
  const id = key(contract, String(team), address);

  // Whoever was recorded first stays recorded first. Replaying a range must not
  // move somebody's joining ledger.
  if (!members.has(id)) {
    members.set(id, { contract_id: contract, team_id: team, address, joined_at_ledger: at });
  }
}

function ruleOut(
  submissions: Map<string, SubmissionRow>,
  contract: string,
  team: number,
  status: number,
  reason: string | null,
): void {
  const id = key(contract, String(team));
  const entry = submissions.get(id);

  if (entry !== undefined) {
    submissions.set(id, { ...entry, status, reason_hash: reason ?? entry.reason_hash });
  }
}

function pay(
  payments: Map<string, PaymentRow>,
  contract: string,
  event: ProjectedEvent,
  track: string,
  recipient: string,
  kind: number,
): void {
  const rank = Number(event.fields["rank"]);

  payments.set(key(contract, track, String(rank), recipient), {
    contract_id: contract,
    track,
    rank,
    recipient,
    amount: String(event.fields["amount"]),
    kind,
    ledger: event.ledger,
    tx_hash: bytes(event.tx_hash),
  });
}

function organizerOf(
  state: Map<string, Projection["hackathon_state"][number]>,
  contract: string,
): string {
  return state.get(contract)?.organizer ?? "";
}

function key(...parts: string[]): string {
  return parts.join(" ");
}

/** Fixed width, so ten sorts after nine rather than after one. */
function pad(value: number): string {
  return String(value).padStart(12, "0");
}

function sorted<T>(rows: T[], by: (row: T) => string[]): T[] {
  return rows.sort((left, right) => key(...by(left)).localeCompare(key(...by(right))));
}

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

/**
 * Raw bytes, in the form Postgres accepts for a `bytea`.
 *
 * A digest arrives from the decoder as bytes, and running it through `String`
 * decodes it as UTF-8: every byte that is not valid UTF-8 becomes the
 * replacement character, and a thirty two byte hash comes out as a longer,
 * different, irreversible thing. It stored without complaint, which is how a
 * locked constitution ended up recorded under a digest that matched nothing.
 */
function bytes(value: unknown): string {
  if (value instanceof Uint8Array) {
    return `\\x${Buffer.from(value).toString("hex")}`;
  }

  // Already a hex literal, which is what the fixtures and a round trip through
  // Postgres both look like.
  return typeof value === "string" && value.startsWith("\\x") ? value : "\\x";
}

/**
 * A Stellar account address, or nothing.
 *
 * Anything that is not one comes back as nothing rather than as the word
 * `undefined` in a column the database checks, which is how this was found.
 */
function address(value: unknown): string | null {
  return typeof value === "string" && /^G[A-Z2-7]{55}$/.test(value) ? value : null;
}

/** Only well-formed account addresses from a constitution become an RLS role. */
function addresses(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(address)
    .filter((candidate): candidate is string => candidate !== null);
}
