import { describe, expect, it } from "vitest";

import { project } from "../src/project.js";
import { PaymentKind, Phase, SubmissionStatus, type ProjectedEvent, type StoredRead } from "../src/records.js";

/**
 * The rebuild, checked rather than promised.
 *
 * The rule the whole data layer rests on is that every derived table can be
 * dropped and rebuilt from the log. That is only worth saying if somebody
 * checks, and checking it is cheap here precisely because the projection is a
 * pure function: the same log in, the same rows out, no database and no network
 * anywhere in the way.
 */

const CONTRACT = "CCQ7LAZ7TH3DPWK3MCL2JFOM3JLMK6UKFTOMR2TERRXVLYBZ55LEHHNB";
const ORGANIZER = "GB45FLZ24LKDNR2OSMHGI45PA47PY4W4VSTK7BPTATZTPN7JVEG3Y4WP";
const CAPTAIN = "GA3A3NY4VLTTUPJCJSTJ457KAOXKPZ3PQER4M2F5TQRFG5TTNEOBQZ3K";
const MEMBER = "GD5UICFSMKGZAEP67EPBIXVENKEUXSUWT7RUT27YH4HHYVGRQURDMVXL";
const JUDGE = "GCZYAVTGEEWBFJNBFNPWOYNFPBA4C5O7YFYVZXUHWLKXZCV4LCAJH2QC";
const VAULT = "CCM6LIBBBDYVNPHKCSRORFR3LXLGWO5J4DFRLWDHYBBK7UDBCMMPGCF5";
const ASSET = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

let ledger = 100;

function at(name: string, payload: Record<string, unknown>): ProjectedEvent {
  ledger += 1;

  return {
    contract_id: CONTRACT,
    ledger,
    event_index: 0,
    name,
    fields: payload,
    tx_hash: "\\xfeed",
    occurred_at: new Date(Date.UTC(2026, 7, 25, 0, 0, ledger)).toISOString(),
  };
}

/** One hackathon from creation to a paid winner. */
function log(): { events: ProjectedEvent[]; reads: StoredRead[] } {
  ledger = 100;

  const events: ProjectedEvent[] = [
    at("Created", { organizer: ORGANIZER }),
    at("RulesLocked", { constitution_hash: "\\xabcd" }),
    at("VaultBound", { vault: VAULT }),
    at("Published", { funded: "10000", required: "10000" }),
    at("ApplicationDecided", { applicant: CAPTAIN, approved: true, reason: "\\x00" }),
    at("ApplicationDecided", { applicant: MEMBER, approved: true, reason: "\\x00" }),
    at("ApplicationDecided", { applicant: JUDGE, approved: false, reason: "\\x07" }),
    at("TeamFounded", { captain: CAPTAIN, team: 1 }),
    at("MemberJoined", { member: MEMBER, team: 1 }),
    at("ProjectSubmitted", { team: 1, track: "payments", metadata_hash: "\\x01", revised: false }),
    at("ProjectSubmitted", { team: 1, track: "payments", metadata_hash: "\\x02", revised: true }),
    at("PhaseAdvanced", { phase: Phase.Screening }),
    at("PhaseAdvanced", { phase: Phase.Judging }),
    at("PhaseAdvanced", { phase: Phase.Reveal }),
    at("ScoreRevealed", { judge: JUDGE, team: 1, weighted: 860000 }),
    at("TrackRanked", { track: "payments", ranked: 1 }),
    at("ResultsFinalized", { at: "1756080000" }),
    at("PhaseAdvanced", { phase: Phase.Settlement }),
    at("PrizePaid", { to: CAPTAIN, track: "payments", rank: 1, team: 1, amount: "2500" }),
    at("PrizePaid", { to: MEMBER, track: "payments", rank: 1, team: 1, amount: "2500" }),
  ];

  const reads: StoredRead[] = [
    {
      contract_id: CONTRACT,
      ledger: 102,
      kind: "constitution",
      key: "",
      data: { visibility: 0, prize_asset: ASSET, judges: [JUDGE] },
    },
    {
      contract_id: CONTRACT,
      ledger: 111,
      kind: "submission",
      key: "1",
      data: { uri: "ipfs://cid" },
    },
    {
      contract_id: CONTRACT,
      ledger: 116,
      kind: "ranking",
      key: "payments",
      data: {
        placements: [
          {
            rank: 1,
            team: 1,
            final_score: 688000,
            judge_average: 860000,
            community: 0,
            decided_by: 0,
          },
        ],
      },
    },
  ];

  return { events, reads };
}

describe("rebuilding from the log", () => {
  /**
   * The acceptance line for the whole indexer. Replaying the same range has to
   * change nothing, or a restart after a crash quietly produces a different
   * database from the one that was there before it.
   */
  it("produces byte identical rows every time", () => {
    const { events, reads } = log();

    const first = project(events, reads);
    const second = project(events, reads);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  /**
   * A restart resumes mid stream and re-reads a range it already saw. That
   * overlap must land exactly where a single clean pass did.
   */
  it("lands in the same place whether it was replayed in one pass or three", () => {
    const { events, reads } = log();
    const whole = project(events, reads);

    const overlapping = [...events.slice(0, 12), ...events.slice(8, 17), ...events.slice(14)];

    expect(JSON.stringify(project(overlapping, reads))).toBe(JSON.stringify(whole));
  });

  /**
   * Events arrive from the network and nothing guarantees the order they are
   * handed over in. The chain's own ordering is the one that decides, so the
   * projection sorts rather than trusting its caller.
   */
  it("does not depend on the order the events were handed to it", () => {
    const { events, reads } = log();
    const whole = project(events, reads);

    const shuffled = [...events].reverse();

    expect(JSON.stringify(project(shuffled, reads))).toBe(JSON.stringify(whole));
  });
});

describe("what the log says about one hackathon", () => {
  const { events, reads } = log();
  const rows = project(events, reads);

  it("follows the phase through all three ways it is announced", () => {
    // Settlement was reached by `PhaseAdvanced`, but funding came from
    // `RulesLocked`, the open phase from `Published` and finalization from
    // `ResultsFinalized`, none of which announce a phase directly.
    expect(rows.hackathon_state[0]!.phase).toBe(Phase.Settlement);
  });

  it("takes the visibility from the constitution, which no event carries", () => {
    expect(rows.hackathon_state[0]!.visibility).toBe(0);
    expect(rows.hackathon_state[0]!.prize_asset).toBe(ASSET);
    expect(rows.hackathon_state[0]!.judges).toEqual([JUDGE]);
    expect(rows.hackathon_state[0]!.vault_id).toBe(VAULT);
  });

  /**
   * A refusal is recorded on chain and belongs on the page, but it does not put
   * anybody on the guest list. Getting this wrong would open a closed gallery
   * to everybody who was ever turned away from it.
   */
  it("puts only approved applicants on the guest list", () => {
    expect(rows.participants.map((row) => row.address).sort()).toEqual([CAPTAIN, MEMBER].sort());
  });

  it("counts the captain as a member like anybody else", () => {
    expect(rows.team_members.map((row) => row.address).sort()).toEqual([CAPTAIN, MEMBER].sort());
  });

  /**
   * Editing an entry must not buy a better place in the tie break, so a
   * revision moves the digest and leaves the moment it first arrived alone.
   */
  it("keeps the first arrival time through a revision", () => {
    const entry = rows.submissions[0]!;

    expect(entry.metadata_hash).toBe("\\x02");
    expect(entry.submitted_at).not.toBe(entry.updated_at);
    expect(entry.submitted_at < entry.updated_at).toBe(true);
  });

  it("takes the submission URI from the read, which no event carries", () => {
    expect(rows.submissions[0]!.uri).toBe("ipfs://cid");
  });

  it("takes the ranking from the read, because the event only counts it", () => {
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.final_score).toBe(688000);
  });

  /**
   * Every member is paid their own share, so a position has as many payment
   * rows as the team had people.
   */
  it("records one payment per member rather than one per position", () => {
    expect(rows.payments).toHaveLength(2);
    expect(rows.payments.every((row) => row.kind === PaymentKind.Paid)).toBe(true);
    expect(rows.payments.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(5000);
  });
});

describe("entries that left the running", () => {
  it("marks a screened out entry without losing what it pointed at", () => {
    const { events, reads } = log();
    const ruled = [...events, at("SubmissionInvalidated", { team: 1, reason: "\\x09" })];
    const rows = project(ruled, reads);

    expect(rows.submissions[0]!.status).toBe(SubmissionStatus.Invalidated);
    expect(rows.submissions[0]!.metadata_hash).toBe("\\x02");
    expect(rows.submissions[0]!.reason_hash).toBe("\\x09");
  });

  /**
   * A case the judges did not sign leaves the entry exactly as it was. Marking
   * it would turn an accusation into a penalty on its own.
   */
  it("leaves an entry alone when its case fell short", () => {
    const { events, reads } = log();
    const dismissed = [...events, at("DisqualificationResolved", { team: 1, upheld: false, approvals: 1 })];

    expect(project(dismissed, reads).submissions[0]!.status).toBe(SubmissionStatus.Valid);
  });

  it("marks one the judges did sign", () => {
    const { events, reads } = log();
    const upheld = [...events, at("DisqualificationResolved", { team: 1, upheld: true, approvals: 2 })];

    expect(project(upheld, reads).submissions[0]!.status).toBe(SubmissionStatus.Disqualified);
  });
});

describe("a log that is missing its beginning", () => {
  /**
   * An event for a hackathon that was never created means the range started
   * mid story. Inventing a row would produce a hackathon with no organizer and
   * a gallery whose setting nobody chose, and it would look like real data.
   */
  it("builds nothing rather than inventing a hackathon", () => {
    const rows = project([at("PhaseAdvanced", { phase: Phase.Settlement })], []);

    expect(rows.hackathon_state).toHaveLength(0);
  });
});

describe("an event this build does not know", () => {
  /**
   * It shapes no derived row and it is not an error. The log keeps it either
   * way, which is what lets a later build project something this one ignored.
   */
  it("is passed over without disturbing anything else", () => {
    const { events, reads } = log();
    const withStranger = [...events, at("SomethingNobodyWroteYet", { whatever: 1 })];

    expect(JSON.stringify(project(withStranger, reads))).toBe(JSON.stringify(project(events, reads)));
  });
});
