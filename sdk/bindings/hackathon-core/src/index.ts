import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





/**
 * The people running a hackathon from the organizing side.
 * 
 * The organizer is fixed when the hackathon is created and is the only address
 * that can fund the vault, lock the rules, screen submissions or open a
 * disqualification. Collaborators are the organizer's helpers, and their reach
 * stops at one job: deciding who gets into the event.
 * 
 * That split is deliberate. The collaborator list can grow in the middle of a
 * running hackathon, when a hundred applications are waiting and one person
 * cannot read them all. Anything touching the prize or the ranking would be
 * unsafe to hang off a list that grows under time pressure, so it does not.
 */
export interface OrganizingTeam {
  /**
 * Helpers who may review registration applications. Changes to this list
 * are recorded, so the proof page can show who was allowed to admit whom.
 */
collaborators: Array<string>;
  /**
 * The address that created the hackathon and holds every organizer power.
 */
organizer: string;
}


/**
 * A team's entry, as the contract records it.
 * 
 * The write up itself lives off chain under `uri`, and what sits here is its
 * digest. That is the whole trick of the submission lock: at the deadline this
 * digest stops being writable, so the project a judge scores is provably the
 * project that was entered, without the chain ever paying to store a video
 * link or a paragraph of prose.
 */
export interface Submission {
  /**
 * Digest of the metadata, computed over the fields of
 * [`SubmissionMetadata`].
 */
metadata_hash: Buffer;
  /**
 * Digest of the written reason when a submission is ruled out; all zeroes
 * otherwise.
 */
reason: Buffer;
  status: SubmissionStatus;
  /**
 * When the entry first arrived.
 * 
 * Later edits do not move this. Submission order is the last step of the
 * tie break chain, so a team that edits a typo an hour before the deadline
 * would otherwise lose the place their early entry earned them.
 */
submitted_at: u64;
  /**
 * The team this entry belongs to.
 */
team: u32;
  /**
 * The track it competes in.
 */
track: string;
  /**
 * When it was last edited.
 */
updated_at: u64;
  /**
 * Where that metadata can be fetched.
 */
uri: string;
}

/**
 * Whether a submission still counts.
 */
export enum SubmissionStatus {
  Valid = 0,
  Invalidated = 1,
  Disqualified = 2,
}


/**
 * Everything a team writes about their project.
 * 
 * None of this is stored on chain. It lives off chain and the contract keeps
 * only a hash of it, which is what freezes the submission at the deadline
 * without paying to store a description or a video link in ledger state.
 * 
 * The struct exists here anyway, and this is the important part: it fixes the
 * exact field set and field order that the hash covers. A client that
 * serializes these fields in this order arrives at the same digest the
 * contract would, which is what lets anyone check that the project being
 * judged is the project that was submitted.
 * 
 * Checking these fields against [`SubmissionRequirements`] is the SDK's job,
 * not this contract's. The metadata never reaches the chain, only its digest
 * does, so a contract side check would be validating something it cannot see.
 * The SDK runs it before computing the hash, where it can also say which field
 * is missing rather than only that one is.
 */
export interface SubmissionMetadata {
  /**
 * Demo video, normally a YouTube or Loom URL.
 */
demo_video_url: string;
  /**
 * The full write up.
 */
description: string;
  /**
 * A deployed instance a judge can open and click through.
 */
live_url: string;
  /**
 * Where the logo image is stored.
 */
logo_uri: string;
  /**
 * The project name shown in the gallery.
 */
name: string;
  /**
 * Source repository, normally a GitHub URL.
 */
repository_url: string;
  /**
 * One line describing what it does.
 */
summary: string;
  /**
 * The track this project competes in.
 */
track: string;
}


/**
 * A case for removing an entry after the screening round has closed.
 * 
 * This is the heaviest power in the product, so every condition the PRD
 * attaches to it is a field here rather than a promise made elsewhere: the
 * reason is recorded before anything happens, the team gets a window to answer
 * on the record, judges other than the organizer have to sign, and only after
 * the window closes does anyone find out whether it carried. A case that
 * gathers no signatures ends with the project still in the running, because a
 * team that entered is in unless somebody clears the bar to remove them.
 */
export interface DisqualificationCase {
  /**
 * Digest of the team's written answer; all zeroes until they file one.
 */
appeal: Buffer;
  /**
 * When they filed it, zero until then.
 */
appealed_at: u64;
  /**
 * How many judges have signed.
 */
approvals: u32;
  /**
 * When it was opened, which is where the appeal window counts from.
 */
opened_at: u64;
  /**
 * Digest of the written reason.
 */
reason: Buffer;
  /**
 * Whether it has been settled one way or the other.
 */
resolved: boolean;
  /**
 * The entry the case is against.
 */
team: u32;
}


/**
 * Which links a team has to supply before their project counts as submitted.
 * 
 * The organizer chooses this before the lock, so nobody discovers on the last
 * evening that a demo video was expected. A repository is required by default
 * in practice, since a hackathon judging code without code to read is judging
 * a pitch, but the choice stays with the organizer because internal and design
 * focused events exist too.
 */
export interface SubmissionRequirements {
  /**
 * The team must supply a demo video link.
 */
demo_video_required: boolean;
  /**
 * The team must supply a link to something running.
 */
live_url_required: boolean;
  /**
 * The team must supply a source repository link.
 */
repository_required: boolean;
}

/**
 * Where money goes when it is not awarded to a winner.
 * 
 * Which routes are legal depends on why the money is unspent, so each use
 * checks its own set rather than accepting the whole enum.
 */
export enum RefundRoute {
  Organizer = 0,
  Depositors = 1,
  RemainingTracks = 2,
}

/**
 * When the vault is allowed to pay.
 */
export type SettlementMode = {tag: "Immediate", values: void} | {tag: "SafetyWindow", values: readonly [u64]};


/**
 * Every power the organizer holds after the rules are locked.
 * 
 * None of these are removed, because an organizer who cannot disqualify a
 * plagiarised entry or extend a deadline after an outage will not run their
 * event here. What the constitution does instead is publish each power before
 * anyone writes a line of code, bound it, and make every use of it leave a
 * record. Flexibility is kept; secrecy is not.
 */
export interface DiscretionPolicy {
  /**
 * Seconds a team has to answer a disqualification before it can be
 * resolved.
 */
appeal_window: u64;
  /**
 * Where the prize pool goes when the hackathon is cancelled.
 */
cancellation_refund: RefundRoute;
  /**
 * Judges who must sign before a cancellation takes effect once submission
 * has opened. Before that point the organizer can cancel alone, because
 * nobody has spent anything yet.
 */
cancellation_threshold: u32;
  /**
 * Judges who must sign before a disqualification takes effect.
 */
disqualification_threshold: u32;
  /**
 * Where a track's prize goes when the track declares no award.
 */
no_award_refund: RefundRoute;
  /**
 * Seconds a winner has to claim a prize before the refund route applies.
 */
prize_claim_period: u64;
  /**
 * When the vault may pay.
 */
settlement: SettlementMode;
  /**
 * Where an unclaimed prize goes once the claim period runs out.
 */
unclaimed_refund: RefundRoute;
}

/**
 * Who may read the submitted projects while the hackathon is running.
 * 
 * This governs the project metadata only, and it is enforced off chain, where
 * that metadata lives. What sits on chain is a hash, a timestamp and a track,
 * and those stay readable by anyone in every setting. A private hackathon
 * therefore still produces a receipt a stranger can check: they can see that
 * project seven scored 84.2 and what every judge gave it on every criterion,
 * they simply cannot read what project seven was.
 * 
 * Calling this a privacy guarantee would be dishonest, so it is not. It is an
 * access rule on the platform's own API, and the proof of the result never
 * depends on it.
 */
export enum ProjectVisibility {
  Public = 0,
  Participants = 1,
  Restricted = 2,
}


/**
 * How teams may be formed.
 */
export interface TeamPolicy {
  /**
 * The most people one team may hold, counting the captain.
 */
max_size: u32;
  /**
 * Whether one person may belong to more than one team.
 * 
 * Off in most events, because a builder splitting themselves across four
 * entries is competing against their own teammates. An organizer running a
 * small event where the same handful of people carry several ideas can
 * turn it on, and the self vote check accounts for every team a voter
 * belongs to either way.
 */
multi_team_allowed: boolean;
}


/**
 * How the final score is split between the judges and the crowd.
 */
export interface VotePolicy {
  /**
 * The community's share of the final score, in basis points.
 */
community_bps: u32;
  /**
 * The judges' share of the final score, in basis points.
 */
judge_bps: u32;
}

/**
 * How judges seal their scorecards until the reveal.
 * 
 * The easy mode carries the address that will seal them, because that address
 * is the one piece of trust this design does not remove and hiding it would be
 * dishonest. A participant reading the rules sees exactly who collects the
 * scorecards and publishes their root, and knows that if that party leaves one
 * out, the judge it belonged to can prove it.
 */
export type JudgingMode = {tag: "Easy", values: readonly [string]} | {tag: "Strict", values: void};

/**
 * One step in the chain that separates two projects on the same score.
 */
export type TieBreakRule = {tag: "JudgeScore", values: void} | {tag: "Criterion", values: readonly [string]} | {tag: "CommunityScore", values: void} | {tag: "SubmissionOrder", values: void};


/**
 * A competition track with its own rubric and prize line.
 */
export interface Track {
  /**
 * The rubric, whose weights add up to [`WEIGHT_TOTAL_BPS`].
 */
criteria: Array<Criterion>;
  /**
 * Stable identifier, for example `payments`.
 */
id: string;
  /**
 * Whether the organizer declared, before the lock, that this track may end
 * without awarding its prize. A track without this flag can never be left
 * unpaid later.
 */
no_award_allowed: boolean;
}


/**
 * One line of the rubric a judge fills in.
 */
export interface Criterion {
  /**
 * Stable identifier, for example `technical` or `stellar_use`.
 */
id: string;
  /**
 * Share of the track score, in basis points.
 */
weight_bps: u32;
}


/**
 * One payable position, for example second place in the payments track.
 */
export interface PrizeTier {
  /**
 * Amount in the smallest unit of the prize asset.
 */
amount: i128;
  /**
 * One based rank within the track.
 */
rank: u32;
  /**
 * The track this position belongs to.
 */
track: string;
}


/**
 * Everything that decides the outcome of a hackathon.
 * 
 * This is signed and hashed before registration opens, and from that moment
 * none of it can change. Anyone can rebuild the same structure from the public
 * page, hash it themselves, and compare against the hash stored on chain; if
 * the two differ, the competition is not the one that was announced.
 * 
 * Everything that does not decide an outcome, meaning the name, the logo, the
 * long description and the judge biographies, is deliberately absent. Those
 * live off chain under [`Constitution::metadata_hash`], so editing a typo in a
 * description never has to look like tampering with the rules.
 */
export interface Constitution {
  /**
 * Every power the organizer keeps after the lock.
 */
discretion: DiscretionPolicy;
  /**
 * How far those deadlines may later move.
 */
extensions: ExtensionPolicy;
  /**
 * Valid scorecards a project needs before the result can be finalized.
 */
judge_quorum: u32;
  /**
 * Authorized judges and their track assignments.
 */
judges: Array<JudgeAssignment>;
  /**
 * How scorecards are sealed until the reveal.
 */
judging_mode: JudgingMode;
  /**
 * Hash of the deterministically serialized off chain metadata.
 */
metadata_hash: Buffer;
  /**
 * The token the prize is denominated and paid in.
 */
prize_asset: string;
  /**
 * Payable positions per track.
 */
prize_tiers: Array<PrizeTier>;
  /**
 * The announced deadlines.
 */
schedule: Schedule;
  /**
 * Which links a team has to supply with their project.
 */
submission_requirements: SubmissionRequirements;
  /**
 * How teams may be formed.
 */
teams: TeamPolicy;
  /**
 * The chain that separates two projects on the same score.
 */
tie_break: Array<TieBreakRule>;
  /**
 * Competition tracks, each with its own rubric.
 */
tracks: Array<Track>;
  /**
 * Format version, see [`CONSTITUTION_VERSION`].
 */
version: u32;
  /**
 * Who may read the submitted projects while the event runs.
 */
visibility: ProjectVisibility;
  /**
 * How the final score is split between judges and the crowd.
 */
vote: VotePolicy;
}


/**
 * A judge and the tracks they are responsible for.
 */
export interface JudgeAssignment {
  judge: string;
  /**
 * Identifiers of the tracks this judge scores. A judge with no track has
 * no reason to be authorized, so an empty list is rejected.
 */
tracks: Array<string>;
}

/**
 * The deadlines an organizer is allowed to move.
 * 
 * The opening timestamps are deliberately absent. Moving an opening moment
 * after the fact changes who could take part rather than how long they had.
 */
export enum Deadline {
  Registration = 0,
  Submission = 1,
  Screening = 2,
  Judging = 3,
  CommunityVote = 4,
}


/**
 * The deadlines of a hackathon, as UTC ledger timestamps in seconds.
 * 
 * The constitution locks the schedule that was announced. Deadlines can still
 * move, but only forward, only before they pass, and only within the limits of
 * the [`ExtensionPolicy`] that was declared alongside them, so the effective
 * schedule is always the announced one plus a public list of recorded
 * extensions.
 */
export interface Schedule {
  /**
 * The community vote closes. Ignored when the community has no share.
 */
community_vote_closes_at: u64;
  /**
 * The community vote opens, typically right after the presentations while
 * the judges are scoring. Ignored when the community has no share.
 */
community_vote_opens_at: u64;
  /**
 * Scorecards and ballots are due, and the reveal becomes possible.
 */
judging_closes_at: u64;
  /**
 * Sign up closes. This is also the snapshot that fixes who may vote, so a
 * wallet created after this moment can never influence the result.
 */
registration_closes_at: u64;
  /**
 * Sign up opens for participants.
 */
registration_opens_at: u64;
  /**
 * The organizer has finished the screening round.
 */
screening_closes_at: u64;
  /**
 * Projects are pinned and no further submission is accepted.
 */
submission_closes_at: u64;
  /**
 * Teams may start filing their project.
 */
submission_opens_at: u64;
}


/**
 * How much room the organizer announced for moving deadlines.
 * 
 * Declaring this before the lock is the whole point: participants know up
 * front that submission can slip by at most so much, so an extension is a
 * use of a published allowance rather than a surprise.
 */
export interface ExtensionPolicy {
  /**
 * How many times a single deadline may be moved. Zero means the announced
 * schedule is final.
 */
max_extensions_per_deadline: u32;
  /**
 * The total number of seconds a single deadline may gain across all of
 * its extensions.
 */
max_total_seconds_per_deadline: u64;
}

/**
 * The stages a hackathon walks through, in order.
 * 
 * A hackathon only ever moves forward and every stage has exactly one legal
 * successor, so a caller can never skip a gate by picking a target state
 * itself.
 * 
 * A stage is not the same thing as a window. Two stages carry two windows
 * each, because the underlying activities genuinely overlap and pretending
 * otherwise would force a schedule nobody runs. [`Phase::Open`] holds the
 * registration window and the submission window, since people sign up and
 * start building on the same evening. [`Phase::Judging`] holds the scoring
 * window and the community vote window, both sealed, so the crowd never votes
 * with the judge table already in front of it. Each window is gated by its own
 * timestamps rather than by the stage alone.
 */
export enum Phase {
  Draft = 0,
  Funding = 1,
  Open = 2,
  Screening = 3,
  Judging = 4,
  Reveal = 5,
  Finalization = 6,
  Settlement = 7,
  Completed = 8,
  Cancelled = 9,
}


/**
 * How much of its extension allowance one deadline has spent.
 */
export interface ExtensionUsage {
  /**
 * Total seconds gained across those moves.
 */
seconds_added: u64;
  /**
 * How many times this deadline has been moved.
 */
times: u32;
}


/**
 * Everything about a hackathon that changes while it runs.
 * 
 * This sits beside the constitution rather than inside it. The constitution is
 * hashed and frozen; if the schedule in force lived there, moving a deadline
 * by an hour after an outage would break the digest and make a legitimate,
 * announced, judge approved extension look identical to tampering. So the
 * announced schedule stays locked in the constitution, the schedule actually
 * in force lives here, and the difference between them is a public list of
 * recorded extensions.
 */
export interface HackathonState {
  /**
 * When the ranking closed, which is where the safety window counts from.
 * Zero until then.
 */
finalized_at: u64;
  /**
 * Where the hackathon is in its lifecycle.
 */
phase: Phase;
  /**
 * The deadlines actually in force: the announced ones plus every recorded
 * extension.
 */
schedule: Schedule;
  /**
 * When the money actually became payable, which is where the claim period
 * counts from. Kept apart from `finalized_at` because a settlement nobody
 * opened for a month would otherwise burn the claim period before any
 * winner could reach their prize.
 */
settlement_opened_at: u64;
  /**
 * Whether settlement is being held by the pre declared authority. Scores
 * are untouchable either way; this only stops money from moving.
 */
settlement_paused: boolean;
}


/**
 * A move to end the hackathon early, and how far along it is.
 * 
 * Cancellation is the only power that reaches everybody at once, so it carries
 * the same shape as the others rather than a shortcut: it is opened with a
 * reason, it is signed by judges against a threshold announced before the lock,
 * and only then does it take effect and send the pool back along the route the
 * rules named.
 */
export interface CancellationCase {
  /**
 * How many judges have signed.
 */
approvals: u32;
  /**
 * When the organizer opened it.
 */
opened_at: u64;
  /**
 * Digest of the written reason.
 */
reason: Buffer;
}

/**
 * Every rejection the core contract can produce.
 * 
 * # Why there are only so many
 * 
 * The contract spec caps an error enum at fifty cases, and that cap is
 * normative: it lives in `Stellar-contract-spec.x` as `cases<50>`. An enum
 * past it still compiles and still deploys, because the Rust reader is
 * lenient, but the published interface it produces cannot be parsed by a
 * strict XDR reader. The official JavaScript SDK is one, so a contract over
 * the limit cannot be called from a browser at all, and no wallet or explorer
 * can read its interface either.
 * 
 * So the budget is real, and it is spent where it buys something. A caller
 * hitting one of these already knows which entry point they called and what
 * they passed it; the code only has to say what went wrong that the caller
 * could not have known. That principle sorts the two kinds of failure:
 * 
 * **Rules that were submitted and refused** collapse into
 * [`Error::ConstitutionInvalid`]. The organizer is holding the document that
 * was rejected, the SDK validates it field by field before it i
 */
export const Errors = {
  1: {message:"NotInitialized"},
  2: {message:"AlreadyInitialized"},
  /**
   * The caller is not the organizer, and not a collaborator where one would
   * have done. Which of the two was needed is a property of the entry point
   * rather than of the failure.
   */
  3: {message:"NotAuthorized"},
  4: {message:"NotJudge"},
  5: {message:"NotTeamMember"},
  /**
   * A collaborator change that cannot stand: already on the list, not on it,
   * or the organizer trying to also be their own helper.
   */
  6: {message:"CollaboratorInvalid"},
  7: {message:"VaultNotBound"},
  8: {message:"VaultAlreadyBound"},
  /**
   * The vault named serves a different hackathon, or holds a different asset
   * from the one the rules name.
   */
  9: {message:"VaultRejected"},
  /**
   * The constitution does not hold together. Every validation failure
   * arrives here, and the SDK is what tells an organizer which field.
   */
  20: {message:"ConstitutionInvalid"},
  /**
   * The hackathon is not in a phase where this call means anything. Also
   * covers a phase that ends on an action being asked to end on the clock.
   */
  30: {message:"WrongPhase"},
  31: {message:"RulesAlreadyLocked"},
  32: {message:"DeadlineNotReached"},
  33: {message:"DeadlinePassed"},
  /**
   * The schedule that would result does not run in order, which includes a
   * deadline being asked to move backwards.
   */
  34: {message:"ScheduleInvalid"},
  35: {message:"ExtensionLimitReached"},
  /**
   * The record named does not exist: no such application, team, submission,
   * track, scorecard or prize position. The entry point says which.
   */
  40: {message:"NotFound"},
  /**
   * The application is not in the state the call needs: already filed, or
   * already decided.
   */
  41: {message:"ApplicationNotPending"},
  42: {message:"NotApproved"},
  /**
   * This person cannot join this team: it is full, they are already on it,
   * or they are already on another and the rules forbid a second.
   */
  43: {message:"TeamJoinRejected"},
  /**
   * The entry is out of the running, whether it was screened out or
   * disqualified.
   */
  44: {message:"SubmissionNotEligible"},
  /**
   * The scorecard does not fit the rubric: a missing criterion, an unknown
   * one, or a score outside the allowed range.
   */
  50: {message:"ScorecardInvalid"},
  51: {message:"ScorecardAlreadyRecorded"},
  /**
   * This judge stepped away from this project, or is being asked to step
   * away from it twice.
   */
  52: {message:"JudgeRecused"},
  53: {message:"WrongJudgingMode"},
  /**
   * The sealing digest is already published and cannot be replaced. Covers
   * scorecards and ballots alike.
   */
  54: {message:"RootAlreadyPublished"},
  55: {message:"RootMissing"},
  56: {message:"ProofDoesNotMatchRoot"},
  60: {message:"VoterNotEligible"},
  61: {message:"SelfVoteRejected"},
  62: {message:"CommunityVoteDisabled"},
  63: {message:"BallotAlreadyCounted"},
  /**
   * A case of this kind is already running against this subject.
   */
  70: {message:"CaseAlreadyOpen"},
  /**
   * No case is running, or the one that was has already been settled.
   */
  71: {message:"CaseNotOpen"},
  72: {message:"AlreadySigned"},
  73: {message:"JudgeApprovalThresholdNotMet"},
  74: {message:"AppealWindowOpen"},
  75: {message:"AppealWindowClosed"},
  /**
   * The ranking cannot close while a case is still undecided.
   */
  76: {message:"DisqualificationUnresolved"},
  77: {message:"NoAwardNotDeclarable"},
  80: {message:"ResultsNotFinalized"},
  81: {message:"SafetyWindowOpen"},
  82: {message:"SettlementPaused"},
  83: {message:"SettlementNotPaused"},
  84: {message:"SettlementIncomplete"},
  85: {message:"PrizeAlreadyPaid"},
  86: {message:"ClaimPeriodOpen"},
  87: {message:"VaultUnderfunded"}
}





































/**
 * A team, as the contract sees it.
 * 
 * A prize is split equally between everybody on the team, and the contract
 * pays each of them directly. There are no configurable shares: equal shares
 * always add up, so the whole class of failure where a team reaches the
 * deadline with a split that does not total a hundred percent cannot happen.
 * What it costs is the case where a team genuinely wanted an uneven split,
 * and that is a conversation they can have with their own money afterwards.
 * 
 * The captain is a member like any other and takes the same share. What being
 * captain means is being able to admit people, and nothing about the money.
 */
export interface Team {
  /**
 * Whoever founded the team and can admit people to it. They hold no claim
 * on the prize beyond the share every member takes.
 */
captain: string;
  id: u32;
  /**
 * Everyone on the team, the captain included and always first.
 */
members: Array<string>;
}


/**
 * One person's request to take part, and what came of it.
 * 
 * The rejection reason is kept here rather than only in an event, because a
 * refusal that leaves no permanent record is the quiet back door the product
 * exists to close. It is a hash: the written reason lives off chain, and this
 * proves which text was given.
 */
export interface Registration {
  /**
 * When the request arrived.
 */
applied_at: u64;
  /**
 * When it was decided; zero while it is still pending.
 */
decided_at: u64;
  /**
 * Digest of the written reason for a refusal; all zeroes otherwise.
 */
reason: Buffer;
  status: ApplicationStatus;
}

/**
 * Where a request to take part stands.
 */
export enum ApplicationStatus {
  Pending = 0,
  Approved = 1,
  Rejected = 2,
}


/**
 * One project as the ranking sees it.
 * 
 * Everything the tie break chain can ask about is gathered here first, so the
 * comparison is a pure function of its inputs. That matters more than it
 * sounds: a ranking that reaches into storage while it sorts is a ranking
 * nobody can reproduce off chain, and reproducing it is the entire promise.
 */
export interface Candidate {
  community: u32;
  /**
 * Means for the criteria the tie break chain names, and no others.
 */
criterion_averages: Array<CriterionScore>;
  final_score: u32;
  /**
 * The judges' mean, or zero when there were none.
 */
judge_average: u32;
  /**
 * When the project first arrived, which is the last resort separator.
 */
submitted_at: u64;
  team: u32;
}

/**
 * Which step of the tie break chain decided a placing.
 * 
 * Recorded alongside the ranking so the proof page can name it. A participant
 * asking why they came fourth deserves to read the actual reason rather than
 * be told the contract worked it out.
 */
export enum DecidedBy {
  Score = 0,
  JudgeScore = 1,
  Criterion = 2,
  CommunityScore = 3,
  SubmissionOrder = 4,
}


/**
 * One project's place in its track, and why it sits there.
 */
export interface Placement {
  community: u32;
  /**
 * How this project was separated from the one placed directly above it.
 * The winner has nothing above them, so theirs reads as the score.
 */
decided_by: DecidedBy;
  final_score: u32;
  judge_average: u32;
  /**
 * One based, counting down from the winner.
 */
rank: u32;
  team: u32;
}


/**
 * A track's move to award nothing, and how far along it is.
 * 
 * The five conditions the product attaches to this power are all here rather
 * than in a policy document: the track was marked before the rules locked, the
 * reason is recorded, the judges have to sign, the appeal window has to run
 * out, and only then does the money move. Every one of them is a line in
 * `resolve_no_award`, which is what makes this discretion rather than a
 * loophole.
 */
export interface NoAwardCase {
  /**
 * How many judges have signed.
 */
approvals: u32;
  /**
 * When the organizer opened it, which is where the appeal window counts
 * from.
 */
opened_at: u64;
  /**
 * Digest of the written reason.
 */
reason: Buffer;
  /**
 * Whether it has been settled one way or the other.
 */
resolved: boolean;
}

/**
 * Everything the core contract stores, one variant per family of entry.
 * 
 * Keys are an enum rather than loose symbols so that adding a new kind of
 * entry is a change the compiler sees. A typo in a raw symbol key writes to a
 * slot nobody reads, and that failure is silent, which is the worst shape a
 * storage bug can take when prize money is involved.
 */
export type DataKey = {tag: "Organizers", values: void} | {tag: "Constitution", values: void} | {tag: "ConstitutionHash", values: void} | {tag: "State", values: void} | {tag: "Extensions", values: readonly [Deadline]} | {tag: "Vault", values: void} | {tag: "Registration", values: readonly [string]} | {tag: "Team", values: readonly [u32]} | {tag: "TeamCount", values: void} | {tag: "Membership", values: readonly [string]} | {tag: "Submission", values: readonly [u32]} | {tag: "Cancellation", values: void} | {tag: "CancellationApproval", values: readonly [string]} | {tag: "Disqualification", values: readonly [u32]} | {tag: "DisqualificationApproval", values: readonly [u32, string]} | {tag: "Recusal", values: readonly [string, u32]} | {tag: "RecusalCount", values: readonly [u32]} | {tag: "ScoreRoot", values: void} | {tag: "Score", values: readonly [u32, string]} | {tag: "ScoreTally", values: readonly [u32]} | {tag: "BallotRoot", values: void} | {tag: "BallotCounted", values: readonly [string]} | {tag: "VoteCount", values: readonly [u32]} | {tag: "TopVoteCount", values: void} | {tag: "CriterionTally", values: readonly [u32, string]} | {tag: "Ranking", values: readonly [string]} | {tag: "Paid", values: readonly [string, u32]} | {tag: "Share", values: readonly [string, u32, string]} | {tag: "ShareCount", values: readonly [string, u32]} | {tag: "NoAward", values: readonly [string]} | {tag: "NoAwardApproval", values: readonly [string, string]};


/**
 * One judge's verdict on one project.
 * 
 * In the easy mode this is signed off chain and only its digest reaches the
 * chain before the reveal. In the strict mode the judge commits to it
 * themselves. Either way the shape is the same, so the scoring maths has one
 * implementation rather than two that can disagree.
 */
export interface Scorecard {
  judge: string;
  /**
 * One entry per criterion in the track's rubric.
 */
scores: Array<CriterionScore>;
  /**
 * The team whose project this scores.
 */
team: u32;
}


/**
 * A project's revealed scorecards, kept as a running count and sum.
 * 
 * The average is the arithmetic mean of the valid scorecards, and holding the
 * pair means computing it never requires loading every scorecard a project
 * received. The sum is widened to sixty four bits so a project with hundreds
 * of judges cannot overflow it.
 */
export interface ScoreTally {
  count: u32;
  total: u64;
}


/**
 * What one judge gave one criterion.
 */
export interface CriterionScore {
  criterion: string;
  /**
 * Zero to a hundred, inclusive.
 */
score: u32;
}


/**
 * One criterion's revealed scores for one project, as a count and a sum.
 * 
 * Kept alongside the weighted totals because the tie break chain can be asked
 * to separate two projects on a single criterion, and the weighted total has
 * already blended the criteria together by then.
 */
export interface CriterionTally {
  count: u32;
  /**
 * Sum of the raw zero to a hundred scores.
 */
total: u64;
}

export interface Client {
  /**
   * Construct and simulate a team transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The organizer and their collaborators.
   */
  team: (options?: MethodOptions) => Promise<AssembledTransaction<Result<OrganizingTeam>>>

  /**
   * Construct and simulate a apply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Asks to take part.
   * 
   * The request has to arrive before registration closes. An organizer may
   * still be working through the queue after that, and a late approval is
   * fine, but a late request is not: the deadline is what fixes who could
   * possibly be in the electorate.
   */
  apply: ({applicant}: {applicant: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a phase transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The current phase, which is the one value most readers want.
   */
  phase: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Phase>>>

  /**
   * Construct and simulate a score transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One judge's weighted total for one project, once revealed.
   */
  score: ({team_id, judge}: {team_id: u32, judge: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a state transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Where the hackathon is in its lifecycle, and the deadlines in force.
   */
  state: (options?: MethodOptions) => Promise<AssembledTransaction<Result<HackathonState>>>

  /**
   * Construct and simulate a vault transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The vault holding this hackathon's prize.
   */
  vault: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a cancel transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Calls the whole hackathon off before anybody has entered it.
   * 
   * The organizer signs alone here, and only here. Until submissions open
   * there is nobody whose weekend is at stake: no team has formed, no code
   * has been written, and the only thing at risk is money the organizer put
   * in themselves. Asking a bench of judges to sign off on stopping an event
   * nobody joined would be ceremony rather than protection.
   * 
   * The moment submissions open, this door closes and
   * `open_cancellation` is the only way out.
   */
  cancel: ({reason}: {reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a create transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Creates a hackathon in draft, with its first version of the rules.
   * 
   * The rules are validated immediately rather than at the lock. A draft
   * that cannot become a valid hackathon is not worth the ledger space, and
   * an organizer discovers the problem while they are still editing rather
   * than at the moment they meant to publish.
   */
  create: ({organizer, constitution}: {organizer: string, constitution: Constitution}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a recuse transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Steps a judge away from one project.
   * 
   * The protocol cannot detect that a judge used to work with a team, so the
   * declaration is theirs to make. What it can do is make the declaration
   * permanent and public, and stop that judge counting toward the project's
   * quorum, so a conflict handled honestly looks different from a judge who
   * simply never got round to scoring.
   * 
   * It has to happen before the judging window closes, for the same reason
   * scores are sealed: a judge who could step away after seeing where a
   * project stood would be choosing which results to touch.
   */
  recuse: ({judge, team_id}: {judge: string, team_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a funding transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * What the vault actually holds.
   */
  funding: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a is_paid transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether a prize position has already been paid.
   */
  is_paid: ({track, rank}: {track: string, rank: u32}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a publish transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens the hackathon for registration and submissions.
   * 
   * The funding check is the whole point of this call. A hackathon that
   * announces a prize it does not hold is the first problem the product set
   * out to remove, so the pool has to cover the prize table in full before
   * anybody can sign up. Anyone may call this once that is true; making it
   * the organizer's privilege would let them sit on a funded hackathon.
   */
  publish: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a ranking transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One track's finished ranking, in order.
   */
  ranking: ({track}: {track: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Array<Placement>>>>

  /**
   * Construct and simulate a complete transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Closes the hackathon for good.
   * 
   * Every prize position has to have been settled one way or another first:
   * paid to a winner, returned after a no award, or swept once the claim
   * period ran out. A hackathon that closed with money still owed would be
   * exactly the outcome the proof page exists to make impossible.
   */
  complete: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a may_vote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether this person may cast a community ballot.
   */
  may_vote: ({who}: {who: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>

  /**
   * Construct and simulate a no_award transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * A track's move to award nothing, if one was opened.
   */
  no_award: ({track}: {track: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<NoAwardCase>>>

  /**
   * Construct and simulate a configure transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Replaces the draft rules.
   * 
   * Only the organizer, and only while the hackathon is still a draft. The
   * phase check is what makes the lock mean anything: once the rules are
   * frozen this call has no path back in, no matter who signs it.
   */
  configure: ({constitution}: {constitution: Constitution}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a has_voted transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether this wallet's ballot has already been counted.
   */
  has_voted: ({voter}: {voter: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a add_member transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds someone to a team.
   * 
   * Both sides sign: the captain because it is their team and their prize,
   * the member because being placed on a team can cost them the right to
   * join the one they meant to. Neither can do it alone.
   */
  add_member: ({team_id, member}: {team_id: u32, member: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a bind_vault transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Points the hackathon at the vault holding its prize.
   * 
   * The binding is checked from both sides rather than taken on the
   * organizer's word. A vault serving a different hackathon, or holding a
   * different token from the one the rules name, is refused; otherwise an
   * organizer could point at a pool they control and publish a hackathon
   * whose prize was never really committed.
   */
  bind_vault: ({vault}: {vault: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_recused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether this judge stepped away from this project.
   */
  is_recused: ({judge, team_id}: {judge: string, team_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a lock_rules transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Freezes the rules and returns their digest.
   * 
   * This is the one irreversible step of the setup path, and everything the
   * product promises rests on it. After this call the rules can be read by
   * anyone and written by no one, so a participant who reads the page before
   * they start building is reading the rules that will decide the result.
   */
  lock_rules: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a membership transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The teams one person belongs to.
   */
  membership: ({who}: {who: string}, options?: MethodOptions) => Promise<AssembledTransaction<Array<u32>>>

  /**
   * Construct and simulate a score_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The digest sealing the scorecards.
   */
  score_root: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a submission transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One team's entry.
   */
  submission: ({team_id}: {team_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Submission>>>

  /**
   * Construct and simulate a team_by_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One team.
   */
  team_by_id: ({id}: {id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Team>>>

  /**
   * Construct and simulate a team_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * How many teams have been founded.
   */
  team_count: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a vote_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * How many ballots a project has been given.
   */
  vote_count: ({team_id}: {team_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a ballot_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The digest sealing the ballots.
   */
  ballot_root: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a create_team transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Starts a team, with the caller as its captain.
   * 
   * The captain is the address the prize is paid to, so founding a team is
   * also the moment somebody takes responsibility for settling up with the
   * people who join it.
   */
  create_team: ({captain}: {captain: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a score_tally transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * A project's revealed scorecards, as a count and a sum.
   */
  score_tally: ({team_id}: {team_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<ScoreTally>>

  /**
   * Construct and simulate a sweep_share transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns one member's share, once they have had the window they were
   * promised and not used it.
   * 
   * Only that member's share moves. A teammate who did collect keeps what
   * they collected, and a teammate who has not yet still has until the
   * period runs out for them too, because the period is the same for
   * everybody and counts from the moment the money became payable.
   */
  sweep_share: ({track, rank, member}: {track: string, rank: u32, member: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a cancellation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The move to end the hackathon early, if one was opened.
   */
  cancellation: (options?: MethodOptions) => Promise<AssembledTransaction<Result<CancellationCase>>>

  /**
   * Construct and simulate a constitution transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The rules, draft or locked.
   */
  constitution: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Constitution>>>

  /**
   * Construct and simulate a meets_quorum transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether a project gathered the scorecards its track's quorum asks for.
   */
  meets_quorum: ({team_id}: {team_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>

  /**
   * Construct and simulate a registration transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One person's registration.
   */
  registration: ({applicant}: {applicant: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Registration>>>

  /**
   * Construct and simulate a reveal_score transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens one sealed scorecard.
   * 
   * Anyone may call this and it needs no signature, because the proof is the
   * authorization: a scorecard that does not sit under the published root is
   * refused, and one that does was written by the judge it names before the
   * window closed. That is what lets a participant open every scorecard
   * themselves rather than waiting for somebody to publish them.
   */
  reveal_score: ({scorecard, proof}: {scorecard: Scorecard, proof: Array<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a settle_prize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pays one team member their share of one prize position.
   * 
   * A prize is split equally across the team and each member is paid
   * directly, so the contract shows the last hop of the money rather than
   * stopping at the captain's address and leaving the rest to trust.
   * 
   * One member at a time, and that is not a convenience. A Stellar account
   * holding no trustline for the prize asset cannot receive it, and the
   * transfer that fails takes the whole transaction with it. Paying a team
   * in one call would therefore let a single unprepared member freeze their
   * teammates' money as surely as an unprepared winner used to freeze the
   * other positions. Paid one at a time, they block only themselves.
   * 
   * No signature is asked for. The ranking is settled, the amounts come
   * from the locked prize table, the split is arithmetic and the recipients
   * come from the team, so there is nothing left for anybody to decide.
   * Making this the organizer's call would only give them the power to sit
   * on it.
   */
  settle_prize: ({track, rank, member}: {track: string, rank: u32, member: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a advance_phase transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Moves the hackathon into its next stage once the clock allows it.
   * 
   * Only the three stages that end on a deadline can be moved this way, and
   * never before that deadline passes, so this can close a window but never
   * cut one short. No signature is asked for: the condition is a timestamp
   * anyone can read, and making the organizer the only one who can act on it
   * would let them stall a hackathon whose submission window has closed.
   */
  advance_phase: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Phase>>>

  /**
   * Construct and simulate a open_no_award transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens a track's move to award nothing.
   * 
   * The track had to be marked for this before the rules locked, which means
   * every participant read it before writing a line of code. An organizer
   * who did not mark it cannot reach for this afterwards, however
   * disappointing the entries turned out to be.
   */
  open_no_award: ({track, reason}: {track: string, reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a reveal_ballot transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens one sealed ballot and counts it.
   * 
   * Three gates stand between a sealed ballot and the tally, and each one
   * exists because of a specific way a vote can be bought. The voter has to
   * have been approved before registration closed, so an organizer cannot
   * admit an electorate once they know what it would decide. They cannot
   * have been counted before, so one wallet is one vote. And they cannot be
   * on the team they chose, so nobody votes for themselves.
   * 
   * Like the scorecard reveal, this needs no signature: the proof is what
   * authorizes it.
   */
  reveal_ballot: ({voter, team_id, proof}: {voter: string, team_id: u32, proof: Array<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a submit_appeal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Files the team's answer, inside the window they were given.
   * 
   * Any member may file it, for the same reason any member may enter the
   * project: a team whose captain is asleep would otherwise lose its right
   * of reply to a timezone.
   * 
   * The answer changes nothing on its own and is not required for the case
   * to be settled. What it does is put the team's account on the same public
   * record as the accusation, so a reader of the proof page sees both sides
   * or knows that only one was offered.
   */
  submit_appeal: ({member, team_id, appeal}: {member: string, team_id: u32, appeal: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a submit_project transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Enters a project, or revises one already entered.
   * 
   * Any member of the team may do this. Teams work together and joined by
   * mutual consent, and requiring the captain to be awake at the deadline is
   * a failure mode a hackathon does not need.
   * 
   * The digest is supplied by the caller rather than computed here, because
   * the metadata it covers never touches the chain. A client builds it from
   * the fields of `SubmissionMetadata`, and anyone can later fetch the same
   * metadata from `uri` and check it reaches the same value.
   */
  submit_project: ({member, team_id, track, metadata_hash, uri}: {member: string, team_id: u32, track: string, metadata_hash: Buffer, uri: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a top_vote_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The largest vote count any project holds.
   * 
   * This is the denominator the community score is measured against, so the
   * project the crowd liked most scores a hundred and the rest are placed
   * relative to it.
   */
  top_vote_count: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a criterion_tally transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One criterion's revealed scores for one project.
   */
  criterion_tally: ({team_id, criterion}: {team_id: u32, criterion: string}, options?: MethodOptions) => Promise<AssembledTransaction<CriterionTally>>

  /**
   * Construct and simulate a extend_deadline transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Gives one deadline more time, inside the allowance the rules announced.
   * 
   * The announced schedule stays in the constitution and stays hashed. What
   * moves is the schedule in force, and the gap between the two is this
   * call's event trail, so an extension always reads as an extension rather
   * than as rules that quietly say something else.
   * 
   * Three limits make that safe, and each one closes a specific way an
   * organizer could otherwise steer a result. The move has to fit the budget
   * published before the lock, so nobody is surprised by a window that keeps
   * growing. A deadline that has passed is closed for good, so an organizer
   * cannot read what arrived and only then decide to give more time. And the
   * whole schedule is revalidated afterwards, so a submission window pushed
   * past the screening round is refused rather than stranding the event.
   * 
   * A reason digest is required for the same reason a screening decision
   * needs one: this is discretion, and discretion has to be answerable.
   * 
   * Before the lock there is nothing to extend. The organ
   */
  extend_deadline: ({deadline, moved_to, reason}: {deadline: Deadline, moved_to: u64, reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a extension_usage transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * What one deadline has spent of its announced allowance.
   * 
   * Read beside `constitution().extensions`, this is what tells a
   * participant how much further a window could still move, which is the
   * question an announced allowance exists to answer.
   */
  extension_usage: ({deadline}: {deadline: Deadline}, options?: MethodOptions) => Promise<AssembledTransaction<ExtensionUsage>>

  /**
   * Construct and simulate a is_fully_funded transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether the prize is covered in full.
   */
  is_fully_funded: (options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>

  /**
   * Construct and simulate a open_settlement transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens settlement once the safety window has run out.
   * 
   * The window buys time to stop a payout after a bug is found between the
   * ranking and the money moving. It cannot change a score either way, and
   * it is capped, because a hold nobody can end is indistinguishable from
   * not paying at all.
   */
  open_settlement: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a sweep_unclaimed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns a position that never had a winner.
   * 
   * A track nobody entered, or one whose entries all fell short of the
   * quorum, still has a prize sitting against it, and a vault that can never
   * empty is a vault whose balance stops meaning anything. This is the whole
   * position at once because there is no team to split it between.
   * 
   * A position that was won is out of reach here however long nobody
   * collects it. Its shares belong to named people, and each one is returned
   * on its own through `sweep_share`.
   */
  sweep_unclaimed: ({track, rank}: {track: string, rank: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a add_collaborator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds a helper who can work through the application queue.
   * 
   * Unlike the rules, the collaborator list stays editable for the whole
   * event, because a hundred applications arriving at once is exactly when
   * an organizer needs another pair of hands and exactly when they cannot
   * wait for a new hackathon. The reach of that helper is narrow enough that
   * widening the list under pressure is safe.
   */
  add_collaborator: ({collaborator}: {collaborator: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a approve_no_award transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds a judge's signature to that move.
   * 
   * Withholding a prize is the one decision that most needs somebody other
   * than the organizer to agree, since the organizer is the party the money
   * goes back to.
   */
  approve_no_award: ({judge, track}: {judge: string, track: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a available_judges transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * How many judges are left to score a project, after recusals.
   * 
   * This is the number the quorum is measured against, so a project whose
   * bench emptied out through honest conflicts is visibly short of judges
   * rather than mysteriously unfinishable.
   */
  available_judges: ({team_id}: {team_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a disqualification transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The case against one team's entry, if one was opened.
   */
  disqualification: ({team_id}: {team_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<DisqualificationCase>>>

  /**
   * Construct and simulate a finalize_results transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Computes the ranking and closes the result.
   * 
   * Nothing is accepted from the caller. The contract reads the revealed
   * scorecards, the counted ballots and the locked formula, and works the
   * order out itself, which is the difference between a result anybody can
   * reproduce and a result somebody announced.
   * 
   * Every project that was ruled out in screening, or that never reached the
   * judge quorum, is left out of the ranking rather than placed last. Those
   * are different situations from a project that was judged and came last,
   * and the page shows which one applies.
   * 
   * A disqualification case still open holds this call back. Closing the
   * ranking around an entry whose standing is undecided would force the
   * outcome one way while the team still had time to answer, and there is no
   * way back once the result is final.
   */
  finalize_results: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a pause_settlement transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Holds the money where it is, with a reason.
   * 
   * Scores are untouchable either way. This stops payment and nothing else,
   * which is the only power worth having when a contract bug turns up after
   * the ranking is already correct.
   */
  pause_settlement: ({reason}: {reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a required_funding transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * What the prize table adds up to.
   */
  required_funding: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a resolve_no_award transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Settles the move, one way or the other.
   * 
   * The appeal window has to have run out and the judges have to have
   * signed. If either is missing the move fails and the track pays out
   * normally, which is the right default: a prize that was announced is owed
   * unless somebody clears a bar to withhold it.
   */
  resolve_no_award: ({track}: {track: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>

  /**
   * Construct and simulate a constitution_hash transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The digest of the locked rules, once they are locked.
   */
  constitution_hash: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a open_cancellation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens a move to stop a hackathon people are already building in.
   * 
   * From the moment submissions open, stopping the event costs teams work
   * they have already done, and the organizer is the party whose deposit
   * comes back. Those two facts together are why the threshold announced
   * before the lock applies from here on: the person who benefits from
   * stopping cannot be the only person who decides to.
   * 
   * Opening changes nothing on its own. The hackathon keeps running, and
   * deadlines keep passing, until the signatures are in and somebody calls
   * `resolve_cancellation`.
   */
  open_cancellation: ({reason}: {reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a resume_settlement transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lets the money move again.
   */
  resume_settlement: ({reason}: {reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a publish_score_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Seals every scorecard behind one digest.
   * 
   * This is the moment the judging window closes in the easy mode. Until it
   * happens the scorecards live off chain with the collection service; after
   * it, that service can no longer change any of them, because the root it
   * published commits to all of them at once.
   * 
   * Only the address the constitution named may call this, and only once.
   * A second root would let the sealer replace the whole set after seeing
   * what the first one produced.
   */
  publish_score_root: ({root}: {root: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a reject_application transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Keeps someone out, on the record.
   * 
   * The reason digest is required rather than optional. A refusal that
   * leaves no trace is the quiet back door beside the disqualification
   * process the product makes so much noise about.
   */
  reject_application: ({reviewer, applicant, reason}: {reviewer: string, applicant: string, reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a approve_application transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lets someone in.
   * 
   * Open to the organizer and to any collaborator, because a queue of a
   * hundred applications is exactly the thing one person cannot clear alone.
   */
  approve_application: ({reviewer, applicant}: {reviewer: string, applicant: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a publish_ballot_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Seals every community ballot behind one digest.
   * 
   * The same address that seals the scorecards seals the ballots, and for
   * the same reason: the crowd votes in a single action off chain, and
   * asking two hundred people to come back and reveal would lose most of
   * them. What the sealer cannot do is drop a ballot without the voter who
   * cast it being able to prove the omission.
   */
  publish_ballot_root: ({root}: {root: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a remove_collaborator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Removes a helper.
   * 
   * Applications they already decided stay decided. Reversing those would
   * mean a participant's admission could be revoked by an argument between
   * organizers, which is not a thing the participant can defend against.
   */
  remove_collaborator: ({collaborator}: {collaborator: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a approve_cancellation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds a judge's signature to that move.
   * 
   * Any judge on the bench may sign, not only those assigned to one track.
   * Stopping the event reaches every track at once, so narrowing the vote to
   * a single track's judges would let the organizer pick the smallest room
   * they had to convince.
   */
  approve_cancellation: ({judge}: {judge: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a resolve_cancellation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Stops the hackathon and sends the pool back along the declared route.
   * 
   * Unlike the no award path, falling short of the threshold is not an
   * outcome here, it is simply not yet. A cancellation that failed would
   * leave the event running, which it already is, so the call refuses and
   * the hackathon carries on until either the signatures arrive or nobody
   * mentions it again.
   * 
   * Nobody has to sign this. The signatures are already counted on chain and
   * the route was declared before the lock, so there is nothing left to
   * decide.
   */
  resolve_cancellation: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a invalidate_submission transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Rules an entry out of the running, on the record.
   * 
   * This is the screening round: spam, an empty repository, the wrong track,
   * code written before the event. It runs before any scorecard exists, so a
   * judge's opinion can never be the thing that shapes it, and it belongs to
   * the organizer rather than to a collaborator because it is a judgement
   * about the work rather than about who gets in the door.
   * 
   * The project is not deleted. It keeps its page carrying the reason, which
   * is the difference between a screening round and a disappearance.
   * 
   * An entry with a disqualification case open is out of reach here. Two
   * processes running on one entry would let the lighter one land first and
   * leave the heavier one holding a verdict it can no longer apply, and the
   * team would lose the appeal window they had already been given.
   */
  invalidate_submission: ({team_id, reason}: {team_id: u32, reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a open_disqualification transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens a case for removing an entry, on the record.
   * 
   * This runs alongside screening rather than after it. The two answer
   * different problems: screening is for the entries nobody would argue
   * about, and this is for the ones somebody would, whenever they surface.
   * An organizer who finds plagiarism on the last morning of screening
   * should not have to choose between waiting and using the lighter route,
   * because the lighter route is the one that gives the team no window to
   * answer and asks no judge to agree.
   * 
   * It closes at the reveal. Past that point the ranking is being computed,
   * and a removal landing after the result is announced would put every
   * payment back in doubt.
   * 
   * Opening a case removes nothing by itself. The entry stays in the running
   * the entire time the case is open, and only `resolve_disqualification`
   * can take it out.
   */
  open_disqualification: ({team_id, reason}: {team_id: u32, reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a approve_disqualification transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds a judge's signature to the case.
   * 
   * Only a judge assigned to the entry's own track may sign. A bench that
   * never saw the project has no basis to remove it, and letting them sign
   * would turn the threshold into a headcount the organizer could reach by
   * asking whoever was easiest to convince.
   */
  approve_disqualification: ({judge, team_id}: {judge: string, team_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a resolve_disqualification transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Settles the case, one way or the other.
   * 
   * The window has to have run out first, so a case cannot be rushed through
   * before the team has had the time they were promised to answer. If the
   * judges reached the announced threshold the entry comes out of the
   * running carrying the reason it was opened with; if they did not, the
   * case closes and the project competes as though it had never been opened.
   * That default is the same one the no award path uses: a team that entered
   * is in unless somebody clears the bar to remove them.
   * 
   * Nobody has to sign this. Both conditions are public values anyone can
   * read, and leaving the call to the organizer would let them park a case
   * they had lost.
   */
  resolve_disqualification: ({team_id}: {team_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAnhUaGUgcGVvcGxlIHJ1bm5pbmcgYSBoYWNrYXRob24gZnJvbSB0aGUgb3JnYW5pemluZyBzaWRlLgoKVGhlIG9yZ2FuaXplciBpcyBmaXhlZCB3aGVuIHRoZSBoYWNrYXRob24gaXMgY3JlYXRlZCBhbmQgaXMgdGhlIG9ubHkgYWRkcmVzcwp0aGF0IGNhbiBmdW5kIHRoZSB2YXVsdCwgbG9jayB0aGUgcnVsZXMsIHNjcmVlbiBzdWJtaXNzaW9ucyBvciBvcGVuIGEKZGlzcXVhbGlmaWNhdGlvbi4gQ29sbGFib3JhdG9ycyBhcmUgdGhlIG9yZ2FuaXplcidzIGhlbHBlcnMsIGFuZCB0aGVpciByZWFjaApzdG9wcyBhdCBvbmUgam9iOiBkZWNpZGluZyB3aG8gZ2V0cyBpbnRvIHRoZSBldmVudC4KClRoYXQgc3BsaXQgaXMgZGVsaWJlcmF0ZS4gVGhlIGNvbGxhYm9yYXRvciBsaXN0IGNhbiBncm93IGluIHRoZSBtaWRkbGUgb2YgYQpydW5uaW5nIGhhY2thdGhvbiwgd2hlbiBhIGh1bmRyZWQgYXBwbGljYXRpb25zIGFyZSB3YWl0aW5nIGFuZCBvbmUgcGVyc29uCmNhbm5vdCByZWFkIHRoZW0gYWxsLiBBbnl0aGluZyB0b3VjaGluZyB0aGUgcHJpemUgb3IgdGhlIHJhbmtpbmcgd291bGQgYmUKdW5zYWZlIHRvIGhhbmcgb2ZmIGEgbGlzdCB0aGF0IGdyb3dzIHVuZGVyIHRpbWUgcHJlc3N1cmUsIHNvIGl0IGRvZXMgbm90LgAAAAAAAAAOT3JnYW5pemluZ1RlYW0AAAAAAAIAAACOSGVscGVycyB3aG8gbWF5IHJldmlldyByZWdpc3RyYXRpb24gYXBwbGljYXRpb25zLiBDaGFuZ2VzIHRvIHRoaXMgbGlzdAphcmUgcmVjb3JkZWQsIHNvIHRoZSBwcm9vZiBwYWdlIGNhbiBzaG93IHdobyB3YXMgYWxsb3dlZCB0byBhZG1pdCB3aG9tLgAAAAAADWNvbGxhYm9yYXRvcnMAAAAAAAPqAAAAEwAAAEdUaGUgYWRkcmVzcyB0aGF0IGNyZWF0ZWQgdGhlIGhhY2thdGhvbiBhbmQgaG9sZHMgZXZlcnkgb3JnYW5pemVyIHBvd2VyLgAAAAAJb3JnYW5pemVyAAAAAAAAEw==",
        "AAAAAQAAAXZBIHRlYW0ncyBlbnRyeSwgYXMgdGhlIGNvbnRyYWN0IHJlY29yZHMgaXQuCgpUaGUgd3JpdGUgdXAgaXRzZWxmIGxpdmVzIG9mZiBjaGFpbiB1bmRlciBgdXJpYCwgYW5kIHdoYXQgc2l0cyBoZXJlIGlzIGl0cwpkaWdlc3QuIFRoYXQgaXMgdGhlIHdob2xlIHRyaWNrIG9mIHRoZSBzdWJtaXNzaW9uIGxvY2s6IGF0IHRoZSBkZWFkbGluZSB0aGlzCmRpZ2VzdCBzdG9wcyBiZWluZyB3cml0YWJsZSwgc28gdGhlIHByb2plY3QgYSBqdWRnZSBzY29yZXMgaXMgcHJvdmFibHkgdGhlCnByb2plY3QgdGhhdCB3YXMgZW50ZXJlZCwgd2l0aG91dCB0aGUgY2hhaW4gZXZlciBwYXlpbmcgdG8gc3RvcmUgYSB2aWRlbwpsaW5rIG9yIGEgcGFyYWdyYXBoIG9mIHByb3NlLgAAAAAAAAAAAApTdWJtaXNzaW9uAAAAAAAIAAAAS0RpZ2VzdCBvZiB0aGUgbWV0YWRhdGEsIGNvbXB1dGVkIG92ZXIgdGhlIGZpZWxkcyBvZgpbYFN1Ym1pc3Npb25NZXRhZGF0YWBdLgAAAAANbWV0YWRhdGFfaGFzaAAAAAAAA+4AAAAgAAAAUkRpZ2VzdCBvZiB0aGUgd3JpdHRlbiByZWFzb24gd2hlbiBhIHN1Ym1pc3Npb24gaXMgcnVsZWQgb3V0OyBhbGwgemVyb2VzCm90aGVyd2lzZS4AAAAAAAZyZWFzb24AAAAAA+4AAAAgAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAAQU3VibWlzc2lvblN0YXR1cwAAAOxXaGVuIHRoZSBlbnRyeSBmaXJzdCBhcnJpdmVkLgoKTGF0ZXIgZWRpdHMgZG8gbm90IG1vdmUgdGhpcy4gU3VibWlzc2lvbiBvcmRlciBpcyB0aGUgbGFzdCBzdGVwIG9mIHRoZQp0aWUgYnJlYWsgY2hhaW4sIHNvIGEgdGVhbSB0aGF0IGVkaXRzIGEgdHlwbyBhbiBob3VyIGJlZm9yZSB0aGUgZGVhZGxpbmUKd291bGQgb3RoZXJ3aXNlIGxvc2UgdGhlIHBsYWNlIHRoZWlyIGVhcmx5IGVudHJ5IGVhcm5lZCB0aGVtLgAAAAxzdWJtaXR0ZWRfYXQAAAAGAAAAH1RoZSB0ZWFtIHRoaXMgZW50cnkgYmVsb25ncyB0by4AAAAABHRlYW0AAAAEAAAAGVRoZSB0cmFjayBpdCBjb21wZXRlcyBpbi4AAAAAAAAFdHJhY2sAAAAAAAARAAAAGFdoZW4gaXQgd2FzIGxhc3QgZWRpdGVkLgAAAAp1cGRhdGVkX2F0AAAAAAAGAAAAI1doZXJlIHRoYXQgbWV0YWRhdGEgY2FuIGJlIGZldGNoZWQuAAAAAAN1cmkAAAAAEA==",
        "AAAAAwAAACJXaGV0aGVyIGEgc3VibWlzc2lvbiBzdGlsbCBjb3VudHMuAAAAAAAAAAAAEFN1Ym1pc3Npb25TdGF0dXMAAAADAAAAD0luIHRoZSBydW5uaW5nLgAAAAAFVmFsaWQAAAAAAAAAAAAAZVJ1bGVkIG91dCBkdXJpbmcgdGhlIHNjcmVlbmluZyByb3VuZC4gVGhlIHByb2plY3Qga2VlcHMgaXRzIHBhZ2UgYW5kIGl0cwpyZWFzb247IGl0IGlzIG5ldmVyIGRlbGV0ZWQuAAAAAAAAC0ludmFsaWRhdGVkAAAAAAEAAAG9UmVtb3ZlZCBhZnRlciB0aGUgc2NyZWVuaW5nIHJvdW5kLCB0aHJvdWdoIHRoZSBkaXNxdWFsaWZpY2F0aW9uIHByb2Nlc3MuCgpLZXB0IGFwYXJ0IGZyb20gYEludmFsaWRhdGVkYCByYXRoZXIgdGhhbiBmb2xkZWQgaW50byBpdCwgYmVjYXVzZSB0aGUgdHdvCmNhcnJ5IHZlcnkgZGlmZmVyZW50IHdlaWdodC4gU2NyZWVuaW5nIGlzIG9uZSBvcmdhbml6ZXIncyBjYWxsIG9uIGFuCmVudHJ5IG5vYm9keSBoYXMgc2NvcmVkIHlldDsgYSBkaXNxdWFsaWZpY2F0aW9uIHRha2VzIGEgc3RhdGVkIHJlYXNvbiwgYQp3aW5kb3cgZm9yIHRoZSB0ZWFtIHRvIGFuc3dlciwgYW5kIGEgYmVuY2ggb2YganVkZ2VzIHNpZ25pbmcsIGFuZCBhIHBhZ2UKdGhhdCBzaG93ZWQgdGhlbSBhcyB0aGUgc2FtZSB0aGluZyB3b3VsZCBmbGF0dGVyIHRoZSBmaXJzdCBhbmQgc2xhbmRlcgp0aGUgc2Vjb25kLgAAAAAAAAxEaXNxdWFsaWZpZWQAAAAC",
        "AAAAAQAAA6hFdmVyeXRoaW5nIGEgdGVhbSB3cml0ZXMgYWJvdXQgdGhlaXIgcHJvamVjdC4KCk5vbmUgb2YgdGhpcyBpcyBzdG9yZWQgb24gY2hhaW4uIEl0IGxpdmVzIG9mZiBjaGFpbiBhbmQgdGhlIGNvbnRyYWN0IGtlZXBzCm9ubHkgYSBoYXNoIG9mIGl0LCB3aGljaCBpcyB3aGF0IGZyZWV6ZXMgdGhlIHN1Ym1pc3Npb24gYXQgdGhlIGRlYWRsaW5lCndpdGhvdXQgcGF5aW5nIHRvIHN0b3JlIGEgZGVzY3JpcHRpb24gb3IgYSB2aWRlbyBsaW5rIGluIGxlZGdlciBzdGF0ZS4KClRoZSBzdHJ1Y3QgZXhpc3RzIGhlcmUgYW55d2F5LCBhbmQgdGhpcyBpcyB0aGUgaW1wb3J0YW50IHBhcnQ6IGl0IGZpeGVzIHRoZQpleGFjdCBmaWVsZCBzZXQgYW5kIGZpZWxkIG9yZGVyIHRoYXQgdGhlIGhhc2ggY292ZXJzLiBBIGNsaWVudCB0aGF0CnNlcmlhbGl6ZXMgdGhlc2UgZmllbGRzIGluIHRoaXMgb3JkZXIgYXJyaXZlcyBhdCB0aGUgc2FtZSBkaWdlc3QgdGhlCmNvbnRyYWN0IHdvdWxkLCB3aGljaCBpcyB3aGF0IGxldHMgYW55b25lIGNoZWNrIHRoYXQgdGhlIHByb2plY3QgYmVpbmcKanVkZ2VkIGlzIHRoZSBwcm9qZWN0IHRoYXQgd2FzIHN1Ym1pdHRlZC4KCkNoZWNraW5nIHRoZXNlIGZpZWxkcyBhZ2FpbnN0IFtgU3VibWlzc2lvblJlcXVpcmVtZW50c2BdIGlzIHRoZSBTREsncyBqb2IsCm5vdCB0aGlzIGNvbnRyYWN0J3MuIFRoZSBtZXRhZGF0YSBuZXZlciByZWFjaGVzIHRoZSBjaGFpbiwgb25seSBpdHMgZGlnZXN0CmRvZXMsIHNvIGEgY29udHJhY3Qgc2lkZSBjaGVjayB3b3VsZCBiZSB2YWxpZGF0aW5nIHNvbWV0aGluZyBpdCBjYW5ub3Qgc2VlLgpUaGUgU0RLIHJ1bnMgaXQgYmVmb3JlIGNvbXB1dGluZyB0aGUgaGFzaCwgd2hlcmUgaXQgY2FuIGFsc28gc2F5IHdoaWNoIGZpZWxkCmlzIG1pc3NpbmcgcmF0aGVyIHRoYW4gb25seSB0aGF0IG9uZSBpcy4AAAAAAAAAElN1Ym1pc3Npb25NZXRhZGF0YQAAAAAACAAAACtEZW1vIHZpZGVvLCBub3JtYWxseSBhIFlvdVR1YmUgb3IgTG9vbSBVUkwuAAAAAA5kZW1vX3ZpZGVvX3VybAAAAAAAEAAAABJUaGUgZnVsbCB3cml0ZSB1cC4AAAAAAAtkZXNjcmlwdGlvbgAAAAAQAAAAN0EgZGVwbG95ZWQgaW5zdGFuY2UgYSBqdWRnZSBjYW4gb3BlbiBhbmQgY2xpY2sgdGhyb3VnaC4AAAAACGxpdmVfdXJsAAAAEAAAAB9XaGVyZSB0aGUgbG9nbyBpbWFnZSBpcyBzdG9yZWQuAAAAAAhsb2dvX3VyaQAAABAAAAAmVGhlIHByb2plY3QgbmFtZSBzaG93biBpbiB0aGUgZ2FsbGVyeS4AAAAAAARuYW1lAAAAEAAAAClTb3VyY2UgcmVwb3NpdG9yeSwgbm9ybWFsbHkgYSBHaXRIdWIgVVJMLgAAAAAAAA5yZXBvc2l0b3J5X3VybAAAAAAAEAAAACFPbmUgbGluZSBkZXNjcmliaW5nIHdoYXQgaXQgZG9lcy4AAAAAAAAHc3VtbWFyeQAAAAAQAAAAI1RoZSB0cmFjayB0aGlzIHByb2plY3QgY29tcGV0ZXMgaW4uAAAAAAV0cmFjawAAAAAAABE=",
        "AAAAAQAAAkVBIGNhc2UgZm9yIHJlbW92aW5nIGFuIGVudHJ5IGFmdGVyIHRoZSBzY3JlZW5pbmcgcm91bmQgaGFzIGNsb3NlZC4KClRoaXMgaXMgdGhlIGhlYXZpZXN0IHBvd2VyIGluIHRoZSBwcm9kdWN0LCBzbyBldmVyeSBjb25kaXRpb24gdGhlIFBSRAphdHRhY2hlcyB0byBpdCBpcyBhIGZpZWxkIGhlcmUgcmF0aGVyIHRoYW4gYSBwcm9taXNlIG1hZGUgZWxzZXdoZXJlOiB0aGUKcmVhc29uIGlzIHJlY29yZGVkIGJlZm9yZSBhbnl0aGluZyBoYXBwZW5zLCB0aGUgdGVhbSBnZXRzIGEgd2luZG93IHRvIGFuc3dlcgpvbiB0aGUgcmVjb3JkLCBqdWRnZXMgb3RoZXIgdGhhbiB0aGUgb3JnYW5pemVyIGhhdmUgdG8gc2lnbiwgYW5kIG9ubHkgYWZ0ZXIKdGhlIHdpbmRvdyBjbG9zZXMgZG9lcyBhbnlvbmUgZmluZCBvdXQgd2hldGhlciBpdCBjYXJyaWVkLiBBIGNhc2UgdGhhdApnYXRoZXJzIG5vIHNpZ25hdHVyZXMgZW5kcyB3aXRoIHRoZSBwcm9qZWN0IHN0aWxsIGluIHRoZSBydW5uaW5nLCBiZWNhdXNlIGEKdGVhbSB0aGF0IGVudGVyZWQgaXMgaW4gdW5sZXNzIHNvbWVib2R5IGNsZWFycyB0aGUgYmFyIHRvIHJlbW92ZSB0aGVtLgAAAAAAAAAAAAAURGlzcXVhbGlmaWNhdGlvbkNhc2UAAAAHAAAARERpZ2VzdCBvZiB0aGUgdGVhbSdzIHdyaXR0ZW4gYW5zd2VyOyBhbGwgemVyb2VzIHVudGlsIHRoZXkgZmlsZSBvbmUuAAAABmFwcGVhbAAAAAAD7gAAACAAAAAkV2hlbiB0aGV5IGZpbGVkIGl0LCB6ZXJvIHVudGlsIHRoZW4uAAAAC2FwcGVhbGVkX2F0AAAAAAYAAAAcSG93IG1hbnkganVkZ2VzIGhhdmUgc2lnbmVkLgAAAAlhcHByb3ZhbHMAAAAAAAAEAAAAQVdoZW4gaXQgd2FzIG9wZW5lZCwgd2hpY2ggaXMgd2hlcmUgdGhlIGFwcGVhbCB3aW5kb3cgY291bnRzIGZyb20uAAAAAAAACW9wZW5lZF9hdAAAAAAAAAYAAAAdRGlnZXN0IG9mIHRoZSB3cml0dGVuIHJlYXNvbi4AAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAADFXaGV0aGVyIGl0IGhhcyBiZWVuIHNldHRsZWQgb25lIHdheSBvciB0aGUgb3RoZXIuAAAAAAAACHJlc29sdmVkAAAAAQAAAB5UaGUgZW50cnkgdGhlIGNhc2UgaXMgYWdhaW5zdC4AAAAAAAR0ZWFtAAAABA==",
        "AAAAAQAAAZZXaGljaCBsaW5rcyBhIHRlYW0gaGFzIHRvIHN1cHBseSBiZWZvcmUgdGhlaXIgcHJvamVjdCBjb3VudHMgYXMgc3VibWl0dGVkLgoKVGhlIG9yZ2FuaXplciBjaG9vc2VzIHRoaXMgYmVmb3JlIHRoZSBsb2NrLCBzbyBub2JvZHkgZGlzY292ZXJzIG9uIHRoZSBsYXN0CmV2ZW5pbmcgdGhhdCBhIGRlbW8gdmlkZW8gd2FzIGV4cGVjdGVkLiBBIHJlcG9zaXRvcnkgaXMgcmVxdWlyZWQgYnkgZGVmYXVsdAppbiBwcmFjdGljZSwgc2luY2UgYSBoYWNrYXRob24ganVkZ2luZyBjb2RlIHdpdGhvdXQgY29kZSB0byByZWFkIGlzIGp1ZGdpbmcKYSBwaXRjaCwgYnV0IHRoZSBjaG9pY2Ugc3RheXMgd2l0aCB0aGUgb3JnYW5pemVyIGJlY2F1c2UgaW50ZXJuYWwgYW5kIGRlc2lnbgpmb2N1c2VkIGV2ZW50cyBleGlzdCB0b28uAAAAAAAAAAAAFlN1Ym1pc3Npb25SZXF1aXJlbWVudHMAAAAAAAMAAAAnVGhlIHRlYW0gbXVzdCBzdXBwbHkgYSBkZW1vIHZpZGVvIGxpbmsuAAAAABNkZW1vX3ZpZGVvX3JlcXVpcmVkAAAAAAEAAAAxVGhlIHRlYW0gbXVzdCBzdXBwbHkgYSBsaW5rIHRvIHNvbWV0aGluZyBydW5uaW5nLgAAAAAAABFsaXZlX3VybF9yZXF1aXJlZAAAAAAAAAEAAAAuVGhlIHRlYW0gbXVzdCBzdXBwbHkgYSBzb3VyY2UgcmVwb3NpdG9yeSBsaW5rLgAAAAAAE3JlcG9zaXRvcnlfcmVxdWlyZWQAAAAAAQ==",
        "AAAAAwAAALZXaGVyZSBtb25leSBnb2VzIHdoZW4gaXQgaXMgbm90IGF3YXJkZWQgdG8gYSB3aW5uZXIuCgpXaGljaCByb3V0ZXMgYXJlIGxlZ2FsIGRlcGVuZHMgb24gd2h5IHRoZSBtb25leSBpcyB1bnNwZW50LCBzbyBlYWNoIHVzZQpjaGVja3MgaXRzIG93biBzZXQgcmF0aGVyIHRoYW4gYWNjZXB0aW5nIHRoZSB3aG9sZSBlbnVtLgAAAAAAAAAAAAtSZWZ1bmRSb3V0ZQAAAAADAAAAIEJhY2sgdG8gdGhlIG9yZ2FuaXplcidzIGFkZHJlc3MuAAAACU9yZ2FuaXplcgAAAAAAAAAAAADEQmFjayB0byB3aG9ldmVyIGRlcG9zaXRlZCBpdCwgaW4gcHJvcG9ydGlvbiB0byB3aGF0IHRoZXkgcHV0IGluLiBUaGlzIGlzCnRoZSByb3V0ZSBhIHNwb25zb3Igd2FudHMsIGJlY2F1c2UgaXQgcmV0dXJucyB0aGVpciBjb250cmlidXRpb24gdG8gdGhlbQpyYXRoZXIgdGhhbiB0byB0aGUgb3JnYW5pemVyIHdobyBzcGVudCBub25lIG9mIGl0LgAAAApEZXBvc2l0b3JzAAAAAAABAAAANFNwcmVhZCBhY3Jvc3MgdGhlIHRyYWNrcyB0aGF0IGRpZCBhd2FyZCB0aGVpciBwcml6ZS4AAAAPUmVtYWluaW5nVHJhY2tzAAAAAAI=",
        "AAAAAgAAACFXaGVuIHRoZSB2YXVsdCBpcyBhbGxvd2VkIHRvIHBheS4AAAAAAAAAAAAADlNldHRsZW1lbnRNb2RlAAAAAAACAAAAAAAAAIRQYXltZW50IHJ1bnMgdGhlIG1vbWVudCB0aGUgcmVzdWx0IGlzIGZpbmFsLiBSaWdodCBmb3IgYSBzbWFsbCBldmVudAp3aGVyZSB0aGUgb3BlcmF0aW9uYWwgd2luIGlzIHRoYXQgdGhlIG1vbmV5IGFycml2ZXMgaW4gbWludXRlcy4AAAAJSW1tZWRpYXRlAAAAAAAAAQAAAMpQYXltZW50IHdhaXRzIGZvciB0aGlzIG1hbnkgc2Vjb25kcywgZHVyaW5nIHdoaWNoIGEgcHJlIGRlY2xhcmVkCmF1dGhvcml0eSBjYW4gcGF1c2UgaXQgd2l0aCBhIHJlYXNvbi4gU2NvcmVzIGNhbiBuZXZlciBjaGFuZ2UgZWl0aGVyCndheTsgdGhlIHdpbmRvdyBidXlzIHRpbWUgdG8gc3RvcCBhIHBheW91dCwgbm90IHRvIHJld3JpdGUgYSByZXN1bHQuAAAAAAAMU2FmZXR5V2luZG93AAAAAQAAAAY=",
        "AAAAAQAAAZBFdmVyeSBwb3dlciB0aGUgb3JnYW5pemVyIGhvbGRzIGFmdGVyIHRoZSBydWxlcyBhcmUgbG9ja2VkLgoKTm9uZSBvZiB0aGVzZSBhcmUgcmVtb3ZlZCwgYmVjYXVzZSBhbiBvcmdhbml6ZXIgd2hvIGNhbm5vdCBkaXNxdWFsaWZ5IGEKcGxhZ2lhcmlzZWQgZW50cnkgb3IgZXh0ZW5kIGEgZGVhZGxpbmUgYWZ0ZXIgYW4gb3V0YWdlIHdpbGwgbm90IHJ1biB0aGVpcgpldmVudCBoZXJlLiBXaGF0IHRoZSBjb25zdGl0dXRpb24gZG9lcyBpbnN0ZWFkIGlzIHB1Ymxpc2ggZWFjaCBwb3dlciBiZWZvcmUKYW55b25lIHdyaXRlcyBhIGxpbmUgb2YgY29kZSwgYm91bmQgaXQsIGFuZCBtYWtlIGV2ZXJ5IHVzZSBvZiBpdCBsZWF2ZSBhCnJlY29yZC4gRmxleGliaWxpdHkgaXMga2VwdDsgc2VjcmVjeSBpcyBub3QuAAAAAAAAABBEaXNjcmV0aW9uUG9saWN5AAAACAAAAEpTZWNvbmRzIGEgdGVhbSBoYXMgdG8gYW5zd2VyIGEgZGlzcXVhbGlmaWNhdGlvbiBiZWZvcmUgaXQgY2FuIGJlCnJlc29sdmVkLgAAAAAADWFwcGVhbF93aW5kb3cAAAAAAAAGAAAAOldoZXJlIHRoZSBwcml6ZSBwb29sIGdvZXMgd2hlbiB0aGUgaGFja2F0aG9uIGlzIGNhbmNlbGxlZC4AAAAAABNjYW5jZWxsYXRpb25fcmVmdW5kAAAAB9AAAAALUmVmdW5kUm91dGUAAAAArEp1ZGdlcyB3aG8gbXVzdCBzaWduIGJlZm9yZSBhIGNhbmNlbGxhdGlvbiB0YWtlcyBlZmZlY3Qgb25jZSBzdWJtaXNzaW9uCmhhcyBvcGVuZWQuIEJlZm9yZSB0aGF0IHBvaW50IHRoZSBvcmdhbml6ZXIgY2FuIGNhbmNlbCBhbG9uZSwgYmVjYXVzZQpub2JvZHkgaGFzIHNwZW50IGFueXRoaW5nIHlldC4AAAAWY2FuY2VsbGF0aW9uX3RocmVzaG9sZAAAAAAABAAAADxKdWRnZXMgd2hvIG11c3Qgc2lnbiBiZWZvcmUgYSBkaXNxdWFsaWZpY2F0aW9uIHRha2VzIGVmZmVjdC4AAAAaZGlzcXVhbGlmaWNhdGlvbl90aHJlc2hvbGQAAAAAAAQAAAA8V2hlcmUgYSB0cmFjaydzIHByaXplIGdvZXMgd2hlbiB0aGUgdHJhY2sgZGVjbGFyZXMgbm8gYXdhcmQuAAAAD25vX2F3YXJkX3JlZnVuZAAAAAfQAAAAC1JlZnVuZFJvdXRlAAAAAEZTZWNvbmRzIGEgd2lubmVyIGhhcyB0byBjbGFpbSBhIHByaXplIGJlZm9yZSB0aGUgcmVmdW5kIHJvdXRlIGFwcGxpZXMuAAAAAAAScHJpemVfY2xhaW1fcGVyaW9kAAAAAAAGAAAAF1doZW4gdGhlIHZhdWx0IG1heSBwYXkuAAAAAApzZXR0bGVtZW50AAAAAAfQAAAADlNldHRsZW1lbnRNb2RlAAAAAAA9V2hlcmUgYW4gdW5jbGFpbWVkIHByaXplIGdvZXMgb25jZSB0aGUgY2xhaW0gcGVyaW9kIHJ1bnMgb3V0LgAAAAAAABB1bmNsYWltZWRfcmVmdW5kAAAH0AAAAAtSZWZ1bmRSb3V0ZQA=",
        "AAAAAwAAAo9XaG8gbWF5IHJlYWQgdGhlIHN1Ym1pdHRlZCBwcm9qZWN0cyB3aGlsZSB0aGUgaGFja2F0aG9uIGlzIHJ1bm5pbmcuCgpUaGlzIGdvdmVybnMgdGhlIHByb2plY3QgbWV0YWRhdGEgb25seSwgYW5kIGl0IGlzIGVuZm9yY2VkIG9mZiBjaGFpbiwgd2hlcmUKdGhhdCBtZXRhZGF0YSBsaXZlcy4gV2hhdCBzaXRzIG9uIGNoYWluIGlzIGEgaGFzaCwgYSB0aW1lc3RhbXAgYW5kIGEgdHJhY2ssCmFuZCB0aG9zZSBzdGF5IHJlYWRhYmxlIGJ5IGFueW9uZSBpbiBldmVyeSBzZXR0aW5nLiBBIHByaXZhdGUgaGFja2F0aG9uCnRoZXJlZm9yZSBzdGlsbCBwcm9kdWNlcyBhIHJlY2VpcHQgYSBzdHJhbmdlciBjYW4gY2hlY2s6IHRoZXkgY2FuIHNlZSB0aGF0CnByb2plY3Qgc2V2ZW4gc2NvcmVkIDg0LjIgYW5kIHdoYXQgZXZlcnkganVkZ2UgZ2F2ZSBpdCBvbiBldmVyeSBjcml0ZXJpb24sCnRoZXkgc2ltcGx5IGNhbm5vdCByZWFkIHdoYXQgcHJvamVjdCBzZXZlbiB3YXMuCgpDYWxsaW5nIHRoaXMgYSBwcml2YWN5IGd1YXJhbnRlZSB3b3VsZCBiZSBkaXNob25lc3QsIHNvIGl0IGlzIG5vdC4gSXQgaXMgYW4KYWNjZXNzIHJ1bGUgb24gdGhlIHBsYXRmb3JtJ3Mgb3duIEFQSSwgYW5kIHRoZSBwcm9vZiBvZiB0aGUgcmVzdWx0IG5ldmVyCmRlcGVuZHMgb24gaXQuAAAAAAAAAAARUHJvamVjdFZpc2liaWxpdHkAAAAAAAADAAAAgkFueW9uZSBjYW4gYnJvd3NlIHRoZSBnYWxsZXJ5LCBzaWduZWQgaW4gb3Igbm90LiBUaGlzIGlzIHRoZSBkZWZhdWx0IGFuZAp0aGUgc2V0dGluZyB0aGF0IG1ha2VzIGEgaGFja2F0aG9uIGl0cyBvd24gYWR2ZXJ0aXNlbWVudC4AAAAAAAZQdWJsaWMAAAAAAAAAAAC/T25seSBhcHByb3ZlZCBwYXJ0aWNpcGFudHMgb2YgdGhpcyBoYWNrYXRob24gY2FuIHNlZSB0aGUgcHJvamVjdHMuCkEgY2xvc2VkIGV2ZW50IHN0aWxsIG5lZWRzIHRoaXMgbXVjaCwgYmVjYXVzZSBhIGNvbW11bml0eSB2b3RlIGFza3MKcGFydGljaXBhbnRzIHRvIGp1ZGdlIHdvcmsgdGhleSBoYXZlIHRvIGJlIGFibGUgdG8gb3Blbi4AAAAADFBhcnRpY2lwYW50cwAAAAEAAACoT25seSB0aGUgb3JnYW5pemluZyB0ZWFtIGFuZCB0aGUganVkZ2VzIGNhbiBzZWUgdGhlIHByb2plY3RzLiBTdWl0YWJsZQpmb3IgYSBjb3Jwb3JhdGUgb3IgaW50ZXJuYWwgZXZlbnQsIGFuZCBpbmNvbXBhdGlibGUgd2l0aCBhIGNvbW11bml0eQp2b3RlIGZvciB0aGUgb2J2aW91cyByZWFzb24uAAAAClJlc3RyaWN0ZWQAAAAAAAI=",
        "AAAAAQAAABhIb3cgdGVhbXMgbWF5IGJlIGZvcm1lZC4AAAAAAAAAClRlYW1Qb2xpY3kAAAAAAAIAAAA4VGhlIG1vc3QgcGVvcGxlIG9uZSB0ZWFtIG1heSBob2xkLCBjb3VudGluZyB0aGUgY2FwdGFpbi4AAAAIbWF4X3NpemUAAAAEAAABZVdoZXRoZXIgb25lIHBlcnNvbiBtYXkgYmVsb25nIHRvIG1vcmUgdGhhbiBvbmUgdGVhbS4KCk9mZiBpbiBtb3N0IGV2ZW50cywgYmVjYXVzZSBhIGJ1aWxkZXIgc3BsaXR0aW5nIHRoZW1zZWx2ZXMgYWNyb3NzIGZvdXIKZW50cmllcyBpcyBjb21wZXRpbmcgYWdhaW5zdCB0aGVpciBvd24gdGVhbW1hdGVzLiBBbiBvcmdhbml6ZXIgcnVubmluZyBhCnNtYWxsIGV2ZW50IHdoZXJlIHRoZSBzYW1lIGhhbmRmdWwgb2YgcGVvcGxlIGNhcnJ5IHNldmVyYWwgaWRlYXMgY2FuCnR1cm4gaXQgb24sIGFuZCB0aGUgc2VsZiB2b3RlIGNoZWNrIGFjY291bnRzIGZvciBldmVyeSB0ZWFtIGEgdm90ZXIKYmVsb25ncyB0byBlaXRoZXIgd2F5LgAAAAAAABJtdWx0aV90ZWFtX2FsbG93ZWQAAAAAAAE=",
        "AAAAAQAAAD5Ib3cgdGhlIGZpbmFsIHNjb3JlIGlzIHNwbGl0IGJldHdlZW4gdGhlIGp1ZGdlcyBhbmQgdGhlIGNyb3dkLgAAAAAAAAAAAApWb3RlUG9saWN5AAAAAAACAAAAOlRoZSBjb21tdW5pdHkncyBzaGFyZSBvZiB0aGUgZmluYWwgc2NvcmUsIGluIGJhc2lzIHBvaW50cy4AAAAAAA1jb21tdW5pdHlfYnBzAAAAAAAABAAAADZUaGUganVkZ2VzJyBzaGFyZSBvZiB0aGUgZmluYWwgc2NvcmUsIGluIGJhc2lzIHBvaW50cy4AAAAAAAlqdWRnZV9icHMAAAAAAAAE",
        "AAAAAgAAAY5Ib3cganVkZ2VzIHNlYWwgdGhlaXIgc2NvcmVjYXJkcyB1bnRpbCB0aGUgcmV2ZWFsLgoKVGhlIGVhc3kgbW9kZSBjYXJyaWVzIHRoZSBhZGRyZXNzIHRoYXQgd2lsbCBzZWFsIHRoZW0sIGJlY2F1c2UgdGhhdCBhZGRyZXNzCmlzIHRoZSBvbmUgcGllY2Ugb2YgdHJ1c3QgdGhpcyBkZXNpZ24gZG9lcyBub3QgcmVtb3ZlIGFuZCBoaWRpbmcgaXQgd291bGQgYmUKZGlzaG9uZXN0LiBBIHBhcnRpY2lwYW50IHJlYWRpbmcgdGhlIHJ1bGVzIHNlZXMgZXhhY3RseSB3aG8gY29sbGVjdHMgdGhlCnNjb3JlY2FyZHMgYW5kIHB1Ymxpc2hlcyB0aGVpciByb290LCBhbmQga25vd3MgdGhhdCBpZiB0aGF0IHBhcnR5IGxlYXZlcyBvbmUKb3V0LCB0aGUganVkZ2UgaXQgYmVsb25nZWQgdG8gY2FuIHByb3ZlIGl0LgAAAAAAAAAAAAtKdWRnaW5nTW9kZQAAAAACAAAAAQAAAmpUaGUganVkZ2Ugc2lnbnMgYSBzY29yZWNhcmQgb2ZmIGNoYWluIGluIGEgc2luZ2xlIGFjdGlvbiwgcGF5aW5nIG5vIGZlZQphbmQgbmV2ZXIgaGF2aW5nIHRvIGNvbWUgYmFjay4gVGhlIGNvbGxlY3Rpb24gc2VydmljZSBwdWJsaXNoZXMgYSBNZXJrbGUKcm9vdCB3aGVuIHRoZSB3aW5kb3cgY2xvc2VzLCBhbmQgdGhlIGxlYXZlcyBhdCB0aGUgcmV2ZWFsLgoKVGhpcyBpcyB0aGUgZGVmYXVsdCBiZWNhdXNlIHRoZSBhbHRlcm5hdGl2ZSBsb3NlcyBzY29yZWNhcmRzLiBBIGp1ZGdlIHdobwptdXN0IHJldHVybiB0byByZXZlYWwgaXMgYSBqdWRnZSB3aG8gc29tZXRpbWVzIGRvZXMgbm90LCBhbmQgYSBtaXNzaW5nCnNjb3JlY2FyZCBicmVha3MgdGhlIHF1b3J1bSBmb3IgYSBwcm9qZWN0IHRoYXQgZGlkIG5vdGhpbmcgd3JvbmcuIFRoZQpjb3N0IGlzIHRoYXQgdGhlIGNvbGxlY3Rpb24gc2VydmljZSBjb3VsZCBpbiB0aGVvcnkgb21pdCBhIHNjb3JlY2FyZCwKd2hpY2ggaXMgd2h5IGV2ZXJ5IHN1Ym1pc3Npb24gcmV0dXJucyBhIHNpZ25lZCByZWNlaXB0IGFuZCBldmVyeSBqdWRnZQpnZXRzIGFuIGluY2x1c2lvbiBwcm9vZiB0aGUgbW9tZW50IHRoZSByb290IGlzIHB1Ymxpc2hlZC4AAAAAAARFYXN5AAAAAQAAABMAAAAAAAAA/FRoZSBqdWRnZSB3cml0ZXMgYSBjb21taXRtZW50IG9uIGNoYWluIHRoZW1zZWx2ZXMgYW5kIG9wZW5zIGl0CnRoZW1zZWx2ZXMuIFR3byB0cmFuc2FjdGlvbnMsIG5vIHRydXN0IGluIGFueSBzZXJ2aWNlLgoKRm9yIGV2ZW50cyB3aGVyZSB0aGUgcHJpemUgaXMgbGFyZ2UgZW5vdWdoLCBvciB0aGUgZGlzcHV0ZSByaXNrIGhpZ2gKZW5vdWdoLCB0aGF0IHRoZSBlYXN5IG1vZGUncyB0cnVzdCBhc3N1bXB0aW9uIGlzIG5vdCBhY2NlcHRhYmxlLgAAAAZTdHJpY3QAAA==",
        "AAAAAgAAAERPbmUgc3RlcCBpbiB0aGUgY2hhaW4gdGhhdCBzZXBhcmF0ZXMgdHdvIHByb2plY3RzIG9uIHRoZSBzYW1lIHNjb3JlLgAAAAAAAAAMVGllQnJlYWtSdWxlAAAABAAAAAAAAABaVGhlIGhpZ2hlciBqdWRnZSBzY29yZSB3aW5zLiBVc2VmdWwgd2hlbiB0aGUgY29tbXVuaXR5IHNoYXJlIGlzIHdoYXQKcHVsbGVkIHRoZSB0d28gbGV2ZWwuAAAAAAAKSnVkZ2VTY29yZQAAAAAAAQAAANBUaGUgaGlnaGVyIHNjb3JlIG9uIG9uZSBuYW1lZCBjcml0ZXJpb24gd2lucywgZm9yIGV4YW1wbGUgdGhlIHRlY2huaWNhbApvbmUuIFRoZSBjcml0ZXJpb24gaGFzIHRvIGV4aXN0IGluIGV2ZXJ5IHRyYWNrLCBzaW5jZSBhIHJ1bGUgdGhhdCBjYW5ub3QKYmUgYXBwbGllZCBpbiBzb21lIHRyYWNrIGxlYXZlcyB0aGF0IHRyYWNrIHdpdGhvdXQgYSB0aWUgYnJlYWsuAAAACUNyaXRlcmlvbgAAAAAAAAEAAAARAAAAAAAAACBUaGUgaGlnaGVyIGNvbW11bml0eSBzY29yZSB3aW5zLgAAAA5Db21tdW5pdHlTY29yZQAAAAAAAAAAAIlUaGUgcHJvamVjdCBzdWJtaXR0ZWQgZmlyc3Qgd2lucy4gVGhpcyBpcyB0aGUgb25seSBydWxlIGd1YXJhbnRlZWQgdG8Kc2VwYXJhdGUgYW55IHR3byBwcm9qZWN0cywgd2hpY2ggaXMgd2h5IGEgY2hhaW4gaGFzIHRvIGVuZCB3aXRoIGl0LgAAAAAAAA9TdWJtaXNzaW9uT3JkZXIA",
        "AAAAAQAAADdBIGNvbXBldGl0aW9uIHRyYWNrIHdpdGggaXRzIG93biBydWJyaWMgYW5kIHByaXplIGxpbmUuAAAAAAAAAAAFVHJhY2sAAAAAAAADAAAAOVRoZSBydWJyaWMsIHdob3NlIHdlaWdodHMgYWRkIHVwIHRvIFtgV0VJR0hUX1RPVEFMX0JQU2BdLgAAAAAAAAhjcml0ZXJpYQAAA+oAAAfQAAAACUNyaXRlcmlvbgAAAAAAACpTdGFibGUgaWRlbnRpZmllciwgZm9yIGV4YW1wbGUgYHBheW1lbnRzYC4AAAAAAAJpZAAAAAAAEQAAAJ5XaGV0aGVyIHRoZSBvcmdhbml6ZXIgZGVjbGFyZWQsIGJlZm9yZSB0aGUgbG9jaywgdGhhdCB0aGlzIHRyYWNrIG1heSBlbmQKd2l0aG91dCBhd2FyZGluZyBpdHMgcHJpemUuIEEgdHJhY2sgd2l0aG91dCB0aGlzIGZsYWcgY2FuIG5ldmVyIGJlIGxlZnQKdW5wYWlkIGxhdGVyLgAAAAAAEG5vX2F3YXJkX2FsbG93ZWQAAAAB",
        "AAAAAQAAAChPbmUgbGluZSBvZiB0aGUgcnVicmljIGEganVkZ2UgZmlsbHMgaW4uAAAAAAAAAAlDcml0ZXJpb24AAAAAAAACAAAAPFN0YWJsZSBpZGVudGlmaWVyLCBmb3IgZXhhbXBsZSBgdGVjaG5pY2FsYCBvciBgc3RlbGxhcl91c2VgLgAAAAJpZAAAAAAAEQAAACpTaGFyZSBvZiB0aGUgdHJhY2sgc2NvcmUsIGluIGJhc2lzIHBvaW50cy4AAAAAAAp3ZWlnaHRfYnBzAAAAAAAE",
        "AAAAAQAAAEVPbmUgcGF5YWJsZSBwb3NpdGlvbiwgZm9yIGV4YW1wbGUgc2Vjb25kIHBsYWNlIGluIHRoZSBwYXltZW50cyB0cmFjay4AAAAAAAAAAAAACVByaXplVGllcgAAAAAAAAMAAAAvQW1vdW50IGluIHRoZSBzbWFsbGVzdCB1bml0IG9mIHRoZSBwcml6ZSBhc3NldC4AAAAABmFtb3VudAAAAAAACwAAACBPbmUgYmFzZWQgcmFuayB3aXRoaW4gdGhlIHRyYWNrLgAAAARyYW5rAAAABAAAACNUaGUgdHJhY2sgdGhpcyBwb3NpdGlvbiBiZWxvbmdzIHRvLgAAAAAFdHJhY2sAAAAAAAAR",
        "AAAAAQAAAnpFdmVyeXRoaW5nIHRoYXQgZGVjaWRlcyB0aGUgb3V0Y29tZSBvZiBhIGhhY2thdGhvbi4KClRoaXMgaXMgc2lnbmVkIGFuZCBoYXNoZWQgYmVmb3JlIHJlZ2lzdHJhdGlvbiBvcGVucywgYW5kIGZyb20gdGhhdCBtb21lbnQKbm9uZSBvZiBpdCBjYW4gY2hhbmdlLiBBbnlvbmUgY2FuIHJlYnVpbGQgdGhlIHNhbWUgc3RydWN0dXJlIGZyb20gdGhlIHB1YmxpYwpwYWdlLCBoYXNoIGl0IHRoZW1zZWx2ZXMsIGFuZCBjb21wYXJlIGFnYWluc3QgdGhlIGhhc2ggc3RvcmVkIG9uIGNoYWluOyBpZgp0aGUgdHdvIGRpZmZlciwgdGhlIGNvbXBldGl0aW9uIGlzIG5vdCB0aGUgb25lIHRoYXQgd2FzIGFubm91bmNlZC4KCkV2ZXJ5dGhpbmcgdGhhdCBkb2VzIG5vdCBkZWNpZGUgYW4gb3V0Y29tZSwgbWVhbmluZyB0aGUgbmFtZSwgdGhlIGxvZ28sIHRoZQpsb25nIGRlc2NyaXB0aW9uIGFuZCB0aGUganVkZ2UgYmlvZ3JhcGhpZXMsIGlzIGRlbGliZXJhdGVseSBhYnNlbnQuIFRob3NlCmxpdmUgb2ZmIGNoYWluIHVuZGVyIFtgQ29uc3RpdHV0aW9uOjptZXRhZGF0YV9oYXNoYF0sIHNvIGVkaXRpbmcgYSB0eXBvIGluIGEKZGVzY3JpcHRpb24gbmV2ZXIgaGFzIHRvIGxvb2sgbGlrZSB0YW1wZXJpbmcgd2l0aCB0aGUgcnVsZXMuAAAAAAAAAAAADENvbnN0aXR1dGlvbgAAABAAAAAvRXZlcnkgcG93ZXIgdGhlIG9yZ2FuaXplciBrZWVwcyBhZnRlciB0aGUgbG9jay4AAAAACmRpc2NyZXRpb24AAAAAB9AAAAAQRGlzY3JldGlvblBvbGljeQAAACdIb3cgZmFyIHRob3NlIGRlYWRsaW5lcyBtYXkgbGF0ZXIgbW92ZS4AAAAACmV4dGVuc2lvbnMAAAAAB9AAAAAPRXh0ZW5zaW9uUG9saWN5AAAAAERWYWxpZCBzY29yZWNhcmRzIGEgcHJvamVjdCBuZWVkcyBiZWZvcmUgdGhlIHJlc3VsdCBjYW4gYmUgZmluYWxpemVkLgAAAAxqdWRnZV9xdW9ydW0AAAAEAAAALkF1dGhvcml6ZWQganVkZ2VzIGFuZCB0aGVpciB0cmFjayBhc3NpZ25tZW50cy4AAAAAAAZqdWRnZXMAAAAAA+oAAAfQAAAAD0p1ZGdlQXNzaWdubWVudAAAAAArSG93IHNjb3JlY2FyZHMgYXJlIHNlYWxlZCB1bnRpbCB0aGUgcmV2ZWFsLgAAAAAManVkZ2luZ19tb2RlAAAH0AAAAAtKdWRnaW5nTW9kZQAAAAA8SGFzaCBvZiB0aGUgZGV0ZXJtaW5pc3RpY2FsbHkgc2VyaWFsaXplZCBvZmYgY2hhaW4gbWV0YWRhdGEuAAAADW1ldGFkYXRhX2hhc2gAAAAAAAPuAAAAIAAAAC9UaGUgdG9rZW4gdGhlIHByaXplIGlzIGRlbm9taW5hdGVkIGFuZCBwYWlkIGluLgAAAAALcHJpemVfYXNzZXQAAAAAEwAAABxQYXlhYmxlIHBvc2l0aW9ucyBwZXIgdHJhY2suAAAAC3ByaXplX3RpZXJzAAAAA+oAAAfQAAAACVByaXplVGllcgAAAAAAABhUaGUgYW5ub3VuY2VkIGRlYWRsaW5lcy4AAAAIc2NoZWR1bGUAAAfQAAAACFNjaGVkdWxlAAAANFdoaWNoIGxpbmtzIGEgdGVhbSBoYXMgdG8gc3VwcGx5IHdpdGggdGhlaXIgcHJvamVjdC4AAAAXc3VibWlzc2lvbl9yZXF1aXJlbWVudHMAAAAH0AAAABZTdWJtaXNzaW9uUmVxdWlyZW1lbnRzAAAAAAAYSG93IHRlYW1zIG1heSBiZSBmb3JtZWQuAAAABXRlYW1zAAAAAAAH0AAAAApUZWFtUG9saWN5AAAAAAA4VGhlIGNoYWluIHRoYXQgc2VwYXJhdGVzIHR3byBwcm9qZWN0cyBvbiB0aGUgc2FtZSBzY29yZS4AAAAJdGllX2JyZWFrAAAAAAAD6gAAB9AAAAAMVGllQnJlYWtSdWxlAAAALUNvbXBldGl0aW9uIHRyYWNrcywgZWFjaCB3aXRoIGl0cyBvd24gcnVicmljLgAAAAAAAAZ0cmFja3MAAAAAA+oAAAfQAAAABVRyYWNrAAAAAAAALUZvcm1hdCB2ZXJzaW9uLCBzZWUgW2BDT05TVElUVVRJT05fVkVSU0lPTmBdLgAAAAAAAAd2ZXJzaW9uAAAAAAQAAAA5V2hvIG1heSByZWFkIHRoZSBzdWJtaXR0ZWQgcHJvamVjdHMgd2hpbGUgdGhlIGV2ZW50IHJ1bnMuAAAAAAAACnZpc2liaWxpdHkAAAAAB9AAAAARUHJvamVjdFZpc2liaWxpdHkAAAAAAAA6SG93IHRoZSBmaW5hbCBzY29yZSBpcyBzcGxpdCBiZXR3ZWVuIGp1ZGdlcyBhbmQgdGhlIGNyb3dkLgAAAAAABHZvdGUAAAfQAAAAClZvdGVQb2xpY3kAAA==",
        "AAAAAQAAADBBIGp1ZGdlIGFuZCB0aGUgdHJhY2tzIHRoZXkgYXJlIHJlc3BvbnNpYmxlIGZvci4AAAAAAAAAD0p1ZGdlQXNzaWdubWVudAAAAAACAAAAAAAAAAVqdWRnZQAAAAAAABMAAACASWRlbnRpZmllcnMgb2YgdGhlIHRyYWNrcyB0aGlzIGp1ZGdlIHNjb3Jlcy4gQSBqdWRnZSB3aXRoIG5vIHRyYWNrIGhhcwpubyByZWFzb24gdG8gYmUgYXV0aG9yaXplZCwgc28gYW4gZW1wdHkgbGlzdCBpcyByZWplY3RlZC4AAAAGdHJhY2tzAAAAAAPqAAAAEQ==",
        "AAAAAwAAAMJUaGUgZGVhZGxpbmVzIGFuIG9yZ2FuaXplciBpcyBhbGxvd2VkIHRvIG1vdmUuCgpUaGUgb3BlbmluZyB0aW1lc3RhbXBzIGFyZSBkZWxpYmVyYXRlbHkgYWJzZW50LiBNb3ZpbmcgYW4gb3BlbmluZyBtb21lbnQKYWZ0ZXIgdGhlIGZhY3QgY2hhbmdlcyB3aG8gY291bGQgdGFrZSBwYXJ0IHJhdGhlciB0aGFuIGhvdyBsb25nIHRoZXkgaGFkLgAAAAAAAAAAAAhEZWFkbGluZQAAAAUAAAAAAAAADFJlZ2lzdHJhdGlvbgAAAAAAAAAAAAAAClN1Ym1pc3Npb24AAAAAAAEAAAAAAAAACVNjcmVlbmluZwAAAAAAAAIAAAAAAAAAB0p1ZGdpbmcAAAAAAwAAAAAAAAANQ29tbXVuaXR5Vm90ZQAAAAAAAAQ=",
        "AAAAAQAAAXdUaGUgZGVhZGxpbmVzIG9mIGEgaGFja2F0aG9uLCBhcyBVVEMgbGVkZ2VyIHRpbWVzdGFtcHMgaW4gc2Vjb25kcy4KClRoZSBjb25zdGl0dXRpb24gbG9ja3MgdGhlIHNjaGVkdWxlIHRoYXQgd2FzIGFubm91bmNlZC4gRGVhZGxpbmVzIGNhbiBzdGlsbAptb3ZlLCBidXQgb25seSBmb3J3YXJkLCBvbmx5IGJlZm9yZSB0aGV5IHBhc3MsIGFuZCBvbmx5IHdpdGhpbiB0aGUgbGltaXRzIG9mCnRoZSBbYEV4dGVuc2lvblBvbGljeWBdIHRoYXQgd2FzIGRlY2xhcmVkIGFsb25nc2lkZSB0aGVtLCBzbyB0aGUgZWZmZWN0aXZlCnNjaGVkdWxlIGlzIGFsd2F5cyB0aGUgYW5ub3VuY2VkIG9uZSBwbHVzIGEgcHVibGljIGxpc3Qgb2YgcmVjb3JkZWQKZXh0ZW5zaW9ucy4AAAAAAAAAAAhTY2hlZHVsZQAAAAgAAABDVGhlIGNvbW11bml0eSB2b3RlIGNsb3Nlcy4gSWdub3JlZCB3aGVuIHRoZSBjb21tdW5pdHkgaGFzIG5vIHNoYXJlLgAAAAAYY29tbXVuaXR5X3ZvdGVfY2xvc2VzX2F0AAAABgAAAIhUaGUgY29tbXVuaXR5IHZvdGUgb3BlbnMsIHR5cGljYWxseSByaWdodCBhZnRlciB0aGUgcHJlc2VudGF0aW9ucyB3aGlsZQp0aGUganVkZ2VzIGFyZSBzY29yaW5nLiBJZ25vcmVkIHdoZW4gdGhlIGNvbW11bml0eSBoYXMgbm8gc2hhcmUuAAAAF2NvbW11bml0eV92b3RlX29wZW5zX2F0AAAAAAYAAABAU2NvcmVjYXJkcyBhbmQgYmFsbG90cyBhcmUgZHVlLCBhbmQgdGhlIHJldmVhbCBiZWNvbWVzIHBvc3NpYmxlLgAAABFqdWRnaW5nX2Nsb3Nlc19hdAAAAAAAAAYAAACIU2lnbiB1cCBjbG9zZXMuIFRoaXMgaXMgYWxzbyB0aGUgc25hcHNob3QgdGhhdCBmaXhlcyB3aG8gbWF5IHZvdGUsIHNvIGEKd2FsbGV0IGNyZWF0ZWQgYWZ0ZXIgdGhpcyBtb21lbnQgY2FuIG5ldmVyIGluZmx1ZW5jZSB0aGUgcmVzdWx0LgAAABZyZWdpc3RyYXRpb25fY2xvc2VzX2F0AAAAAAAGAAAAH1NpZ24gdXAgb3BlbnMgZm9yIHBhcnRpY2lwYW50cy4AAAAAFXJlZ2lzdHJhdGlvbl9vcGVuc19hdAAAAAAAAAYAAAAvVGhlIG9yZ2FuaXplciBoYXMgZmluaXNoZWQgdGhlIHNjcmVlbmluZyByb3VuZC4AAAAAE3NjcmVlbmluZ19jbG9zZXNfYXQAAAAABgAAADpQcm9qZWN0cyBhcmUgcGlubmVkIGFuZCBubyBmdXJ0aGVyIHN1Ym1pc3Npb24gaXMgYWNjZXB0ZWQuAAAAAAAUc3VibWlzc2lvbl9jbG9zZXNfYXQAAAAGAAAAJVRlYW1zIG1heSBzdGFydCBmaWxpbmcgdGhlaXIgcHJvamVjdC4AAAAAAAATc3VibWlzc2lvbl9vcGVuc19hdAAAAAAG",
        "AAAAAQAAAQFIb3cgbXVjaCByb29tIHRoZSBvcmdhbml6ZXIgYW5ub3VuY2VkIGZvciBtb3ZpbmcgZGVhZGxpbmVzLgoKRGVjbGFyaW5nIHRoaXMgYmVmb3JlIHRoZSBsb2NrIGlzIHRoZSB3aG9sZSBwb2ludDogcGFydGljaXBhbnRzIGtub3cgdXAKZnJvbnQgdGhhdCBzdWJtaXNzaW9uIGNhbiBzbGlwIGJ5IGF0IG1vc3Qgc28gbXVjaCwgc28gYW4gZXh0ZW5zaW9uIGlzIGEKdXNlIG9mIGEgcHVibGlzaGVkIGFsbG93YW5jZSByYXRoZXIgdGhhbiBhIHN1cnByaXNlLgAAAAAAAAAAAAAPRXh0ZW5zaW9uUG9saWN5AAAAAAIAAABaSG93IG1hbnkgdGltZXMgYSBzaW5nbGUgZGVhZGxpbmUgbWF5IGJlIG1vdmVkLiBaZXJvIG1lYW5zIHRoZSBhbm5vdW5jZWQKc2NoZWR1bGUgaXMgZmluYWwuAAAAAAAbbWF4X2V4dGVuc2lvbnNfcGVyX2RlYWRsaW5lAAAAAAQAAABUVGhlIHRvdGFsIG51bWJlciBvZiBzZWNvbmRzIGEgc2luZ2xlIGRlYWRsaW5lIG1heSBnYWluIGFjcm9zcyBhbGwgb2YKaXRzIGV4dGVuc2lvbnMuAAAAHm1heF90b3RhbF9zZWNvbmRzX3Blcl9kZWFkbGluZQAAAAAABg==",
        "AAAAAwAAAvhUaGUgc3RhZ2VzIGEgaGFja2F0aG9uIHdhbGtzIHRocm91Z2gsIGluIG9yZGVyLgoKQSBoYWNrYXRob24gb25seSBldmVyIG1vdmVzIGZvcndhcmQgYW5kIGV2ZXJ5IHN0YWdlIGhhcyBleGFjdGx5IG9uZSBsZWdhbApzdWNjZXNzb3IsIHNvIGEgY2FsbGVyIGNhbiBuZXZlciBza2lwIGEgZ2F0ZSBieSBwaWNraW5nIGEgdGFyZ2V0IHN0YXRlCml0c2VsZi4KCkEgc3RhZ2UgaXMgbm90IHRoZSBzYW1lIHRoaW5nIGFzIGEgd2luZG93LiBUd28gc3RhZ2VzIGNhcnJ5IHR3byB3aW5kb3dzCmVhY2gsIGJlY2F1c2UgdGhlIHVuZGVybHlpbmcgYWN0aXZpdGllcyBnZW51aW5lbHkgb3ZlcmxhcCBhbmQgcHJldGVuZGluZwpvdGhlcndpc2Ugd291bGQgZm9yY2UgYSBzY2hlZHVsZSBub2JvZHkgcnVucy4gW2BQaGFzZTo6T3BlbmBdIGhvbGRzIHRoZQpyZWdpc3RyYXRpb24gd2luZG93IGFuZCB0aGUgc3VibWlzc2lvbiB3aW5kb3csIHNpbmNlIHBlb3BsZSBzaWduIHVwIGFuZApzdGFydCBidWlsZGluZyBvbiB0aGUgc2FtZSBldmVuaW5nLiBbYFBoYXNlOjpKdWRnaW5nYF0gaG9sZHMgdGhlIHNjb3JpbmcKd2luZG93IGFuZCB0aGUgY29tbXVuaXR5IHZvdGUgd2luZG93LCBib3RoIHNlYWxlZCwgc28gdGhlIGNyb3dkIG5ldmVyIHZvdGVzCndpdGggdGhlIGp1ZGdlIHRhYmxlIGFscmVhZHkgaW4gZnJvbnQgb2YgaXQuIEVhY2ggd2luZG93IGlzIGdhdGVkIGJ5IGl0cyBvd24KdGltZXN0YW1wcyByYXRoZXIgdGhhbiBieSB0aGUgc3RhZ2UgYWxvbmUuAAAAAAAAAAVQaGFzZQAAAAAAAAoAAAA/Q29uZmlndXJhdGlvbiBpcyBzdGlsbCBiZWluZyBlZGl0ZWQgYW5kIG5vdGhpbmcgaXMgYmluZGluZyB5ZXQuAAAAAAVEcmFmdAAAAAAAAAAAAABAVGhlIHByaXplIGlzIGJlaW5nIGRlcG9zaXRlZCBhbmQgZnVsbCBmdW5kaW5nIGlzIGJlaW5nIHZlcmlmaWVkLgAAAAdGdW5kaW5nAAAAAAEAAABGVGhlIGV2ZW50IGlzIHJ1bm5pbmc6IHBhcnRpY2lwYW50cyBhcHBseSwgdGVhbXMgZm9ybSwgcHJvamVjdHMgYXJyaXZlLgAAAAAABE9wZW4AAAACAAAAf1RoZSBvcmdhbml6ZXIgd29ya3MgdGhyb3VnaCB0aGUgc2NyZWVuaW5nIHJvdW5kIGZvciBzcGFtIGFuZCBydWxlCmJyZWFjaGVzLCBiZWZvcmUgYW55IHNjb3JlY2FyZCBleGlzdHMgdG8gYmUgaW5mbHVlbmNlZCBieSBpdC4AAAAACVNjcmVlbmluZwAAAAAAAAMAAABkSnVkZ2VzIHNjb3JlIHRoZWlyIGFzc2lnbmVkIHByb2plY3RzIGFuZCBlbGlnaWJsZSB3YWxsZXRzIGNhc3QgdGhlaXIKY29tbXVuaXR5IGJhbGxvdHMsIGJvdGggc2VhbGVkLgAAAAdKdWRnaW5nAAAAAAQAAAA2RXZlcnkgc2NvcmVjYXJkIGFuZCBldmVyeSBiYWxsb3QgaXMgcHVibGlzaGVkIGF0IG9uY2UuAAAAAAAGUmV2ZWFsAAAAAAAFAAAAOlRoZSBjb250cmFjdCBjb21wdXRlcyB0aGUgcmFua2luZyBmcm9tIHRoZSBsb2NrZWQgZm9ybXVsYS4AAAAAAAxGaW5hbGl6YXRpb24AAAAGAAAAG1RoZSB2YXVsdCBwYXlzIHRoZSB3aW5uZXJzLgAAAAAKU2V0dGxlbWVudAAAAAAABwAAADNUaGUgcHJvb2YgcGFnZSBpcyBwZXJtYW5lbnQgYW5kIG5vdGhpbmcgY2FuIGNoYW5nZS4AAAAACUNvbXBsZXRlZAAAAAAAAAgAAABDRW5kZWQgZWFybHkgdW5kZXIgdGhlIGNhbmNlbGxhdGlvbiBwb2xpY3kgZGVjbGFyZWQgYmVmb3JlIHRoZSBsb2NrLgAAAAAJQ2FuY2VsbGVkAAAAAAAACQ==",
        "AAAAAQAAADtIb3cgbXVjaCBvZiBpdHMgZXh0ZW5zaW9uIGFsbG93YW5jZSBvbmUgZGVhZGxpbmUgaGFzIHNwZW50LgAAAAAAAAAADkV4dGVuc2lvblVzYWdlAAAAAAACAAAAKFRvdGFsIHNlY29uZHMgZ2FpbmVkIGFjcm9zcyB0aG9zZSBtb3Zlcy4AAAANc2Vjb25kc19hZGRlZAAAAAAAAAYAAAAsSG93IG1hbnkgdGltZXMgdGhpcyBkZWFkbGluZSBoYXMgYmVlbiBtb3ZlZC4AAAAFdGltZXMAAAAAAAAE",
        "AAAAAQAAAgtFdmVyeXRoaW5nIGFib3V0IGEgaGFja2F0aG9uIHRoYXQgY2hhbmdlcyB3aGlsZSBpdCBydW5zLgoKVGhpcyBzaXRzIGJlc2lkZSB0aGUgY29uc3RpdHV0aW9uIHJhdGhlciB0aGFuIGluc2lkZSBpdC4gVGhlIGNvbnN0aXR1dGlvbiBpcwpoYXNoZWQgYW5kIGZyb3plbjsgaWYgdGhlIHNjaGVkdWxlIGluIGZvcmNlIGxpdmVkIHRoZXJlLCBtb3ZpbmcgYSBkZWFkbGluZQpieSBhbiBob3VyIGFmdGVyIGFuIG91dGFnZSB3b3VsZCBicmVhayB0aGUgZGlnZXN0IGFuZCBtYWtlIGEgbGVnaXRpbWF0ZSwKYW5ub3VuY2VkLCBqdWRnZSBhcHByb3ZlZCBleHRlbnNpb24gbG9vayBpZGVudGljYWwgdG8gdGFtcGVyaW5nLiBTbyB0aGUKYW5ub3VuY2VkIHNjaGVkdWxlIHN0YXlzIGxvY2tlZCBpbiB0aGUgY29uc3RpdHV0aW9uLCB0aGUgc2NoZWR1bGUgYWN0dWFsbHkKaW4gZm9yY2UgbGl2ZXMgaGVyZSwgYW5kIHRoZSBkaWZmZXJlbmNlIGJldHdlZW4gdGhlbSBpcyBhIHB1YmxpYyBsaXN0IG9mCnJlY29yZGVkIGV4dGVuc2lvbnMuAAAAAAAAAAAOSGFja2F0aG9uU3RhdGUAAAAAAAUAAABXV2hlbiB0aGUgcmFua2luZyBjbG9zZWQsIHdoaWNoIGlzIHdoZXJlIHRoZSBzYWZldHkgd2luZG93IGNvdW50cyBmcm9tLgpaZXJvIHVudGlsIHRoZW4uAAAAAAxmaW5hbGl6ZWRfYXQAAAAGAAAAKFdoZXJlIHRoZSBoYWNrYXRob24gaXMgaW4gaXRzIGxpZmVjeWNsZS4AAAAFcGhhc2UAAAAAAAfQAAAABVBoYXNlAAAAAAAAUlRoZSBkZWFkbGluZXMgYWN0dWFsbHkgaW4gZm9yY2U6IHRoZSBhbm5vdW5jZWQgb25lcyBwbHVzIGV2ZXJ5IHJlY29yZGVkCmV4dGVuc2lvbi4AAAAAAAhzY2hlZHVsZQAAB9AAAAAIU2NoZWR1bGUAAADzV2hlbiB0aGUgbW9uZXkgYWN0dWFsbHkgYmVjYW1lIHBheWFibGUsIHdoaWNoIGlzIHdoZXJlIHRoZSBjbGFpbSBwZXJpb2QKY291bnRzIGZyb20uIEtlcHQgYXBhcnQgZnJvbSBgZmluYWxpemVkX2F0YCBiZWNhdXNlIGEgc2V0dGxlbWVudCBub2JvZHkKb3BlbmVkIGZvciBhIG1vbnRoIHdvdWxkIG90aGVyd2lzZSBidXJuIHRoZSBjbGFpbSBwZXJpb2QgYmVmb3JlIGFueQp3aW5uZXIgY291bGQgcmVhY2ggdGhlaXIgcHJpemUuAAAAABRzZXR0bGVtZW50X29wZW5lZF9hdAAAAAYAAACFV2hldGhlciBzZXR0bGVtZW50IGlzIGJlaW5nIGhlbGQgYnkgdGhlIHByZSBkZWNsYXJlZCBhdXRob3JpdHkuIFNjb3JlcwphcmUgdW50b3VjaGFibGUgZWl0aGVyIHdheTsgdGhpcyBvbmx5IHN0b3BzIG1vbmV5IGZyb20gbW92aW5nLgAAAAAAABFzZXR0bGVtZW50X3BhdXNlZAAAAAAAAAE=",
        "AAAAAQAAAXpBIG1vdmUgdG8gZW5kIHRoZSBoYWNrYXRob24gZWFybHksIGFuZCBob3cgZmFyIGFsb25nIGl0IGlzLgoKQ2FuY2VsbGF0aW9uIGlzIHRoZSBvbmx5IHBvd2VyIHRoYXQgcmVhY2hlcyBldmVyeWJvZHkgYXQgb25jZSwgc28gaXQgY2Fycmllcwp0aGUgc2FtZSBzaGFwZSBhcyB0aGUgb3RoZXJzIHJhdGhlciB0aGFuIGEgc2hvcnRjdXQ6IGl0IGlzIG9wZW5lZCB3aXRoIGEKcmVhc29uLCBpdCBpcyBzaWduZWQgYnkganVkZ2VzIGFnYWluc3QgYSB0aHJlc2hvbGQgYW5ub3VuY2VkIGJlZm9yZSB0aGUgbG9jaywKYW5kIG9ubHkgdGhlbiBkb2VzIGl0IHRha2UgZWZmZWN0IGFuZCBzZW5kIHRoZSBwb29sIGJhY2sgYWxvbmcgdGhlIHJvdXRlIHRoZQpydWxlcyBuYW1lZC4AAAAAAAAAAAAQQ2FuY2VsbGF0aW9uQ2FzZQAAAAMAAAAcSG93IG1hbnkganVkZ2VzIGhhdmUgc2lnbmVkLgAAAAlhcHByb3ZhbHMAAAAAAAAEAAAAHVdoZW4gdGhlIG9yZ2FuaXplciBvcGVuZWQgaXQuAAAAAAAACW9wZW5lZF9hdAAAAAAAAAYAAAAdRGlnZXN0IG9mIHRoZSB3cml0dGVuIHJlYXNvbi4AAAAAAAAGcmVhc29uAAAAAAPuAAAAIA==",
        "AAAABAAABABFdmVyeSByZWplY3Rpb24gdGhlIGNvcmUgY29udHJhY3QgY2FuIHByb2R1Y2UuCgojIFdoeSB0aGVyZSBhcmUgb25seSBzbyBtYW55CgpUaGUgY29udHJhY3Qgc3BlYyBjYXBzIGFuIGVycm9yIGVudW0gYXQgZmlmdHkgY2FzZXMsIGFuZCB0aGF0IGNhcCBpcwpub3JtYXRpdmU6IGl0IGxpdmVzIGluIGBTdGVsbGFyLWNvbnRyYWN0LXNwZWMueGAgYXMgYGNhc2VzPDUwPmAuIEFuIGVudW0KcGFzdCBpdCBzdGlsbCBjb21waWxlcyBhbmQgc3RpbGwgZGVwbG95cywgYmVjYXVzZSB0aGUgUnVzdCByZWFkZXIgaXMKbGVuaWVudCwgYnV0IHRoZSBwdWJsaXNoZWQgaW50ZXJmYWNlIGl0IHByb2R1Y2VzIGNhbm5vdCBiZSBwYXJzZWQgYnkgYQpzdHJpY3QgWERSIHJlYWRlci4gVGhlIG9mZmljaWFsIEphdmFTY3JpcHQgU0RLIGlzIG9uZSwgc28gYSBjb250cmFjdCBvdmVyCnRoZSBsaW1pdCBjYW5ub3QgYmUgY2FsbGVkIGZyb20gYSBicm93c2VyIGF0IGFsbCwgYW5kIG5vIHdhbGxldCBvciBleHBsb3JlcgpjYW4gcmVhZCBpdHMgaW50ZXJmYWNlIGVpdGhlci4KClNvIHRoZSBidWRnZXQgaXMgcmVhbCwgYW5kIGl0IGlzIHNwZW50IHdoZXJlIGl0IGJ1eXMgc29tZXRoaW5nLiBBIGNhbGxlcgpoaXR0aW5nIG9uZSBvZiB0aGVzZSBhbHJlYWR5IGtub3dzIHdoaWNoIGVudHJ5IHBvaW50IHRoZXkgY2FsbGVkIGFuZCB3aGF0CnRoZXkgcGFzc2VkIGl0OyB0aGUgY29kZSBvbmx5IGhhcyB0byBzYXkgd2hhdCB3ZW50IHdyb25nIHRoYXQgdGhlIGNhbGxlcgpjb3VsZCBub3QgaGF2ZSBrbm93bi4gVGhhdCBwcmluY2lwbGUgc29ydHMgdGhlIHR3byBraW5kcyBvZiBmYWlsdXJlOgoKKipSdWxlcyB0aGF0IHdlcmUgc3VibWl0dGVkIGFuZCByZWZ1c2VkKiogY29sbGFwc2UgaW50bwpbYEVycm9yOjpDb25zdGl0dXRpb25JbnZhbGlkYF0uIFRoZSBvcmdhbml6ZXIgaXMgaG9sZGluZyB0aGUgZG9jdW1lbnQgdGhhdAp3YXMgcmVqZWN0ZWQsIHRoZSBTREsgdmFsaWRhdGVzIGl0IGZpZWxkIGJ5IGZpZWxkIGJlZm9yZSBpdCBpAAAAAAAAAAVFcnJvcgAAAAAAADAAAAAAAAAADk5vdEluaXRpYWxpemVkAAAAAAABAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAAIAAACrVGhlIGNhbGxlciBpcyBub3QgdGhlIG9yZ2FuaXplciwgYW5kIG5vdCBhIGNvbGxhYm9yYXRvciB3aGVyZSBvbmUgd291bGQKaGF2ZSBkb25lLiBXaGljaCBvZiB0aGUgdHdvIHdhcyBuZWVkZWQgaXMgYSBwcm9wZXJ0eSBvZiB0aGUgZW50cnkgcG9pbnQKcmF0aGVyIHRoYW4gb2YgdGhlIGZhaWx1cmUuAAAAAA1Ob3RBdXRob3JpemVkAAAAAAAAAwAAAAAAAAAITm90SnVkZ2UAAAAEAAAAAAAAAA1Ob3RUZWFtTWVtYmVyAAAAAAAABQAAAH1BIGNvbGxhYm9yYXRvciBjaGFuZ2UgdGhhdCBjYW5ub3Qgc3RhbmQ6IGFscmVhZHkgb24gdGhlIGxpc3QsIG5vdCBvbiBpdCwKb3IgdGhlIG9yZ2FuaXplciB0cnlpbmcgdG8gYWxzbyBiZSB0aGVpciBvd24gaGVscGVyLgAAAAAAABNDb2xsYWJvcmF0b3JJbnZhbGlkAAAAAAYAAAAAAAAADVZhdWx0Tm90Qm91bmQAAAAAAAAHAAAAAAAAABFWYXVsdEFscmVhZHlCb3VuZAAAAAAAAAgAAABlVGhlIHZhdWx0IG5hbWVkIHNlcnZlcyBhIGRpZmZlcmVudCBoYWNrYXRob24sIG9yIGhvbGRzIGEgZGlmZmVyZW50IGFzc2V0CmZyb20gdGhlIG9uZSB0aGUgcnVsZXMgbmFtZS4AAAAAAAANVmF1bHRSZWplY3RlZAAAAAAAAAkAAACDVGhlIGNvbnN0aXR1dGlvbiBkb2VzIG5vdCBob2xkIHRvZ2V0aGVyLiBFdmVyeSB2YWxpZGF0aW9uIGZhaWx1cmUKYXJyaXZlcyBoZXJlLCBhbmQgdGhlIFNESyBpcyB3aGF0IHRlbGxzIGFuIG9yZ2FuaXplciB3aGljaCBmaWVsZC4AAAAAE0NvbnN0aXR1dGlvbkludmFsaWQAAAAAFAAAAItUaGUgaGFja2F0aG9uIGlzIG5vdCBpbiBhIHBoYXNlIHdoZXJlIHRoaXMgY2FsbCBtZWFucyBhbnl0aGluZy4gQWxzbwpjb3ZlcnMgYSBwaGFzZSB0aGF0IGVuZHMgb24gYW4gYWN0aW9uIGJlaW5nIGFza2VkIHRvIGVuZCBvbiB0aGUgY2xvY2suAAAAAApXcm9uZ1BoYXNlAAAAAAAeAAAAAAAAABJSdWxlc0FscmVhZHlMb2NrZWQAAAAAAB8AAAAAAAAAEkRlYWRsaW5lTm90UmVhY2hlZAAAAAAAIAAAAAAAAAAORGVhZGxpbmVQYXNzZWQAAAAAACEAAABuVGhlIHNjaGVkdWxlIHRoYXQgd291bGQgcmVzdWx0IGRvZXMgbm90IHJ1biBpbiBvcmRlciwgd2hpY2ggaW5jbHVkZXMgYQpkZWFkbGluZSBiZWluZyBhc2tlZCB0byBtb3ZlIGJhY2t3YXJkcy4AAAAAAA9TY2hlZHVsZUludmFsaWQAAAAAIgAAAAAAAAAVRXh0ZW5zaW9uTGltaXRSZWFjaGVkAAAAAAAAIwAAAIdUaGUgcmVjb3JkIG5hbWVkIGRvZXMgbm90IGV4aXN0OiBubyBzdWNoIGFwcGxpY2F0aW9uLCB0ZWFtLCBzdWJtaXNzaW9uLAp0cmFjaywgc2NvcmVjYXJkIG9yIHByaXplIHBvc2l0aW9uLiBUaGUgZW50cnkgcG9pbnQgc2F5cyB3aGljaC4AAAAACE5vdEZvdW5kAAAAKAAAAFZUaGUgYXBwbGljYXRpb24gaXMgbm90IGluIHRoZSBzdGF0ZSB0aGUgY2FsbCBuZWVkczogYWxyZWFkeSBmaWxlZCwgb3IKYWxyZWFkeSBkZWNpZGVkLgAAAAAAFUFwcGxpY2F0aW9uTm90UGVuZGluZwAAAAAAACkAAAAAAAAAC05vdEFwcHJvdmVkAAAAACoAAACEVGhpcyBwZXJzb24gY2Fubm90IGpvaW4gdGhpcyB0ZWFtOiBpdCBpcyBmdWxsLCB0aGV5IGFyZSBhbHJlYWR5IG9uIGl0LApvciB0aGV5IGFyZSBhbHJlYWR5IG9uIGFub3RoZXIgYW5kIHRoZSBydWxlcyBmb3JiaWQgYSBzZWNvbmQuAAAAEFRlYW1Kb2luUmVqZWN0ZWQAAAArAAAATVRoZSBlbnRyeSBpcyBvdXQgb2YgdGhlIHJ1bm5pbmcsIHdoZXRoZXIgaXQgd2FzIHNjcmVlbmVkIG91dCBvcgpkaXNxdWFsaWZpZWQuAAAAAAAAFVN1Ym1pc3Npb25Ob3RFbGlnaWJsZQAAAAAAACwAAABxVGhlIHNjb3JlY2FyZCBkb2VzIG5vdCBmaXQgdGhlIHJ1YnJpYzogYSBtaXNzaW5nIGNyaXRlcmlvbiwgYW4gdW5rbm93bgpvbmUsIG9yIGEgc2NvcmUgb3V0c2lkZSB0aGUgYWxsb3dlZCByYW5nZS4AAAAAAAAQU2NvcmVjYXJkSW52YWxpZAAAADIAAAAAAAAAGFNjb3JlY2FyZEFscmVhZHlSZWNvcmRlZAAAADMAAABYVGhpcyBqdWRnZSBzdGVwcGVkIGF3YXkgZnJvbSB0aGlzIHByb2plY3QsIG9yIGlzIGJlaW5nIGFza2VkIHRvIHN0ZXAKYXdheSBmcm9tIGl0IHR3aWNlLgAAAAxKdWRnZVJlY3VzZWQAAAA0AAAAAAAAABBXcm9uZ0p1ZGdpbmdNb2RlAAAANQAAAGRUaGUgc2VhbGluZyBkaWdlc3QgaXMgYWxyZWFkeSBwdWJsaXNoZWQgYW5kIGNhbm5vdCBiZSByZXBsYWNlZC4gQ292ZXJzCnNjb3JlY2FyZHMgYW5kIGJhbGxvdHMgYWxpa2UuAAAAFFJvb3RBbHJlYWR5UHVibGlzaGVkAAAANgAAAAAAAAALUm9vdE1pc3NpbmcAAAAANwAAAAAAAAAVUHJvb2ZEb2VzTm90TWF0Y2hSb290AAAAAAAAOAAAAAAAAAAQVm90ZXJOb3RFbGlnaWJsZQAAADwAAAAAAAAAEFNlbGZWb3RlUmVqZWN0ZWQAAAA9AAAAAAAAABVDb21tdW5pdHlWb3RlRGlzYWJsZWQAAAAAAAA+AAAAAAAAABRCYWxsb3RBbHJlYWR5Q291bnRlZAAAAD8AAAA8QSBjYXNlIG9mIHRoaXMga2luZCBpcyBhbHJlYWR5IHJ1bm5pbmcgYWdhaW5zdCB0aGlzIHN1YmplY3QuAAAAD0Nhc2VBbHJlYWR5T3BlbgAAAABGAAAAQU5vIGNhc2UgaXMgcnVubmluZywgb3IgdGhlIG9uZSB0aGF0IHdhcyBoYXMgYWxyZWFkeSBiZWVuIHNldHRsZWQuAAAAAAAAC0Nhc2VOb3RPcGVuAAAAAEcAAAAAAAAADUFscmVhZHlTaWduZWQAAAAAAABIAAAAAAAAABxKdWRnZUFwcHJvdmFsVGhyZXNob2xkTm90TWV0AAAASQAAAAAAAAAQQXBwZWFsV2luZG93T3BlbgAAAEoAAAAAAAAAEkFwcGVhbFdpbmRvd0Nsb3NlZAAAAAAASwAAADlUaGUgcmFua2luZyBjYW5ub3QgY2xvc2Ugd2hpbGUgYSBjYXNlIGlzIHN0aWxsIHVuZGVjaWRlZC4AAAAAAAAaRGlzcXVhbGlmaWNhdGlvblVucmVzb2x2ZWQAAAAAAEwAAAAAAAAAFE5vQXdhcmROb3REZWNsYXJhYmxlAAAATQAAAAAAAAATUmVzdWx0c05vdEZpbmFsaXplZAAAAABQAAAAAAAAABBTYWZldHlXaW5kb3dPcGVuAAAAUQAAAAAAAAAQU2V0dGxlbWVudFBhdXNlZAAAAFIAAAAAAAAAE1NldHRsZW1lbnROb3RQYXVzZWQAAAAAUwAAAAAAAAAUU2V0dGxlbWVudEluY29tcGxldGUAAABUAAAAAAAAABBQcml6ZUFscmVhZHlQYWlkAAAAVQAAAAAAAAAPQ2xhaW1QZXJpb2RPcGVuAAAAAFYAAAAAAAAAEFZhdWx0VW5kZXJmdW5kZWQAAABX",
        "AAAABQAAABtTb21lb25lIGFza2VkIHRvIHRha2UgcGFydC4AAAAAAAAAAAdBcHBsaWVkAAAAAAEAAAAHYXBwbGllZAAAAAABAAAAAAAAAAlhcHBsaWNhbnQAAAAAAAATAAAAAQAAAAI=",
        "AAAABQAAADFBIGhhY2thdGhvbiBleGlzdHMgYW5kIGlzIG9wZW4gZm9yIGNvbmZpZ3VyYXRpb24uAAAAAAAAAAAAAAdDcmVhdGVkAAAAAAEAAAAHY3JlYXRlZAAAAAABAAAAAAAAAAlvcmdhbml6ZXIAAAAAAAATAAAAAQAAAAI=",
        "AAAABQAAABlBIHByaXplIHJlYWNoZWQgYSB3aW5uZXIuAAAAAAAAAAAAAAlQcml6ZVBhaWQAAAAAAAABAAAACnByaXplX3BhaWQAAAAAAAUAAAAAAAAAAnRvAAAAAAATAAAAAQAAAAAAAAAFdHJhY2sAAAAAAAARAAAAAAAAAAAAAAAEcmFuawAAAAQAAAAAAAAAAAAAAAR0ZWFtAAAABAAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAQRUaGUgcHJpemUgaXMgZnVsbHkgZnVuZGVkIGFuZCB0aGUgZXZlbnQgaXMgb3Blbi4KClRoaXMgaXMgdGhlIG1vbWVudCB0aGUgc3RhdHVzIHN0cmlwIGEgcGFydGljaXBhbnQgcmVhZHMgdHVybnMgZ3JlZW4sIHNvIHRoZQpmdW5kZWQgYW1vdW50IHRyYXZlbHMgYWxvbmcgYW5kIG5vYm9keSBoYXMgdG8gY3Jvc3MgcmVmZXJlbmNlIHR3byBjb250cmFjdHMKdG8ga25vdyB0aGUgcHJpemUgd2FzIHJlYWwgYmVmb3JlIGFueW9uZSBzdGFydGVkIGJ1aWxkaW5nLgAAAAAAAAAJUHVibGlzaGVkAAAAAAAAAQAAAAlwdWJsaXNoZWQAAAAAAAACAAAAAAAAAAZmdW5kZWQAAAAAAAsAAAAAAAAAAAAAAAhyZXF1aXJlZAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAB5UaGUgZHJhZnQgcnVsZXMgd2VyZSByZXBsYWNlZC4AAAAAAAAAAAAKQ29uZmlndXJlZAAAAAAAAQAAAApjb25maWd1cmVkAAAAAAABAAAAAAAAAAlvcmdhbml6ZXIAAAAAAAATAAAAAQAAAAI=",
        "AAAABQAAADtBIHByaXplIG5vYm9keSBjbGFpbWVkIHdlbnQgYmFjayBhbG9uZyB0aGUgYW5ub3VuY2VkIHJvdXRlLgAAAAAAAAAAClByaXplU3dlcHQAAAAAAAEAAAALcHJpemVfc3dlcHQAAAAAAwAAAAAAAAAFdHJhY2sAAAAAAAARAAAAAQAAAAAAAAAEcmFuawAAAAQAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAATJPbmUgbWVtYmVyJ3Mgc2hhcmUgd2VudCBiYWNrIGFsb25nIHRoZSBhbm5vdW5jZWQgcm91dGUuCgpLZXB0IGFwYXJ0IGZyb20gYFByaXplU3dlcHRgLCB3aGljaCByZXR1cm5zIGEgcG9zaXRpb24gbm9ib2R5IHdvbiBhdCBhbGwuClRoZSB0d28gbG9vayB0aGUgc2FtZSBpbiB0aGUgdmF1bHQgYW5kIG1lYW4gdmVyeSBkaWZmZXJlbnQgdGhpbmdzIG9uIHRoZQpwYWdlOiBvbmUgc2F5cyBhIHByaXplIGZvdW5kIG5vIHdpbm5lciwgdGhlIG90aGVyIHNheXMgYSBuYW1lZCB3aW5uZXIgbmV2ZXIKY2FtZSBmb3IgdGhlaXIgcGFydCBvZiBpdC4AAAAAAAAAAAAKU2hhcmVTd2VwdAAAAAAAAQAAAAtzaGFyZV9zd2VwdAAAAAAEAAAAAAAAAAV0cmFjawAAAAAAABEAAAABAAAAAAAAAARyYW5rAAAABAAAAAAAAAAAAAAABm1lbWJlcgAAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAACpUaGUgaGFja2F0aG9uIGtub3dzIHdoZXJlIGl0cyBwcml6ZSBsaXZlcy4AAAAAAAAAAAAKVmF1bHRCb3VuZAAAAAAAAQAAAAt2YXVsdF9ib3VuZAAAAAABAAAAAAAAAAV2YXVsdAAAAAAAABMAAAABAAAAAg==",
        "AAAABQAAANVUaGUgcnVsZXMgc3RvcHBlZCBiZWluZyBlZGl0YWJsZS4KClRoZSBkaWdlc3QgdHJhdmVscyBhbG9uZyBiZWNhdXNlIHRoaXMgaXMgdGhlIHZhbHVlIGV2ZXJ5IGxhdGVyIHJlYWRlcgpjb21wYXJlcyBhZ2FpbnN0LCBhbmQgYW4gaW5kZXhlciBob2xkaW5nIHRoaXMgZXZlbnQgbmV2ZXIgaGFzIHRvIGNhbGwgdGhlCmNvbnRyYWN0IHRvIGxlYXJuIHdoYXQgd2FzIGxvY2tlZC4AAAAAAAAAAAAAC1J1bGVzTG9ja2VkAAAAAAEAAAAMcnVsZXNfbG9ja2VkAAAAAQAAAAAAAAARY29uc3RpdHV0aW9uX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAC",
        "AAAABQAAABNBIHRlYW0gd2FzIGZvdW5kZWQuAAAAAAAAAAALVGVhbUZvdW5kZWQAAAAAAQAAAAx0ZWFtX2ZvdW5kZWQAAAACAAAAAAAAAAdjYXB0YWluAAAAABMAAAABAAAAAAAAAAR0ZWFtAAAABAAAAAAAAAAC",
        "AAAABQAAAB9PbmUgdHJhY2sncyByYW5raW5nIGlzIHNldHRsZWQuAAAAAAAAAAALVHJhY2tSYW5rZWQAAAAAAQAAAAx0cmFja19yYW5rZWQAAAACAAAAAAAAAAV0cmFjawAAAAAAABEAAAABAAAAikhvdyBtYW55IHByb2plY3RzIG1hZGUgaXQgaW50byB0aGUgcmFua2luZywgd2hpY2ggaXMgbm90IHRoZSBzYW1lIGFzIGhvdwptYW55IGVudGVyZWQ6IHNjcmVlbmVkIG91dCBhbmQgc2hvcnQgb2YgcXVvcnVtIGFyZSBib3RoIGxlZnQgb3V0LgAAAAAABnJhbmtlZAAAAAAABAAAAAAAAAAC",
        "AAAABQAAALpBIGp1ZGdlIHN0ZXBwZWQgYXdheSBmcm9tIG9uZSBwcm9qZWN0LgoKUmVjb3JkZWQgcmF0aGVyIHRoYW4gc2lsZW50LCBiZWNhdXNlIGEganVkZ2UgcXVpZXRseSBub3Qgc2NvcmluZyBhIHByb2plY3QKYW5kIGEganVkZ2UgZGVjbGFyaW5nIGEgY29uZmxpY3QgbG9vayBpZGVudGljYWwgZnJvbSBvdXRzaWRlIG90aGVyd2lzZS4AAAAAAAAAAAAMSnVkZ2VSZWN1c2VkAAAAAQAAAA1qdWRnZV9yZWN1c2VkAAAAAAAAAgAAAAAAAAAFanVkZ2UAAAAAAAATAAAAAQAAAAAAAAAEdGVhbQAAAAQAAAAAAAAAAg==",
        "AAAABQAAABZTb21lb25lIGpvaW5lZCBhIHRlYW0uAAAAAAAAAAAADE1lbWJlckpvaW5lZAAAAAEAAAANbWVtYmVyX2pvaW5lZAAAAAAAAAIAAAAAAAAABm1lbWJlcgAAAAAAEwAAAAEAAAAAAAAABHRlYW0AAAAEAAAAAAAAAAI=",
        "AAAABQAAACJPbmUgYmFsbG90IHdhcyBvcGVuZWQgYW5kIGNvdW50ZWQuAAAAAAAAAAAADUJhbGxvdENvdW50ZWQAAAAAAAABAAAADmJhbGxvdF9jb3VudGVkAAAAAAADAAAAAAAAAAV2b3RlcgAAAAAAABMAAAABAAAAAAAAAAR0ZWFtAAAABAAAAAAAAABdVGhlIHByb2plY3QncyBydW5uaW5nIHRvdGFsLCBzbyBhIHJlYWRlciBjYW4gZm9sbG93IHRoZSBjb3VudCB3aXRob3V0CnJlcGxheWluZyBldmVyeSBiYWxsb3QuAAAAAAAABXZvdGVzAAAAAAAABAAAAAAAAAAC",
        "AAAABQAAAPZBIHRyYWNrIG1vdmVkIHRvIGF3YXJkIG5vdGhpbmcsIG9yIHRoYXQgbW92ZSB3YXMgc2V0dGxlZC4KClRoZSByZWFzb24gdHJhdmVscyB3aXRoIGl0IGFuZCB0aGUgc2lnbmF0dXJlIGNvdW50IHRyYXZlbHMgd2l0aCBpdCwgYmVjYXVzZQphIHByaXplIHRoYXQgd2FzIGFubm91bmNlZCBhbmQgdGhlbiBub3QgcGFpZCBpcyB0aGUgc2luZ2xlIHRoaW5nIGEKcGFydGljaXBhbnQgaXMgbW9zdCBvd2VkIGFuIGV4cGxhbmF0aW9uIGZvci4AAAAAAAAAAAANTm9Bd2FyZE9wZW5lZAAAAAAAAAEAAAAPbm9fYXdhcmRfb3BlbmVkAAAAAAIAAAAAAAAABXRyYWNrAAAAAAAAEQAAAAEAAAAAAAAABnJlYXNvbgAAAAAD7gAAACAAAAAAAAAAAg==",
        "AAAABQAAAChUaGUgaGFja2F0aG9uIG1vdmVkIGludG8gaXRzIG5leHQgc3RhZ2UuAAAAAAAAAA1QaGFzZUFkdmFuY2VkAAAAAAAAAQAAAA5waGFzZV9hZHZhbmNlZAAAAAAAAQAAAAAAAAAFcGhhc2UAAAAAAAfQAAAABVBoYXNlAAAAAAAAAAAAAAI=",
        "AAAABQAAABlPbmUgc2NvcmVjYXJkIHdhcyBvcGVuZWQuAAAAAAAAAAAAAA1TY29yZVJldmVhbGVkAAAAAAAAAQAAAA5zY29yZV9yZXZlYWxlZAAAAAAAAwAAAAAAAAAFanVkZ2UAAAAAAAATAAAAAQAAAAAAAAAEdGVhbQAAAAQAAAAAAAAAJlRoZSB3ZWlnaHRlZCB0b3RhbCwgYXQgZnVsbCBwcmVjaXNpb24uAAAAAAAId2VpZ2h0ZWQAAAAEAAAAAAAAAAI=",
        "AAAABQAAAJ5TZXR0bGVtZW50IHdhcyBoZWxkLCBvciByZWxlYXNlZCBhZ2Fpbi4KClRoZSByZWFzb24gdHJhdmVscyB3aXRoIHRoZSBob2xkLCBiZWNhdXNlIG1vbmV5IHN0b3BwaW5nIGlzIHRoZSBvbmUgdGhpbmcgYQp3aW5uZXIgY2Fubm90IGludmVzdGlnYXRlIGZvciB0aGVtc2VsdmVzLgAAAAAAAAAAAA5TZXR0bGVtZW50SGVsZAAAAAAAAQAAAA9zZXR0bGVtZW50X2hlbGQAAAAAAgAAAAAAAAAGcGF1c2VkAAAAAAABAAAAAAAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAAAAAAC",
        "AAAABQAAACFUaGUgdGVhbSBhbnN3ZXJlZCwgb24gdGhlIHJlY29yZC4AAAAAAAAAAAAAD0FwcGVhbFN1Ym1pdHRlZAAAAAABAAAAEGFwcGVhbF9zdWJtaXR0ZWQAAAADAAAAAAAAAAR0ZWFtAAAABAAAAAEAAAAAAAAABm1lbWJlcgAAAAAAEwAAAAAAAAAAAAAABmFwcGVhbAAAAAAD7gAAACAAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAD05vQXdhcmRBcHByb3ZlZAAAAAABAAAAEW5vX2F3YXJkX2FwcHJvdmVkAAAAAAAAAwAAAAAAAAAFdHJhY2sAAAAAAAARAAAAAQAAAAAAAAAFanVkZ2UAAAAAAAATAAAAAAAAAAAAAAAJYXBwcm92YWxzAAAAAAAABAAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAD05vQXdhcmRSZXNvbHZlZAAAAAABAAAAEW5vX2F3YXJkX3Jlc29sdmVkAAAAAAAAAwAAAAAAAAAFdHJhY2sAAAAAAAARAAAAAQAAAAAAAAAIZGVjbGFyZWQAAAABAAAAAAAAAAAAAAAIcmV0dXJuZWQAAAALAAAAAAAAAAI=",
        "AAAABQAAAbtPbmUgZGVhZGxpbmUgbW92ZWQsIGluc2lkZSB0aGUgYWxsb3dhbmNlIHRoZSBydWxlcyBhbm5vdW5jZWQuCgpUaGlzIGV2ZW50IGlzIHRoZSBlbnRpcmUgZGlmZmVyZW5jZSBiZXR3ZWVuIHRoZSBzY2hlZHVsZSB0aGF0IHdhcyBoYXNoZWQgYW5kCnRoZSBzY2hlZHVsZSBpbiBmb3JjZSwgc28gYW4gaW5kZXhlciBob2xkaW5nIHRoZSBjb25zdGl0dXRpb24gYW5kIHRoaXMKc3RyZWFtIGNhbiBzaG93IGJvdGggYW5kIHNheSB3aGljaCBpcyB3aGljaC4gVGhlIHJlYXNvbiB0cmF2ZWxzIHdpdGggaXQKYmVjYXVzZSB0aW1lIGlzIHRoZSByZXNvdXJjZSBwYXJ0aWNpcGFudHMgcGxhbiBhcm91bmQsIGFuZCBhIHdpbmRvdyB0aGF0Cm1vdmVkIHdpdGhvdXQgYSBzdGF0ZWQgY2F1c2UgaXMgaW5kaXN0aW5ndWlzaGFibGUgZnJvbSBvbmUgdGhhdCBtb3ZlZCB0bwpzdWl0IHNvbWVib2R5LgAAAAAAAAAAEERlYWRsaW5lRXh0ZW5kZWQAAAABAAAAEWRlYWRsaW5lX2V4dGVuZGVkAAAAAAAABAAAAAAAAAAIZGVhZGxpbmUAAAfQAAAACERlYWRsaW5lAAAAAQAAAAAAAAAIbW92ZWRfdG8AAAAGAAAAAAAAADxXaGF0IHRoaXMgbW92ZSBjb3N0IGFnYWluc3QgdGhlIGRlYWRsaW5lJ3MgYW5ub3VuY2VkIGJ1ZGdldC4AAAANc2Vjb25kc19hZGRlZAAAAAAAAAYAAAAAAAAAAAAAAAZyZWFzb24AAAAAA+4AAAAgAAAAAAAAAAI=",
        "AAAABQAAAOpBIHByb2plY3QgZW50ZXJlZCB0aGUgaGFja2F0aG9uLCBvciBhbiBleGlzdGluZyBlbnRyeSB3YXMgcmV2aXNlZC4KClRoZSBkaWdlc3QgdHJhdmVscyBhbG9uZyBiZWNhdXNlIHRoaXMgaXMgdGhlIHZhbHVlIHRoYXQgZ2V0cyBwaW5uZWQgYXQgdGhlCmRlYWRsaW5lLCBhbmQgYW4gaW5kZXhlciBob2xkaW5nIHRoaXMgZXZlbnQgY2FuIHNob3cgYSBwYXJ0aWNpcGFudCBleGFjdGx5CndoYXQgd2FzIGZyb3plbi4AAAAAAAAAAAAQUHJvamVjdFN1Ym1pdHRlZAAAAAEAAAARcHJvamVjdF9zdWJtaXR0ZWQAAAAAAAAEAAAAAAAAAAR0ZWFtAAAABAAAAAEAAAAAAAAABXRyYWNrAAAAAAAAEQAAAAAAAAAAAAAADW1ldGFkYXRhX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAAAAAAB3JldmlzZWQAAAAAAQAAAAAAAAAC",
        "AAAABQAAACxUaGUgcmVzdWx0IGlzIGNsb3NlZCBhbmQgdGhlIG1vbmV5IGNhbiBtb3ZlLgAAAAAAAAAQUmVzdWx0c0ZpbmFsaXplZAAAAAEAAAARcmVzdWx0c19maW5hbGl6ZWQAAAAAAAABAAAARldoZW4gdGhlIHJhbmtpbmcgY2xvc2VkLCB3aGljaCBpcyB3aGVyZSBhbnkgc2FmZXR5IHdpbmRvdyBjb3VudHMgZnJvbS4AAAAAAAJhdAAAAAAABgAAAAAAAAAC",
        "AAAABQAAAJFBIHJlcXVlc3Qgd2FzIGRlY2lkZWQuCgpUaGUgcmVhc29uIGRpZ2VzdCB0cmF2ZWxzIHdpdGggYSByZWZ1c2FsLCBzbyBhIGRlY2lzaW9uIHRoYXQga2VlcHMgc29tZWJvZHkKb3V0IG9mIGEgaGFja2F0aG9uIGNhbiBuZXZlciBiZSBhIHNpbGVudCBvbmUuAAAAAAAAAAAAABJBcHBsaWNhdGlvbkRlY2lkZWQAAAAAAAEAAAATYXBwbGljYXRpb25fZGVjaWRlZAAAAAADAAAAAAAAAAlhcHBsaWNhbnQAAAAAAAATAAAAAQAAAAAAAAAIYXBwcm92ZWQAAAABAAAAAAAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAAAAAAC",
        "AAAABQAAAC1BIG1vdmUgdG8gZW5kIHRoZSBoYWNrYXRob24gZWFybHkgd2FzIG9wZW5lZC4AAAAAAAAAAAAAEkNhbmNlbGxhdGlvbk9wZW5lZAAAAAAAAQAAABNjYW5jZWxsYXRpb25fb3BlbmVkAAAAAAEAAAAAAAAABnJlYXNvbgAAAAAD7gAAACAAAAAAAAAAAg==",
        "AAAABQAAAPpUaGUgaGFja2F0aG9uIHN0b3BwZWQsIGFuZCB0aGUgcG9vbCB3ZW50IGJhY2sgYWxvbmcgdGhlIGRlY2xhcmVkIHJvdXRlLgoKVGhlIHJldHVybmVkIGFtb3VudCB0cmF2ZWxzIHdpdGggaXQgYmVjYXVzZSBhIGNhbmNlbGxhdGlvbiBpcyB0aGUgb25lIGVuZGluZwp3aGVyZSBub2JvZHkgcmVjZWl2ZXMgYSBwcml6ZSwgYW5kIHRoZSBvbmx5IHF1ZXN0aW9uIGFueWJvZHkgaGFzIGFmdGVyd2FyZHMKaXMgd2hlcmUgdGhlIG1vbmV5IHdlbnQuAAAAAAAAAAAAEkhhY2thdGhvbkNhbmNlbGxlZAAAAAAAAQAAABNoYWNrYXRob25fY2FuY2VsbGVkAAAAAAMAAAAAAAAABnJlYXNvbgAAAAAD7gAAACAAAAAAAAAAc0hvdyBtYW55IGp1ZGdlcyBzaWduZWQuIFplcm8gd2hlbiB0aGUgb3JnYW5pemVyIGNhbmNlbGxlZCBhbG9uZSwgd2hpY2gKaXMgb25seSBwb3NzaWJsZSBiZWZvcmUgYW55Ym9keSBoYWQgZW50ZXJlZC4AAAAACWFwcHJvdmFscwAAAAAAAAQAAAAAAAAAAAAAAAhyZXR1cm5lZAAAAAsAAAAAAAAAAg==",
        "AAAABQAAADBFdmVyeSBzY29yZWNhcmQgaXMgbm93IHNlYWxlZCBiZWhpbmQgb25lIGRpZ2VzdC4AAAAAAAAAElNjb3JlUm9vdFB1Ymxpc2hlZAAAAAAAAQAAABRzY29yZV9yb290X3B1Ymxpc2hlZAAAAAEAAAAAAAAABHJvb3QAAAPuAAAAIAAAAAAAAAAC",
        "AAAABQAAADdFdmVyeSBjb21tdW5pdHkgYmFsbG90IGlzIG5vdyBzZWFsZWQgYmVoaW5kIG9uZSBkaWdlc3QuAAAAAAAAAAATQmFsbG90Um9vdFB1Ymxpc2hlZAAAAAABAAAAFWJhbGxvdF9yb290X3B1Ymxpc2hlZAAAAAAAAAEAAAAAAAAABHJvb3QAAAPuAAAAIAAAAAAAAAAC",
        "AAAABQAAAMtTb21lb25lIGdhaW5lZCBvciBsb3N0IHRoZSByaWdodCB0byByZXZpZXcgYXBwbGljYXRpb25zLgoKT25lIGV2ZW50IGNvdmVycyBib3RoIGRpcmVjdGlvbnMsIHdpdGggdGhlIGRpcmVjdGlvbiBpbiB0aGUgcGF5bG9hZCwgc28gYQpjbGllbnQgZm9sbG93aW5nIGFuIGFkZHJlc3Mgc2VlcyBpdHMgd2hvbGUgaGlzdG9yeSB1bmRlciBhIHNpbmdsZSBuYW1lLgAAAAAAAAAAE0NvbGxhYm9yYXRvckNoYW5nZWQAAAAAAQAAABRjb2xsYWJvcmF0b3JfY2hhbmdlZAAAAAIAAAAAAAAADGNvbGxhYm9yYXRvcgAAABMAAAABAAAAAAAAAAVhZGRlZAAAAAAAAAEAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAFENhbmNlbGxhdGlvbkFwcHJvdmVkAAAAAQAAABVjYW5jZWxsYXRpb25fYXBwcm92ZWQAAAAAAAACAAAAAAAAAAVqdWRnZQAAAAAAABMAAAABAAAAAAAAAAlhcHByb3ZhbHMAAAAAAAAEAAAAAAAAAAI=",
        "AAAABQAAAJNBbiBlbnRyeSB3YXMgcnVsZWQgb3V0IGR1cmluZyBzY3JlZW5pbmcuCgpUaGUgcHJvamVjdCBrZWVwcyBpdHMgcGFnZS4gV2hhdCBjaGFuZ2VzIGlzIGl0cyBzdGFuZGluZywgYW5kIHRoZSByZWFzb24gaGFzCnRvIHRyYXZlbCB3aXRoIHRoZSBkZWNpc2lvbi4AAAAAAAAAABVTdWJtaXNzaW9uSW52YWxpZGF0ZWQAAAAAAAABAAAAFnN1Ym1pc3Npb25faW52YWxpZGF0ZWQAAAAAAAIAAAAAAAAABHRlYW0AAAAEAAAAAQAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAAAAAAC",
        "AAAABQAAATpBIGNhc2Ugd2FzIG9wZW5lZCB0byByZW1vdmUgYW4gZW50cnkgYWZ0ZXIgc2NyZWVuaW5nIGhhZCBjbG9zZWQuCgpUaGUgcmVhc29uIHRyYXZlbHMgd2l0aCBpdCBmcm9tIHRoZSBmaXJzdCBtb21lbnQsIGJlZm9yZSBhbnkganVkZ2UgaGFzCnNpZ25lZCBhbmQgYmVmb3JlIHRoZSB0ZWFtIGhhcyBhbnN3ZXJlZCwgYmVjYXVzZSB0aGUgb3JkZXIgbWF0dGVyczogYQpyZW1vdmFsIHRoYXQgc3RhdGVzIGl0cyBncm91bmRzIG9ubHkgb25jZSBpdCBoYXMgYWxyZWFkeSBzdWNjZWVkZWQgaXMgbm90IGEKcHJvY2VzcywgaXQgaXMgYW4gYW5ub3VuY2VtZW50LgAAAAAAAAAAABZEaXNxdWFsaWZpY2F0aW9uT3BlbmVkAAAAAAABAAAAF2Rpc3F1YWxpZmljYXRpb25fb3BlbmVkAAAAAAIAAAAAAAAABHRlYW0AAAAEAAAAAQAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAGERpc3F1YWxpZmljYXRpb25BcHByb3ZlZAAAAAEAAAAZZGlzcXVhbGlmaWNhdGlvbl9hcHByb3ZlZAAAAAAAAAMAAAAAAAAABHRlYW0AAAAEAAAAAQAAAAAAAAAFanVkZ2UAAAAAAAATAAAAAAAAAAAAAAAJYXBwcm92YWxzAAAAAAAABAAAAAAAAAAC",
        "AAAABQAAAOBUaGUgY2FzZSB3YXMgc2V0dGxlZCwgd2hpY2hldmVyIHdheSBpdCB3ZW50LgoKQSBjYXNlIHRoYXQgZmVsbCBzaG9ydCBvZiB0aGUgdGhyZXNob2xkIGlzIHB1Ymxpc2hlZCBqdXN0IGFzIGxvdWRseSBhcyBvbmUKdGhhdCBjYXJyaWVkLCBzbyBhIHRlYW0gY2xlYXJlZCBieSB0aGUgcHJvY2VzcyBjYW4gcG9pbnQgYXQgdGhlIHNhbWUgcmVjb3JkCnRoZSBhY2N1c2F0aW9uIHdhcyBtYWRlIG9uLgAAAAAAAAAYRGlzcXVhbGlmaWNhdGlvblJlc29sdmVkAAAAAQAAABlkaXNxdWFsaWZpY2F0aW9uX3Jlc29sdmVkAAAAAAAAAwAAAAAAAAAEdGVhbQAAAAQAAAABAAAAAAAAAAZ1cGhlbGQAAAAAAAEAAAAAAAAAAAAAAAlhcHByb3ZhbHMAAAAAAAAEAAAAAAAAAAI=",
        "AAAAAQAAAnBBIHRlYW0sIGFzIHRoZSBjb250cmFjdCBzZWVzIGl0LgoKQSBwcml6ZSBpcyBzcGxpdCBlcXVhbGx5IGJldHdlZW4gZXZlcnlib2R5IG9uIHRoZSB0ZWFtLCBhbmQgdGhlIGNvbnRyYWN0CnBheXMgZWFjaCBvZiB0aGVtIGRpcmVjdGx5LiBUaGVyZSBhcmUgbm8gY29uZmlndXJhYmxlIHNoYXJlczogZXF1YWwgc2hhcmVzCmFsd2F5cyBhZGQgdXAsIHNvIHRoZSB3aG9sZSBjbGFzcyBvZiBmYWlsdXJlIHdoZXJlIGEgdGVhbSByZWFjaGVzIHRoZQpkZWFkbGluZSB3aXRoIGEgc3BsaXQgdGhhdCBkb2VzIG5vdCB0b3RhbCBhIGh1bmRyZWQgcGVyY2VudCBjYW5ub3QgaGFwcGVuLgpXaGF0IGl0IGNvc3RzIGlzIHRoZSBjYXNlIHdoZXJlIGEgdGVhbSBnZW51aW5lbHkgd2FudGVkIGFuIHVuZXZlbiBzcGxpdCwKYW5kIHRoYXQgaXMgYSBjb252ZXJzYXRpb24gdGhleSBjYW4gaGF2ZSB3aXRoIHRoZWlyIG93biBtb25leSBhZnRlcndhcmRzLgoKVGhlIGNhcHRhaW4gaXMgYSBtZW1iZXIgbGlrZSBhbnkgb3RoZXIgYW5kIHRha2VzIHRoZSBzYW1lIHNoYXJlLiBXaGF0IGJlaW5nCmNhcHRhaW4gbWVhbnMgaXMgYmVpbmcgYWJsZSB0byBhZG1pdCBwZW9wbGUsIGFuZCBub3RoaW5nIGFib3V0IHRoZSBtb25leS4AAAAAAAAABFRlYW0AAAADAAAAeVdob2V2ZXIgZm91bmRlZCB0aGUgdGVhbSBhbmQgY2FuIGFkbWl0IHBlb3BsZSB0byBpdC4gVGhleSBob2xkIG5vIGNsYWltCm9uIHRoZSBwcml6ZSBiZXlvbmQgdGhlIHNoYXJlIGV2ZXJ5IG1lbWJlciB0YWtlcy4AAAAAAAAHY2FwdGFpbgAAAAATAAAAAAAAAAJpZAAAAAAABAAAADxFdmVyeW9uZSBvbiB0aGUgdGVhbSwgdGhlIGNhcHRhaW4gaW5jbHVkZWQgYW5kIGFsd2F5cyBmaXJzdC4AAAAHbWVtYmVycwAAAAPqAAAAEw==",
        "AAAAAQAAATZPbmUgcGVyc29uJ3MgcmVxdWVzdCB0byB0YWtlIHBhcnQsIGFuZCB3aGF0IGNhbWUgb2YgaXQuCgpUaGUgcmVqZWN0aW9uIHJlYXNvbiBpcyBrZXB0IGhlcmUgcmF0aGVyIHRoYW4gb25seSBpbiBhbiBldmVudCwgYmVjYXVzZSBhCnJlZnVzYWwgdGhhdCBsZWF2ZXMgbm8gcGVybWFuZW50IHJlY29yZCBpcyB0aGUgcXVpZXQgYmFjayBkb29yIHRoZSBwcm9kdWN0CmV4aXN0cyB0byBjbG9zZS4gSXQgaXMgYSBoYXNoOiB0aGUgd3JpdHRlbiByZWFzb24gbGl2ZXMgb2ZmIGNoYWluLCBhbmQgdGhpcwpwcm92ZXMgd2hpY2ggdGV4dCB3YXMgZ2l2ZW4uAAAAAAAAAAAADFJlZ2lzdHJhdGlvbgAAAAQAAAAZV2hlbiB0aGUgcmVxdWVzdCBhcnJpdmVkLgAAAAAAAAphcHBsaWVkX2F0AAAAAAAGAAAANFdoZW4gaXQgd2FzIGRlY2lkZWQ7IHplcm8gd2hpbGUgaXQgaXMgc3RpbGwgcGVuZGluZy4AAAAKZGVjaWRlZF9hdAAAAAAABgAAAEFEaWdlc3Qgb2YgdGhlIHdyaXR0ZW4gcmVhc29uIGZvciBhIHJlZnVzYWw7IGFsbCB6ZXJvZXMgb3RoZXJ3aXNlLgAAAAAAAAZyZWFzb24AAAAAA+4AAAAgAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAARQXBwbGljYXRpb25TdGF0dXMAAAA=",
        "AAAAAwAAACRXaGVyZSBhIHJlcXVlc3QgdG8gdGFrZSBwYXJ0IHN0YW5kcy4AAAAAAAAAEUFwcGxpY2F0aW9uU3RhdHVzAAAAAAAAAwAAAAAAAAAHUGVuZGluZwAAAAAAAAAAAAAAAAhBcHByb3ZlZAAAAAEAAAAAAAAACFJlamVjdGVkAAAAAg==",
        "AAAAAQAAAUlPbmUgcHJvamVjdCBhcyB0aGUgcmFua2luZyBzZWVzIGl0LgoKRXZlcnl0aGluZyB0aGUgdGllIGJyZWFrIGNoYWluIGNhbiBhc2sgYWJvdXQgaXMgZ2F0aGVyZWQgaGVyZSBmaXJzdCwgc28gdGhlCmNvbXBhcmlzb24gaXMgYSBwdXJlIGZ1bmN0aW9uIG9mIGl0cyBpbnB1dHMuIFRoYXQgbWF0dGVycyBtb3JlIHRoYW4gaXQKc291bmRzOiBhIHJhbmtpbmcgdGhhdCByZWFjaGVzIGludG8gc3RvcmFnZSB3aGlsZSBpdCBzb3J0cyBpcyBhIHJhbmtpbmcKbm9ib2R5IGNhbiByZXByb2R1Y2Ugb2ZmIGNoYWluLCBhbmQgcmVwcm9kdWNpbmcgaXQgaXMgdGhlIGVudGlyZSBwcm9taXNlLgAAAAAAAAAAAAAJQ2FuZGlkYXRlAAAAAAAABgAAAAAAAAAJY29tbXVuaXR5AAAAAAAABAAAAEBNZWFucyBmb3IgdGhlIGNyaXRlcmlhIHRoZSB0aWUgYnJlYWsgY2hhaW4gbmFtZXMsIGFuZCBubyBvdGhlcnMuAAAAEmNyaXRlcmlvbl9hdmVyYWdlcwAAAAAD6gAAB9AAAAAOQ3JpdGVyaW9uU2NvcmUAAAAAAAAAAAALZmluYWxfc2NvcmUAAAAABAAAAC9UaGUganVkZ2VzJyBtZWFuLCBvciB6ZXJvIHdoZW4gdGhlcmUgd2VyZSBub25lLgAAAAANanVkZ2VfYXZlcmFnZQAAAAAAAAQAAABDV2hlbiB0aGUgcHJvamVjdCBmaXJzdCBhcnJpdmVkLCB3aGljaCBpcyB0aGUgbGFzdCByZXNvcnQgc2VwYXJhdG9yLgAAAAAMc3VibWl0dGVkX2F0AAAABgAAAAAAAAAEdGVhbQAAAAQ=",
        "AAAAAwAAAPBXaGljaCBzdGVwIG9mIHRoZSB0aWUgYnJlYWsgY2hhaW4gZGVjaWRlZCBhIHBsYWNpbmcuCgpSZWNvcmRlZCBhbG9uZ3NpZGUgdGhlIHJhbmtpbmcgc28gdGhlIHByb29mIHBhZ2UgY2FuIG5hbWUgaXQuIEEgcGFydGljaXBhbnQKYXNraW5nIHdoeSB0aGV5IGNhbWUgZm91cnRoIGRlc2VydmVzIHRvIHJlYWQgdGhlIGFjdHVhbCByZWFzb24gcmF0aGVyIHRoYW4KYmUgdG9sZCB0aGUgY29udHJhY3Qgd29ya2VkIGl0IG91dC4AAAAAAAAACURlY2lkZWRCeQAAAAAAAAUAAAAzVGhlIGZpbmFsIHNjb3JlcyBkaWZmZXJlZDsgbm8gdGllIGJyZWFrIHdhcyBuZWVkZWQuAAAAAAVTY29yZQAAAAAAAAAAAAAhU2VwYXJhdGVkIG9uIHRoZSBqdWRnZXMnIGF2ZXJhZ2UuAAAAAAAACkp1ZGdlU2NvcmUAAAAAAAEAAAAhU2VwYXJhdGVkIG9uIG9uZSBuYW1lZCBjcml0ZXJpb24uAAAAAAAACUNyaXRlcmlvbgAAAAAAAAIAAAAgU2VwYXJhdGVkIG9uIHRoZSBjb21tdW5pdHkgdm90ZS4AAAAOQ29tbXVuaXR5U2NvcmUAAAAAAAMAAAAtU2VwYXJhdGVkIGJ5IHdoaWNoIHByb2plY3Qgd2FzIGVudGVyZWQgZmlyc3QuAAAAAAAAD1N1Ym1pc3Npb25PcmRlcgAAAAAE",
        "AAAAAQAAADhPbmUgcHJvamVjdCdzIHBsYWNlIGluIGl0cyB0cmFjaywgYW5kIHdoeSBpdCBzaXRzIHRoZXJlLgAAAAAAAAAJUGxhY2VtZW50AAAAAAAABgAAAAAAAAAJY29tbXVuaXR5AAAAAAAABAAAAIZIb3cgdGhpcyBwcm9qZWN0IHdhcyBzZXBhcmF0ZWQgZnJvbSB0aGUgb25lIHBsYWNlZCBkaXJlY3RseSBhYm92ZSBpdC4KVGhlIHdpbm5lciBoYXMgbm90aGluZyBhYm92ZSB0aGVtLCBzbyB0aGVpcnMgcmVhZHMgYXMgdGhlIHNjb3JlLgAAAAAACmRlY2lkZWRfYnkAAAAAB9AAAAAJRGVjaWRlZEJ5AAAAAAAAAAAAAAtmaW5hbF9zY29yZQAAAAAEAAAAAAAAAA1qdWRnZV9hdmVyYWdlAAAAAAAABAAAAClPbmUgYmFzZWQsIGNvdW50aW5nIGRvd24gZnJvbSB0aGUgd2lubmVyLgAAAAAAAARyYW5rAAAABAAAAAAAAAAEdGVhbQAAAAQ=",
        "AAAAAQAAAbNBIHRyYWNrJ3MgbW92ZSB0byBhd2FyZCBub3RoaW5nLCBhbmQgaG93IGZhciBhbG9uZyBpdCBpcy4KClRoZSBmaXZlIGNvbmRpdGlvbnMgdGhlIHByb2R1Y3QgYXR0YWNoZXMgdG8gdGhpcyBwb3dlciBhcmUgYWxsIGhlcmUgcmF0aGVyCnRoYW4gaW4gYSBwb2xpY3kgZG9jdW1lbnQ6IHRoZSB0cmFjayB3YXMgbWFya2VkIGJlZm9yZSB0aGUgcnVsZXMgbG9ja2VkLCB0aGUKcmVhc29uIGlzIHJlY29yZGVkLCB0aGUganVkZ2VzIGhhdmUgdG8gc2lnbiwgdGhlIGFwcGVhbCB3aW5kb3cgaGFzIHRvIHJ1bgpvdXQsIGFuZCBvbmx5IHRoZW4gZG9lcyB0aGUgbW9uZXkgbW92ZS4gRXZlcnkgb25lIG9mIHRoZW0gaXMgYSBsaW5lIGluCmByZXNvbHZlX25vX2F3YXJkYCwgd2hpY2ggaXMgd2hhdCBtYWtlcyB0aGlzIGRpc2NyZXRpb24gcmF0aGVyIHRoYW4gYQpsb29waG9sZS4AAAAAAAAAAAtOb0F3YXJkQ2FzZQAAAAAEAAAAHEhvdyBtYW55IGp1ZGdlcyBoYXZlIHNpZ25lZC4AAAAJYXBwcm92YWxzAAAAAAAABAAAAEtXaGVuIHRoZSBvcmdhbml6ZXIgb3BlbmVkIGl0LCB3aGljaCBpcyB3aGVyZSB0aGUgYXBwZWFsIHdpbmRvdyBjb3VudHMKZnJvbS4AAAAACW9wZW5lZF9hdAAAAAAAAAYAAAAdRGlnZXN0IG9mIHRoZSB3cml0dGVuIHJlYXNvbi4AAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAADFXaGV0aGVyIGl0IGhhcyBiZWVuIHNldHRsZWQgb25lIHdheSBvciB0aGUgb3RoZXIuAAAAAAAACHJlc29sdmVkAAAAAQ==",
        "AAAAAgAAAVdFdmVyeXRoaW5nIHRoZSBjb3JlIGNvbnRyYWN0IHN0b3Jlcywgb25lIHZhcmlhbnQgcGVyIGZhbWlseSBvZiBlbnRyeS4KCktleXMgYXJlIGFuIGVudW0gcmF0aGVyIHRoYW4gbG9vc2Ugc3ltYm9scyBzbyB0aGF0IGFkZGluZyBhIG5ldyBraW5kIG9mCmVudHJ5IGlzIGEgY2hhbmdlIHRoZSBjb21waWxlciBzZWVzLiBBIHR5cG8gaW4gYSByYXcgc3ltYm9sIGtleSB3cml0ZXMgdG8gYQpzbG90IG5vYm9keSByZWFkcywgYW5kIHRoYXQgZmFpbHVyZSBpcyBzaWxlbnQsIHdoaWNoIGlzIHRoZSB3b3JzdCBzaGFwZSBhCnN0b3JhZ2UgYnVnIGNhbiB0YWtlIHdoZW4gcHJpemUgbW9uZXkgaXMgaW52b2x2ZWQuAAAAAAAAAAAHRGF0YUtleQAAAAAfAAAAAAAAACZUaGUgb3JnYW5pemVyIGFuZCB0aGVpciBjb2xsYWJvcmF0b3JzLgAAAAAACk9yZ2FuaXplcnMAAAAAAAAAAAAXVGhlIHJ1bGVzLCBvbmNlIGxvY2tlZC4AAAAADENvbnN0aXR1dGlvbgAAAAAAAABkVGhlIGRpZ2VzdCBvZiB0aG9zZSBydWxlcywga2VwdCBiZXNpZGUgdGhlbSBzbyBhIHJlYWRlciBuZXZlciBoYXMgdG8KdHJ1c3QgYSBjbGllbnQgdG8gcmVjb21wdXRlIGl0LgAAABBDb25zdGl0dXRpb25IYXNoAAAAAAAAAElQaGFzZSwgZWZmZWN0aXZlIHNjaGVkdWxlIGFuZCB0aGUgcmVzdCBvZiB3aGF0IGNoYW5nZXMgYXMgdGhlIGV2ZW50IHJ1bnMuAAAAAAAABVN0YXRlAAAAAAAAAQAAAPxIb3cgbXVjaCBvZiBpdHMgYW5ub3VuY2VkIGFsbG93YW5jZSBvbmUgZGVhZGxpbmUgaGFzIHNwZW50LiBLZXB0IHBlcgpkZWFkbGluZSByYXRoZXIgdGhhbiBhcyBvbmUgY291bnRlciwgYmVjYXVzZSB0aGUgYWxsb3dhbmNlIGlzIGRlY2xhcmVkCnBlciBkZWFkbGluZSBhbmQgYSBzaW5nbGUgY291bnRlciB3b3VsZCBsZXQgYSBzbGlwcGluZyBzdWJtaXNzaW9uIHdpbmRvdwpzaWxlbnRseSBlYXQgdGhlIGp1ZGdpbmcgd2luZG93J3Mgcm9vbS4AAAAKRXh0ZW5zaW9ucwAAAAAAAQAAB9AAAAAIRGVhZGxpbmUAAAAAAAAAKVRoZSB2YXVsdCBob2xkaW5nIHRoaXMgaGFja2F0aG9uJ3MgcHJpemUuAAAAAAAABVZhdWx0AAAAAAAAAQAAACJPbmUgcGVyc29uJ3MgcmVxdWVzdCB0byB0YWtlIHBhcnQuAAAAAAAMUmVnaXN0cmF0aW9uAAAAAQAAABMAAAABAAAACU9uZSB0ZWFtLgAAAAAAAARUZWFtAAAAAQAAAAQAAAAAAAAAP0hvdyBtYW55IHRlYW1zIGV4aXN0LCB3aGljaCBpcyBhbHNvIHRoZSBuZXh0IHRlYW0ncyBpZGVudGlmaWVyLgAAAAAJVGVhbUNvdW50AAAAAAAAAQAAACBUaGUgdGVhbXMgb25lIHBlcnNvbiBiZWxvbmdzIHRvLgAAAApNZW1iZXJzaGlwAAAAAAABAAAAEwAAAAEAAAA7T25lIHRlYW0ncyBlbnRyeSwga2V5ZWQgYnkgdGVhbSBiZWNhdXNlIGEgdGVhbSBlbnRlcnMgb25jZS4AAAAAClN1Ym1pc3Npb24AAAAAAAEAAAAEAAAAAAAAACJBIG1vdmUgdG8gZW5kIHRoZSBoYWNrYXRob24gZWFybHkuAAAAAAAMQ2FuY2VsbGF0aW9uAAAAAQAAACNPbmUganVkZ2UncyBzaWduYXR1cmUgb24gdGhhdCBtb3ZlLgAAAAAUQ2FuY2VsbGF0aW9uQXBwcm92YWwAAAABAAAAEwAAAAEAAABAQSBjYXNlIGZvciByZW1vdmluZyBvbmUgdGVhbSdzIGVudHJ5IGFmdGVyIHNjcmVlbmluZyBoYXMgY2xvc2VkLgAAABBEaXNxdWFsaWZpY2F0aW9uAAAAAQAAAAQAAAABAAAAI09uZSBqdWRnZSdzIHNpZ25hdHVyZSBvbiB0aGF0IGNhc2UuAAAAABhEaXNxdWFsaWZpY2F0aW9uQXBwcm92YWwAAAACAAAABAAAABMAAAABAAAAKkEganVkZ2Ugd2hvIHN0ZXBwZWQgYXdheSBmcm9tIG9uZSBwcm9qZWN0LgAAAAAAB1JlY3VzYWwAAAAAAgAAABMAAAAEAAAAAQAAAGxIb3cgbWFueSBqdWRnZXMgc3RlcHBlZCBhd2F5IGZyb20gb25lIHByb2plY3QsIHNvIHRoZSBxdW9ydW0gY2FuIGJlCmNoZWNrZWQgd2l0aG91dCB3YWxraW5nIHRoZSB3aG9sZSBiZW5jaC4AAAAMUmVjdXNhbENvdW50AAAAAQAAAAQAAAAAAAAANFRoZSBkaWdlc3Qgc2VhbGluZyBldmVyeSBzY29yZWNhcmQgdW50aWwgdGhlIHJldmVhbC4AAAAJU2NvcmVSb290AAAAAAAAAQAAADpPbmUganVkZ2UncyB3ZWlnaHRlZCB0b3RhbCBmb3Igb25lIHByb2plY3QsIG9uY2UgcmV2ZWFsZWQuAAAAAAAFU2NvcmUAAAAAAAACAAAABAAAABMAAAABAAAAcEhvdyBtYW55IHNjb3JlY2FyZHMgYSBwcm9qZWN0IGhhcyBoYWQgcmV2ZWFsZWQsIGFuZCB0aGVpciBzdW0sIHNvIHRoZQphdmVyYWdlIG5ldmVyIG5lZWRzIHRoZSB3aG9sZSBsaXN0IGxvYWRlZC4AAAAKU2NvcmVUYWxseQAAAAAAAQAAAAQAAAAAAAAAO1RoZSBkaWdlc3Qgc2VhbGluZyBldmVyeSBjb21tdW5pdHkgYmFsbG90IHVudGlsIHRoZSByZXZlYWwuAAAAAApCYWxsb3RSb290AAAAAAABAAAALVdoZXRoZXIgb25lIHdhbGxldCdzIGJhbGxvdCBoYXMgYmVlbiBjb3VudGVkLgAAAAAAAA1CYWxsb3RDb3VudGVkAAAAAAAAAQAAABMAAAABAAAALEhvdyBtYW55IGJhbGxvdHMgb25lIHByb2plY3QgaGFzIGJlZW4gZ2l2ZW4uAAAACVZvdGVDb3VudAAAAAAAAAEAAAAEAAAAAAAAAGtUaGUgbGFyZ2VzdCB2b3RlIGNvdW50IGFueSBwcm9qZWN0IGhvbGRzLCB3aGljaCBpcyB0aGUgZGVub21pbmF0b3IgdGhlCmNvbW11bml0eSBzY29yZSBpcyBtZWFzdXJlZCBhZ2FpbnN0LgAAAAAMVG9wVm90ZUNvdW50AAAAAQAAADBPbmUgY3JpdGVyaW9uJ3MgcmV2ZWFsZWQgc2NvcmVzIGZvciBvbmUgcHJvamVjdC4AAAAOQ3JpdGVyaW9uVGFsbHkAAAAAAAIAAAAEAAAAEQAAAAEAAAAnT25lIHRyYWNrJ3MgZmluaXNoZWQgcmFua2luZywgaW4gb3JkZXIuAAAAAAdSYW5raW5nAAAAAAEAAAARAAAAAQAAAEdBIHByaXplIHBvc2l0aW9uIHRoYXQgaXMgc2V0dGxlZCBpbiBmdWxsIGFuZCBjYW4gYmUgcmVhY2hlZCBubyBmdXJ0aGVyLgAAAAAEUGFpZAAAAAIAAAARAAAABAAAAAEAAAA/T25lIG1lbWJlcidzIHNoYXJlIG9mIG9uZSBwb3NpdGlvbiwgb25jZSBpdCBoYXMgbGVmdCB0aGUgdmF1bHQuAAAAAAVTaGFyZQAAAAAAAAMAAAARAAAABAAAABMAAAABAAAAc0hvdyBtYW55IG9mIGEgcG9zaXRpb24ncyBzaGFyZXMgYXJlIHNldHRsZWQsIHNvIGEgcG9zaXRpb24gY2FuIGJlIGNsb3NlZAp3aXRob3V0IHdhbGtpbmcgdGhlIHRlYW0gb24gZXZlcnkgcGF5bWVudC4AAAAAClNoYXJlQ291bnQAAAAAAAIAAAARAAAABAAAAAEAAAAgQSB0cmFjaydzIG1vdmUgdG8gYXdhcmQgbm90aGluZy4AAAAHTm9Bd2FyZAAAAAABAAAAEQAAAAEAAAAjT25lIGp1ZGdlJ3Mgc2lnbmF0dXJlIG9uIHRoYXQgbW92ZS4AAAAAD05vQXdhcmRBcHByb3ZhbAAAAAACAAAAEQAAABM=",
        "AAAAAAAAACZUaGUgb3JnYW5pemVyIGFuZCB0aGVpciBjb2xsYWJvcmF0b3JzLgAAAAAABHRlYW0AAAAAAAAAAQAAA+kAAAfQAAAADk9yZ2FuaXppbmdUZWFtAAAAAAAD",
        "AAAAAAAAAQVBc2tzIHRvIHRha2UgcGFydC4KClRoZSByZXF1ZXN0IGhhcyB0byBhcnJpdmUgYmVmb3JlIHJlZ2lzdHJhdGlvbiBjbG9zZXMuIEFuIG9yZ2FuaXplciBtYXkKc3RpbGwgYmUgd29ya2luZyB0aHJvdWdoIHRoZSBxdWV1ZSBhZnRlciB0aGF0LCBhbmQgYSBsYXRlIGFwcHJvdmFsIGlzCmZpbmUsIGJ1dCBhIGxhdGUgcmVxdWVzdCBpcyBub3Q6IHRoZSBkZWFkbGluZSBpcyB3aGF0IGZpeGVzIHdobyBjb3VsZApwb3NzaWJseSBiZSBpbiB0aGUgZWxlY3RvcmF0ZS4AAAAAAAAFYXBwbHkAAAAAAAABAAAAAAAAAAlhcHBsaWNhbnQAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAADxUaGUgY3VycmVudCBwaGFzZSwgd2hpY2ggaXMgdGhlIG9uZSB2YWx1ZSBtb3N0IHJlYWRlcnMgd2FudC4AAAAFcGhhc2UAAAAAAAAAAAAAAQAAA+kAAAfQAAAABVBoYXNlAAAAAAAAAw==",
        "AAAAAAAAADpPbmUganVkZ2UncyB3ZWlnaHRlZCB0b3RhbCBmb3Igb25lIHByb2plY3QsIG9uY2UgcmV2ZWFsZWQuAAAAAAAFc2NvcmUAAAAAAAACAAAAAAAAAAd0ZWFtX2lkAAAAAAQAAAAAAAAABWp1ZGdlAAAAAAAAEwAAAAEAAAPpAAAABAAAAAM=",
        "AAAAAAAAAERXaGVyZSB0aGUgaGFja2F0aG9uIGlzIGluIGl0cyBsaWZlY3ljbGUsIGFuZCB0aGUgZGVhZGxpbmVzIGluIGZvcmNlLgAAAAVzdGF0ZQAAAAAAAAAAAAABAAAD6QAAB9AAAAAOSGFja2F0aG9uU3RhdGUAAAAAAAM=",
        "AAAAAAAAAClUaGUgdmF1bHQgaG9sZGluZyB0aGlzIGhhY2thdGhvbidzIHByaXplLgAAAAAAAAV2YXVsdAAAAAAAAAAAAAABAAAD6QAAABMAAAAD",
        "AAAAAAAAAe9DYWxscyB0aGUgd2hvbGUgaGFja2F0aG9uIG9mZiBiZWZvcmUgYW55Ym9keSBoYXMgZW50ZXJlZCBpdC4KClRoZSBvcmdhbml6ZXIgc2lnbnMgYWxvbmUgaGVyZSwgYW5kIG9ubHkgaGVyZS4gVW50aWwgc3VibWlzc2lvbnMgb3Blbgp0aGVyZSBpcyBub2JvZHkgd2hvc2Ugd2Vla2VuZCBpcyBhdCBzdGFrZTogbm8gdGVhbSBoYXMgZm9ybWVkLCBubyBjb2RlCmhhcyBiZWVuIHdyaXR0ZW4sIGFuZCB0aGUgb25seSB0aGluZyBhdCByaXNrIGlzIG1vbmV5IHRoZSBvcmdhbml6ZXIgcHV0CmluIHRoZW1zZWx2ZXMuIEFza2luZyBhIGJlbmNoIG9mIGp1ZGdlcyB0byBzaWduIG9mZiBvbiBzdG9wcGluZyBhbiBldmVudApub2JvZHkgam9pbmVkIHdvdWxkIGJlIGNlcmVtb255IHJhdGhlciB0aGFuIHByb3RlY3Rpb24uCgpUaGUgbW9tZW50IHN1Ym1pc3Npb25zIG9wZW4sIHRoaXMgZG9vciBjbG9zZXMgYW5kCmBvcGVuX2NhbmNlbGxhdGlvbmAgaXMgdGhlIG9ubHkgd2F5IG91dC4AAAAABmNhbmNlbAAAAAAAAQAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAAAAAUFDcmVhdGVzIGEgaGFja2F0aG9uIGluIGRyYWZ0LCB3aXRoIGl0cyBmaXJzdCB2ZXJzaW9uIG9mIHRoZSBydWxlcy4KClRoZSBydWxlcyBhcmUgdmFsaWRhdGVkIGltbWVkaWF0ZWx5IHJhdGhlciB0aGFuIGF0IHRoZSBsb2NrLiBBIGRyYWZ0CnRoYXQgY2Fubm90IGJlY29tZSBhIHZhbGlkIGhhY2thdGhvbiBpcyBub3Qgd29ydGggdGhlIGxlZGdlciBzcGFjZSwgYW5kCmFuIG9yZ2FuaXplciBkaXNjb3ZlcnMgdGhlIHByb2JsZW0gd2hpbGUgdGhleSBhcmUgc3RpbGwgZWRpdGluZyByYXRoZXIKdGhhbiBhdCB0aGUgbW9tZW50IHRoZXkgbWVhbnQgdG8gcHVibGlzaC4AAAAAAAAGY3JlYXRlAAAAAAACAAAAAAAAAAlvcmdhbml6ZXIAAAAAAAATAAAAAAAAAAxjb25zdGl0dXRpb24AAAfQAAAADENvbnN0aXR1dGlvbgAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAitTdGVwcyBhIGp1ZGdlIGF3YXkgZnJvbSBvbmUgcHJvamVjdC4KClRoZSBwcm90b2NvbCBjYW5ub3QgZGV0ZWN0IHRoYXQgYSBqdWRnZSB1c2VkIHRvIHdvcmsgd2l0aCBhIHRlYW0sIHNvIHRoZQpkZWNsYXJhdGlvbiBpcyB0aGVpcnMgdG8gbWFrZS4gV2hhdCBpdCBjYW4gZG8gaXMgbWFrZSB0aGUgZGVjbGFyYXRpb24KcGVybWFuZW50IGFuZCBwdWJsaWMsIGFuZCBzdG9wIHRoYXQganVkZ2UgY291bnRpbmcgdG93YXJkIHRoZSBwcm9qZWN0J3MKcXVvcnVtLCBzbyBhIGNvbmZsaWN0IGhhbmRsZWQgaG9uZXN0bHkgbG9va3MgZGlmZmVyZW50IGZyb20gYSBqdWRnZSB3aG8Kc2ltcGx5IG5ldmVyIGdvdCByb3VuZCB0byBzY29yaW5nLgoKSXQgaGFzIHRvIGhhcHBlbiBiZWZvcmUgdGhlIGp1ZGdpbmcgd2luZG93IGNsb3NlcywgZm9yIHRoZSBzYW1lIHJlYXNvbgpzY29yZXMgYXJlIHNlYWxlZDogYSBqdWRnZSB3aG8gY291bGQgc3RlcCBhd2F5IGFmdGVyIHNlZWluZyB3aGVyZSBhCnByb2plY3Qgc3Rvb2Qgd291bGQgYmUgY2hvb3Npbmcgd2hpY2ggcmVzdWx0cyB0byB0b3VjaC4AAAAABnJlY3VzZQAAAAAAAgAAAAAAAAAFanVkZ2UAAAAAAAATAAAAAAAAAAd0ZWFtX2lkAAAAAAQAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAB5XaGF0IHRoZSB2YXVsdCBhY3R1YWxseSBob2xkcy4AAAAAAAdmdW5kaW5nAAAAAAAAAAABAAAD6QAAAAsAAAAD",
        "AAAAAAAAAC9XaGV0aGVyIGEgcHJpemUgcG9zaXRpb24gaGFzIGFscmVhZHkgYmVlbiBwYWlkLgAAAAAHaXNfcGFpZAAAAAACAAAAAAAAAAV0cmFjawAAAAAAABEAAAAAAAAABHJhbmsAAAAEAAAAAQAAAAE=",
        "AAAAAAAAAZRPcGVucyB0aGUgaGFja2F0aG9uIGZvciByZWdpc3RyYXRpb24gYW5kIHN1Ym1pc3Npb25zLgoKVGhlIGZ1bmRpbmcgY2hlY2sgaXMgdGhlIHdob2xlIHBvaW50IG9mIHRoaXMgY2FsbC4gQSBoYWNrYXRob24gdGhhdAphbm5vdW5jZXMgYSBwcml6ZSBpdCBkb2VzIG5vdCBob2xkIGlzIHRoZSBmaXJzdCBwcm9ibGVtIHRoZSBwcm9kdWN0IHNldApvdXQgdG8gcmVtb3ZlLCBzbyB0aGUgcG9vbCBoYXMgdG8gY292ZXIgdGhlIHByaXplIHRhYmxlIGluIGZ1bGwgYmVmb3JlCmFueWJvZHkgY2FuIHNpZ24gdXAuIEFueW9uZSBtYXkgY2FsbCB0aGlzIG9uY2UgdGhhdCBpcyB0cnVlOyBtYWtpbmcgaXQKdGhlIG9yZ2FuaXplcidzIHByaXZpbGVnZSB3b3VsZCBsZXQgdGhlbSBzaXQgb24gYSBmdW5kZWQgaGFja2F0aG9uLgAAAAdwdWJsaXNoAAAAAAAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAACdPbmUgdHJhY2sncyBmaW5pc2hlZCByYW5raW5nLCBpbiBvcmRlci4AAAAAB3JhbmtpbmcAAAAAAQAAAAAAAAAFdHJhY2sAAAAAAAARAAAAAQAAA+kAAAPqAAAH0AAAAAlQbGFjZW1lbnQAAAAAAAAD",
        "AAAAAAAAATFDbG9zZXMgdGhlIGhhY2thdGhvbiBmb3IgZ29vZC4KCkV2ZXJ5IHByaXplIHBvc2l0aW9uIGhhcyB0byBoYXZlIGJlZW4gc2V0dGxlZCBvbmUgd2F5IG9yIGFub3RoZXIgZmlyc3Q6CnBhaWQgdG8gYSB3aW5uZXIsIHJldHVybmVkIGFmdGVyIGEgbm8gYXdhcmQsIG9yIHN3ZXB0IG9uY2UgdGhlIGNsYWltCnBlcmlvZCByYW4gb3V0LiBBIGhhY2thdGhvbiB0aGF0IGNsb3NlZCB3aXRoIG1vbmV5IHN0aWxsIG93ZWQgd291bGQgYmUKZXhhY3RseSB0aGUgb3V0Y29tZSB0aGUgcHJvb2YgcGFnZSBleGlzdHMgdG8gbWFrZSBpbXBvc3NpYmxlLgAAAAAAAAhjb21wbGV0ZQAAAAAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAADBXaGV0aGVyIHRoaXMgcGVyc29uIG1heSBjYXN0IGEgY29tbXVuaXR5IGJhbGxvdC4AAAAIbWF5X3ZvdGUAAAABAAAAAAAAAAN3aG8AAAAAEwAAAAEAAAPpAAAAAQAAAAM=",
        "AAAAAAAAADNBIHRyYWNrJ3MgbW92ZSB0byBhd2FyZCBub3RoaW5nLCBpZiBvbmUgd2FzIG9wZW5lZC4AAAAACG5vX2F3YXJkAAAAAQAAAAAAAAAFdHJhY2sAAAAAAAARAAAAAQAAA+kAAAfQAAAAC05vQXdhcmRDYXNlAAAAAAM=",
        "AAAAAAAAAORSZXBsYWNlcyB0aGUgZHJhZnQgcnVsZXMuCgpPbmx5IHRoZSBvcmdhbml6ZXIsIGFuZCBvbmx5IHdoaWxlIHRoZSBoYWNrYXRob24gaXMgc3RpbGwgYSBkcmFmdC4gVGhlCnBoYXNlIGNoZWNrIGlzIHdoYXQgbWFrZXMgdGhlIGxvY2sgbWVhbiBhbnl0aGluZzogb25jZSB0aGUgcnVsZXMgYXJlCmZyb3plbiB0aGlzIGNhbGwgaGFzIG5vIHBhdGggYmFjayBpbiwgbm8gbWF0dGVyIHdobyBzaWducyBpdC4AAAAJY29uZmlndXJlAAAAAAAAAQAAAAAAAAAMY29uc3RpdHV0aW9uAAAH0AAAAAxDb25zdGl0dXRpb24AAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAADZXaGV0aGVyIHRoaXMgd2FsbGV0J3MgYmFsbG90IGhhcyBhbHJlYWR5IGJlZW4gY291bnRlZC4AAAAAAAloYXNfdm90ZWQAAAAAAAABAAAAAAAAAAV2b3RlcgAAAAAAABMAAAABAAAAAQ==",
        "AAAAAAAAANlBZGRzIHNvbWVvbmUgdG8gYSB0ZWFtLgoKQm90aCBzaWRlcyBzaWduOiB0aGUgY2FwdGFpbiBiZWNhdXNlIGl0IGlzIHRoZWlyIHRlYW0gYW5kIHRoZWlyIHByaXplLAp0aGUgbWVtYmVyIGJlY2F1c2UgYmVpbmcgcGxhY2VkIG9uIGEgdGVhbSBjYW4gY29zdCB0aGVtIHRoZSByaWdodCB0bwpqb2luIHRoZSBvbmUgdGhleSBtZWFudCB0by4gTmVpdGhlciBjYW4gZG8gaXQgYWxvbmUuAAAAAAAACmFkZF9tZW1iZXIAAAAAAAIAAAAAAAAAB3RlYW1faWQAAAAABAAAAAAAAAAGbWVtYmVyAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAW5Qb2ludHMgdGhlIGhhY2thdGhvbiBhdCB0aGUgdmF1bHQgaG9sZGluZyBpdHMgcHJpemUuCgpUaGUgYmluZGluZyBpcyBjaGVja2VkIGZyb20gYm90aCBzaWRlcyByYXRoZXIgdGhhbiB0YWtlbiBvbiB0aGUKb3JnYW5pemVyJ3Mgd29yZC4gQSB2YXVsdCBzZXJ2aW5nIGEgZGlmZmVyZW50IGhhY2thdGhvbiwgb3IgaG9sZGluZyBhCmRpZmZlcmVudCB0b2tlbiBmcm9tIHRoZSBvbmUgdGhlIHJ1bGVzIG5hbWUsIGlzIHJlZnVzZWQ7IG90aGVyd2lzZSBhbgpvcmdhbml6ZXIgY291bGQgcG9pbnQgYXQgYSBwb29sIHRoZXkgY29udHJvbCBhbmQgcHVibGlzaCBhIGhhY2thdGhvbgp3aG9zZSBwcml6ZSB3YXMgbmV2ZXIgcmVhbGx5IGNvbW1pdHRlZC4AAAAAAApiaW5kX3ZhdWx0AAAAAAABAAAAAAAAAAV2YXVsdAAAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAADJXaGV0aGVyIHRoaXMganVkZ2Ugc3RlcHBlZCBhd2F5IGZyb20gdGhpcyBwcm9qZWN0LgAAAAAACmlzX3JlY3VzZWQAAAAAAAIAAAAAAAAABWp1ZGdlAAAAAAAAEwAAAAAAAAAHdGVhbV9pZAAAAAAEAAAAAQAAAAE=",
        "AAAAAAAAAUpGcmVlemVzIHRoZSBydWxlcyBhbmQgcmV0dXJucyB0aGVpciBkaWdlc3QuCgpUaGlzIGlzIHRoZSBvbmUgaXJyZXZlcnNpYmxlIHN0ZXAgb2YgdGhlIHNldHVwIHBhdGgsIGFuZCBldmVyeXRoaW5nIHRoZQpwcm9kdWN0IHByb21pc2VzIHJlc3RzIG9uIGl0LiBBZnRlciB0aGlzIGNhbGwgdGhlIHJ1bGVzIGNhbiBiZSByZWFkIGJ5CmFueW9uZSBhbmQgd3JpdHRlbiBieSBubyBvbmUsIHNvIGEgcGFydGljaXBhbnQgd2hvIHJlYWRzIHRoZSBwYWdlIGJlZm9yZQp0aGV5IHN0YXJ0IGJ1aWxkaW5nIGlzIHJlYWRpbmcgdGhlIHJ1bGVzIHRoYXQgd2lsbCBkZWNpZGUgdGhlIHJlc3VsdC4AAAAAAApsb2NrX3J1bGVzAAAAAAAAAAAAAQAAA+kAAAPuAAAAIAAAAAM=",
        "AAAAAAAAACBUaGUgdGVhbXMgb25lIHBlcnNvbiBiZWxvbmdzIHRvLgAAAAptZW1iZXJzaGlwAAAAAAABAAAAAAAAAAN3aG8AAAAAEwAAAAEAAAPqAAAABA==",
        "AAAAAAAAACJUaGUgZGlnZXN0IHNlYWxpbmcgdGhlIHNjb3JlY2FyZHMuAAAAAAAKc2NvcmVfcm9vdAAAAAAAAAAAAAEAAAPpAAAD7gAAACAAAAAD",
        "AAAAAAAAABFPbmUgdGVhbSdzIGVudHJ5LgAAAAAAAApzdWJtaXNzaW9uAAAAAAABAAAAAAAAAAd0ZWFtX2lkAAAAAAQAAAABAAAD6QAAB9AAAAAKU3VibWlzc2lvbgAAAAAAAw==",
        "AAAAAAAAAAlPbmUgdGVhbS4AAAAAAAAKdGVhbV9ieV9pZAAAAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6QAAB9AAAAAEVGVhbQAAAAM=",
        "AAAAAAAAACFIb3cgbWFueSB0ZWFtcyBoYXZlIGJlZW4gZm91bmRlZC4AAAAAAAAKdGVhbV9jb3VudAAAAAAAAAAAAAEAAAAE",
        "AAAAAAAAACpIb3cgbWFueSBiYWxsb3RzIGEgcHJvamVjdCBoYXMgYmVlbiBnaXZlbi4AAAAAAAp2b3RlX2NvdW50AAAAAAABAAAAAAAAAAd0ZWFtX2lkAAAAAAQAAAABAAAABA==",
        "AAAAAAAAAB9UaGUgZGlnZXN0IHNlYWxpbmcgdGhlIGJhbGxvdHMuAAAAAAtiYWxsb3Rfcm9vdAAAAAAAAAAAAQAAA+kAAAPuAAAAIAAAAAM=",
        "AAAAAAAAANFTdGFydHMgYSB0ZWFtLCB3aXRoIHRoZSBjYWxsZXIgYXMgaXRzIGNhcHRhaW4uCgpUaGUgY2FwdGFpbiBpcyB0aGUgYWRkcmVzcyB0aGUgcHJpemUgaXMgcGFpZCB0bywgc28gZm91bmRpbmcgYSB0ZWFtIGlzCmFsc28gdGhlIG1vbWVudCBzb21lYm9keSB0YWtlcyByZXNwb25zaWJpbGl0eSBmb3Igc2V0dGxpbmcgdXAgd2l0aCB0aGUKcGVvcGxlIHdobyBqb2luIGl0LgAAAAAAAAtjcmVhdGVfdGVhbQAAAAABAAAAAAAAAAdjYXB0YWluAAAAABMAAAABAAAD6QAAAAQAAAAD",
        "AAAAAAAAADZBIHByb2plY3QncyByZXZlYWxlZCBzY29yZWNhcmRzLCBhcyBhIGNvdW50IGFuZCBhIHN1bS4AAAAAAAtzY29yZV90YWxseQAAAAABAAAAAAAAAAd0ZWFtX2lkAAAAAAQAAAABAAAH0AAAAApTY29yZVRhbGx5AAA=",
        "AAAAAAAAAWdSZXR1cm5zIG9uZSBtZW1iZXIncyBzaGFyZSwgb25jZSB0aGV5IGhhdmUgaGFkIHRoZSB3aW5kb3cgdGhleSB3ZXJlCnByb21pc2VkIGFuZCBub3QgdXNlZCBpdC4KCk9ubHkgdGhhdCBtZW1iZXIncyBzaGFyZSBtb3Zlcy4gQSB0ZWFtbWF0ZSB3aG8gZGlkIGNvbGxlY3Qga2VlcHMgd2hhdAp0aGV5IGNvbGxlY3RlZCwgYW5kIGEgdGVhbW1hdGUgd2hvIGhhcyBub3QgeWV0IHN0aWxsIGhhcyB1bnRpbCB0aGUKcGVyaW9kIHJ1bnMgb3V0IGZvciB0aGVtIHRvbywgYmVjYXVzZSB0aGUgcGVyaW9kIGlzIHRoZSBzYW1lIGZvcgpldmVyeWJvZHkgYW5kIGNvdW50cyBmcm9tIHRoZSBtb21lbnQgdGhlIG1vbmV5IGJlY2FtZSBwYXlhYmxlLgAAAAALc3dlZXBfc2hhcmUAAAAAAwAAAAAAAAAFdHJhY2sAAAAAAAARAAAAAAAAAARyYW5rAAAABAAAAAAAAAAGbWVtYmVyAAAAAAATAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAADdUaGUgbW92ZSB0byBlbmQgdGhlIGhhY2thdGhvbiBlYXJseSwgaWYgb25lIHdhcyBvcGVuZWQuAAAAAAxjYW5jZWxsYXRpb24AAAAAAAAAAQAAA+kAAAfQAAAAEENhbmNlbGxhdGlvbkNhc2UAAAAD",
        "AAAAAAAAABtUaGUgcnVsZXMsIGRyYWZ0IG9yIGxvY2tlZC4AAAAADGNvbnN0aXR1dGlvbgAAAAAAAAABAAAD6QAAB9AAAAAMQ29uc3RpdHV0aW9uAAAAAw==",
        "AAAAAAAAAEZXaGV0aGVyIGEgcHJvamVjdCBnYXRoZXJlZCB0aGUgc2NvcmVjYXJkcyBpdHMgdHJhY2sncyBxdW9ydW0gYXNrcyBmb3IuAAAAAAAMbWVldHNfcXVvcnVtAAAAAQAAAAAAAAAHdGVhbV9pZAAAAAAEAAAAAQAAA+kAAAABAAAAAw==",
        "AAAAAAAAABpPbmUgcGVyc29uJ3MgcmVnaXN0cmF0aW9uLgAAAAAADHJlZ2lzdHJhdGlvbgAAAAEAAAAAAAAACWFwcGxpY2FudAAAAAAAABMAAAABAAAD6QAAB9AAAAAMUmVnaXN0cmF0aW9uAAAAAw==",
        "AAAAAAAAAXdPcGVucyBvbmUgc2VhbGVkIHNjb3JlY2FyZC4KCkFueW9uZSBtYXkgY2FsbCB0aGlzIGFuZCBpdCBuZWVkcyBubyBzaWduYXR1cmUsIGJlY2F1c2UgdGhlIHByb29mIGlzIHRoZQphdXRob3JpemF0aW9uOiBhIHNjb3JlY2FyZCB0aGF0IGRvZXMgbm90IHNpdCB1bmRlciB0aGUgcHVibGlzaGVkIHJvb3QgaXMKcmVmdXNlZCwgYW5kIG9uZSB0aGF0IGRvZXMgd2FzIHdyaXR0ZW4gYnkgdGhlIGp1ZGdlIGl0IG5hbWVzIGJlZm9yZSB0aGUKd2luZG93IGNsb3NlZC4gVGhhdCBpcyB3aGF0IGxldHMgYSBwYXJ0aWNpcGFudCBvcGVuIGV2ZXJ5IHNjb3JlY2FyZAp0aGVtc2VsdmVzIHJhdGhlciB0aGFuIHdhaXRpbmcgZm9yIHNvbWVib2R5IHRvIHB1Ymxpc2ggdGhlbS4AAAAADHJldmVhbF9zY29yZQAAAAIAAAAAAAAACXNjb3JlY2FyZAAAAAAAB9AAAAAJU2NvcmVjYXJkAAAAAAAAAAAAAAVwcm9vZgAAAAAAA+oAAAPuAAAAIAAAAAEAAAPpAAAABAAAAAM=",
        "AAAAAAAAA8FQYXlzIG9uZSB0ZWFtIG1lbWJlciB0aGVpciBzaGFyZSBvZiBvbmUgcHJpemUgcG9zaXRpb24uCgpBIHByaXplIGlzIHNwbGl0IGVxdWFsbHkgYWNyb3NzIHRoZSB0ZWFtIGFuZCBlYWNoIG1lbWJlciBpcyBwYWlkCmRpcmVjdGx5LCBzbyB0aGUgY29udHJhY3Qgc2hvd3MgdGhlIGxhc3QgaG9wIG9mIHRoZSBtb25leSByYXRoZXIgdGhhbgpzdG9wcGluZyBhdCB0aGUgY2FwdGFpbidzIGFkZHJlc3MgYW5kIGxlYXZpbmcgdGhlIHJlc3QgdG8gdHJ1c3QuCgpPbmUgbWVtYmVyIGF0IGEgdGltZSwgYW5kIHRoYXQgaXMgbm90IGEgY29udmVuaWVuY2UuIEEgU3RlbGxhciBhY2NvdW50CmhvbGRpbmcgbm8gdHJ1c3RsaW5lIGZvciB0aGUgcHJpemUgYXNzZXQgY2Fubm90IHJlY2VpdmUgaXQsIGFuZCB0aGUKdHJhbnNmZXIgdGhhdCBmYWlscyB0YWtlcyB0aGUgd2hvbGUgdHJhbnNhY3Rpb24gd2l0aCBpdC4gUGF5aW5nIGEgdGVhbQppbiBvbmUgY2FsbCB3b3VsZCB0aGVyZWZvcmUgbGV0IGEgc2luZ2xlIHVucHJlcGFyZWQgbWVtYmVyIGZyZWV6ZSB0aGVpcgp0ZWFtbWF0ZXMnIG1vbmV5IGFzIHN1cmVseSBhcyBhbiB1bnByZXBhcmVkIHdpbm5lciB1c2VkIHRvIGZyZWV6ZSB0aGUKb3RoZXIgcG9zaXRpb25zLiBQYWlkIG9uZSBhdCBhIHRpbWUsIHRoZXkgYmxvY2sgb25seSB0aGVtc2VsdmVzLgoKTm8gc2lnbmF0dXJlIGlzIGFza2VkIGZvci4gVGhlIHJhbmtpbmcgaXMgc2V0dGxlZCwgdGhlIGFtb3VudHMgY29tZQpmcm9tIHRoZSBsb2NrZWQgcHJpemUgdGFibGUsIHRoZSBzcGxpdCBpcyBhcml0aG1ldGljIGFuZCB0aGUgcmVjaXBpZW50cwpjb21lIGZyb20gdGhlIHRlYW0sIHNvIHRoZXJlIGlzIG5vdGhpbmcgbGVmdCBmb3IgYW55Ym9keSB0byBkZWNpZGUuCk1ha2luZyB0aGlzIHRoZSBvcmdhbml6ZXIncyBjYWxsIHdvdWxkIG9ubHkgZ2l2ZSB0aGVtIHRoZSBwb3dlciB0byBzaXQKb24gaXQuAAAAAAAADHNldHRsZV9wcml6ZQAAAAMAAAAAAAAABXRyYWNrAAAAAAAAEQAAAAAAAAAEcmFuawAAAAQAAAAAAAAABm1lbWJlcgAAAAAAEwAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAAAAAadNb3ZlcyB0aGUgaGFja2F0aG9uIGludG8gaXRzIG5leHQgc3RhZ2Ugb25jZSB0aGUgY2xvY2sgYWxsb3dzIGl0LgoKT25seSB0aGUgdGhyZWUgc3RhZ2VzIHRoYXQgZW5kIG9uIGEgZGVhZGxpbmUgY2FuIGJlIG1vdmVkIHRoaXMgd2F5LCBhbmQKbmV2ZXIgYmVmb3JlIHRoYXQgZGVhZGxpbmUgcGFzc2VzLCBzbyB0aGlzIGNhbiBjbG9zZSBhIHdpbmRvdyBidXQgbmV2ZXIKY3V0IG9uZSBzaG9ydC4gTm8gc2lnbmF0dXJlIGlzIGFza2VkIGZvcjogdGhlIGNvbmRpdGlvbiBpcyBhIHRpbWVzdGFtcAphbnlvbmUgY2FuIHJlYWQsIGFuZCBtYWtpbmcgdGhlIG9yZ2FuaXplciB0aGUgb25seSBvbmUgd2hvIGNhbiBhY3Qgb24gaXQKd291bGQgbGV0IHRoZW0gc3RhbGwgYSBoYWNrYXRob24gd2hvc2Ugc3VibWlzc2lvbiB3aW5kb3cgaGFzIGNsb3NlZC4AAAAADWFkdmFuY2VfcGhhc2UAAAAAAAAAAAAAAQAAA+kAAAfQAAAABVBoYXNlAAAAAAAAAw==",
        "AAAAAAAAASBPcGVucyBhIHRyYWNrJ3MgbW92ZSB0byBhd2FyZCBub3RoaW5nLgoKVGhlIHRyYWNrIGhhZCB0byBiZSBtYXJrZWQgZm9yIHRoaXMgYmVmb3JlIHRoZSBydWxlcyBsb2NrZWQsIHdoaWNoIG1lYW5zCmV2ZXJ5IHBhcnRpY2lwYW50IHJlYWQgaXQgYmVmb3JlIHdyaXRpbmcgYSBsaW5lIG9mIGNvZGUuIEFuIG9yZ2FuaXplcgp3aG8gZGlkIG5vdCBtYXJrIGl0IGNhbm5vdCByZWFjaCBmb3IgdGhpcyBhZnRlcndhcmRzLCBob3dldmVyCmRpc2FwcG9pbnRpbmcgdGhlIGVudHJpZXMgdHVybmVkIG91dCB0byBiZS4AAAANb3Blbl9ub19hd2FyZAAAAAAAAAIAAAAAAAAABXRyYWNrAAAAAAAAEQAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAhZPcGVucyBvbmUgc2VhbGVkIGJhbGxvdCBhbmQgY291bnRzIGl0LgoKVGhyZWUgZ2F0ZXMgc3RhbmQgYmV0d2VlbiBhIHNlYWxlZCBiYWxsb3QgYW5kIHRoZSB0YWxseSwgYW5kIGVhY2ggb25lCmV4aXN0cyBiZWNhdXNlIG9mIGEgc3BlY2lmaWMgd2F5IGEgdm90ZSBjYW4gYmUgYm91Z2h0LiBUaGUgdm90ZXIgaGFzIHRvCmhhdmUgYmVlbiBhcHByb3ZlZCBiZWZvcmUgcmVnaXN0cmF0aW9uIGNsb3NlZCwgc28gYW4gb3JnYW5pemVyIGNhbm5vdAphZG1pdCBhbiBlbGVjdG9yYXRlIG9uY2UgdGhleSBrbm93IHdoYXQgaXQgd291bGQgZGVjaWRlLiBUaGV5IGNhbm5vdApoYXZlIGJlZW4gY291bnRlZCBiZWZvcmUsIHNvIG9uZSB3YWxsZXQgaXMgb25lIHZvdGUuIEFuZCB0aGV5IGNhbm5vdCBiZQpvbiB0aGUgdGVhbSB0aGV5IGNob3NlLCBzbyBub2JvZHkgdm90ZXMgZm9yIHRoZW1zZWx2ZXMuCgpMaWtlIHRoZSBzY29yZWNhcmQgcmV2ZWFsLCB0aGlzIG5lZWRzIG5vIHNpZ25hdHVyZTogdGhlIHByb29mIGlzIHdoYXQKYXV0aG9yaXplcyBpdC4AAAAAAA1yZXZlYWxfYmFsbG90AAAAAAAAAwAAAAAAAAAFdm90ZXIAAAAAAAATAAAAAAAAAAd0ZWFtX2lkAAAAAAQAAAAAAAAABXByb29mAAAAAAAD6gAAA+4AAAAgAAAAAQAAA+kAAAAEAAAAAw==",
        "AAAAAAAAAd1GaWxlcyB0aGUgdGVhbSdzIGFuc3dlciwgaW5zaWRlIHRoZSB3aW5kb3cgdGhleSB3ZXJlIGdpdmVuLgoKQW55IG1lbWJlciBtYXkgZmlsZSBpdCwgZm9yIHRoZSBzYW1lIHJlYXNvbiBhbnkgbWVtYmVyIG1heSBlbnRlciB0aGUKcHJvamVjdDogYSB0ZWFtIHdob3NlIGNhcHRhaW4gaXMgYXNsZWVwIHdvdWxkIG90aGVyd2lzZSBsb3NlIGl0cyByaWdodApvZiByZXBseSB0byBhIHRpbWV6b25lLgoKVGhlIGFuc3dlciBjaGFuZ2VzIG5vdGhpbmcgb24gaXRzIG93biBhbmQgaXMgbm90IHJlcXVpcmVkIGZvciB0aGUgY2FzZQp0byBiZSBzZXR0bGVkLiBXaGF0IGl0IGRvZXMgaXMgcHV0IHRoZSB0ZWFtJ3MgYWNjb3VudCBvbiB0aGUgc2FtZSBwdWJsaWMKcmVjb3JkIGFzIHRoZSBhY2N1c2F0aW9uLCBzbyBhIHJlYWRlciBvZiB0aGUgcHJvb2YgcGFnZSBzZWVzIGJvdGggc2lkZXMKb3Iga25vd3MgdGhhdCBvbmx5IG9uZSB3YXMgb2ZmZXJlZC4AAAAAAAANc3VibWl0X2FwcGVhbAAAAAAAAAMAAAAAAAAABm1lbWJlcgAAAAAAEwAAAAAAAAAHdGVhbV9pZAAAAAAEAAAAAAAAAAZhcHBlYWwAAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAf1FbnRlcnMgYSBwcm9qZWN0LCBvciByZXZpc2VzIG9uZSBhbHJlYWR5IGVudGVyZWQuCgpBbnkgbWVtYmVyIG9mIHRoZSB0ZWFtIG1heSBkbyB0aGlzLiBUZWFtcyB3b3JrIHRvZ2V0aGVyIGFuZCBqb2luZWQgYnkKbXV0dWFsIGNvbnNlbnQsIGFuZCByZXF1aXJpbmcgdGhlIGNhcHRhaW4gdG8gYmUgYXdha2UgYXQgdGhlIGRlYWRsaW5lIGlzCmEgZmFpbHVyZSBtb2RlIGEgaGFja2F0aG9uIGRvZXMgbm90IG5lZWQuCgpUaGUgZGlnZXN0IGlzIHN1cHBsaWVkIGJ5IHRoZSBjYWxsZXIgcmF0aGVyIHRoYW4gY29tcHV0ZWQgaGVyZSwgYmVjYXVzZQp0aGUgbWV0YWRhdGEgaXQgY292ZXJzIG5ldmVyIHRvdWNoZXMgdGhlIGNoYWluLiBBIGNsaWVudCBidWlsZHMgaXQgZnJvbQp0aGUgZmllbGRzIG9mIGBTdWJtaXNzaW9uTWV0YWRhdGFgLCBhbmQgYW55b25lIGNhbiBsYXRlciBmZXRjaCB0aGUgc2FtZQptZXRhZGF0YSBmcm9tIGB1cmlgIGFuZCBjaGVjayBpdCByZWFjaGVzIHRoZSBzYW1lIHZhbHVlLgAAAAAAAA5zdWJtaXRfcHJvamVjdAAAAAAABQAAAAAAAAAGbWVtYmVyAAAAAAATAAAAAAAAAAd0ZWFtX2lkAAAAAAQAAAAAAAAABXRyYWNrAAAAAAAAEQAAAAAAAAANbWV0YWRhdGFfaGFzaAAAAAAAA+4AAAAgAAAAAAAAAAN1cmkAAAAAEAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAMhUaGUgbGFyZ2VzdCB2b3RlIGNvdW50IGFueSBwcm9qZWN0IGhvbGRzLgoKVGhpcyBpcyB0aGUgZGVub21pbmF0b3IgdGhlIGNvbW11bml0eSBzY29yZSBpcyBtZWFzdXJlZCBhZ2FpbnN0LCBzbyB0aGUKcHJvamVjdCB0aGUgY3Jvd2QgbGlrZWQgbW9zdCBzY29yZXMgYSBodW5kcmVkIGFuZCB0aGUgcmVzdCBhcmUgcGxhY2VkCnJlbGF0aXZlIHRvIGl0LgAAAA50b3Bfdm90ZV9jb3VudAAAAAAAAAAAAAEAAAAE",
        "AAAAAAAAADBPbmUgY3JpdGVyaW9uJ3MgcmV2ZWFsZWQgc2NvcmVzIGZvciBvbmUgcHJvamVjdC4AAAAPY3JpdGVyaW9uX3RhbGx5AAAAAAIAAAAAAAAAB3RlYW1faWQAAAAABAAAAAAAAAAJY3JpdGVyaW9uAAAAAAAAEQAAAAEAAAfQAAAADkNyaXRlcmlvblRhbGx5AAA=",
        "AAAAAAAABABHaXZlcyBvbmUgZGVhZGxpbmUgbW9yZSB0aW1lLCBpbnNpZGUgdGhlIGFsbG93YW5jZSB0aGUgcnVsZXMgYW5ub3VuY2VkLgoKVGhlIGFubm91bmNlZCBzY2hlZHVsZSBzdGF5cyBpbiB0aGUgY29uc3RpdHV0aW9uIGFuZCBzdGF5cyBoYXNoZWQuIFdoYXQKbW92ZXMgaXMgdGhlIHNjaGVkdWxlIGluIGZvcmNlLCBhbmQgdGhlIGdhcCBiZXR3ZWVuIHRoZSB0d28gaXMgdGhpcwpjYWxsJ3MgZXZlbnQgdHJhaWwsIHNvIGFuIGV4dGVuc2lvbiBhbHdheXMgcmVhZHMgYXMgYW4gZXh0ZW5zaW9uIHJhdGhlcgp0aGFuIGFzIHJ1bGVzIHRoYXQgcXVpZXRseSBzYXkgc29tZXRoaW5nIGVsc2UuCgpUaHJlZSBsaW1pdHMgbWFrZSB0aGF0IHNhZmUsIGFuZCBlYWNoIG9uZSBjbG9zZXMgYSBzcGVjaWZpYyB3YXkgYW4Kb3JnYW5pemVyIGNvdWxkIG90aGVyd2lzZSBzdGVlciBhIHJlc3VsdC4gVGhlIG1vdmUgaGFzIHRvIGZpdCB0aGUgYnVkZ2V0CnB1Ymxpc2hlZCBiZWZvcmUgdGhlIGxvY2ssIHNvIG5vYm9keSBpcyBzdXJwcmlzZWQgYnkgYSB3aW5kb3cgdGhhdCBrZWVwcwpncm93aW5nLiBBIGRlYWRsaW5lIHRoYXQgaGFzIHBhc3NlZCBpcyBjbG9zZWQgZm9yIGdvb2QsIHNvIGFuIG9yZ2FuaXplcgpjYW5ub3QgcmVhZCB3aGF0IGFycml2ZWQgYW5kIG9ubHkgdGhlbiBkZWNpZGUgdG8gZ2l2ZSBtb3JlIHRpbWUuIEFuZCB0aGUKd2hvbGUgc2NoZWR1bGUgaXMgcmV2YWxpZGF0ZWQgYWZ0ZXJ3YXJkcywgc28gYSBzdWJtaXNzaW9uIHdpbmRvdyBwdXNoZWQKcGFzdCB0aGUgc2NyZWVuaW5nIHJvdW5kIGlzIHJlZnVzZWQgcmF0aGVyIHRoYW4gc3RyYW5kaW5nIHRoZSBldmVudC4KCkEgcmVhc29uIGRpZ2VzdCBpcyByZXF1aXJlZCBmb3IgdGhlIHNhbWUgcmVhc29uIGEgc2NyZWVuaW5nIGRlY2lzaW9uCm5lZWRzIG9uZTogdGhpcyBpcyBkaXNjcmV0aW9uLCBhbmQgZGlzY3JldGlvbiBoYXMgdG8gYmUgYW5zd2VyYWJsZS4KCkJlZm9yZSB0aGUgbG9jayB0aGVyZSBpcyBub3RoaW5nIHRvIGV4dGVuZC4gVGhlIG9yZ2FuAAAAD2V4dGVuZF9kZWFkbGluZQAAAAADAAAAAAAAAAhkZWFkbGluZQAAB9AAAAAIRGVhZGxpbmUAAAAAAAAACG1vdmVkX3RvAAAABgAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAO1XaGF0IG9uZSBkZWFkbGluZSBoYXMgc3BlbnQgb2YgaXRzIGFubm91bmNlZCBhbGxvd2FuY2UuCgpSZWFkIGJlc2lkZSBgY29uc3RpdHV0aW9uKCkuZXh0ZW5zaW9uc2AsIHRoaXMgaXMgd2hhdCB0ZWxscyBhCnBhcnRpY2lwYW50IGhvdyBtdWNoIGZ1cnRoZXIgYSB3aW5kb3cgY291bGQgc3RpbGwgbW92ZSwgd2hpY2ggaXMgdGhlCnF1ZXN0aW9uIGFuIGFubm91bmNlZCBhbGxvd2FuY2UgZXhpc3RzIHRvIGFuc3dlci4AAAAAAAAPZXh0ZW5zaW9uX3VzYWdlAAAAAAEAAAAAAAAACGRlYWRsaW5lAAAH0AAAAAhEZWFkbGluZQAAAAEAAAfQAAAADkV4dGVuc2lvblVzYWdlAAA=",
        "AAAAAAAAACVXaGV0aGVyIHRoZSBwcml6ZSBpcyBjb3ZlcmVkIGluIGZ1bGwuAAAAAAAAD2lzX2Z1bGx5X2Z1bmRlZAAAAAAAAAAAAQAAA+kAAAABAAAAAw==",
        "AAAAAAAAARxPcGVucyBzZXR0bGVtZW50IG9uY2UgdGhlIHNhZmV0eSB3aW5kb3cgaGFzIHJ1biBvdXQuCgpUaGUgd2luZG93IGJ1eXMgdGltZSB0byBzdG9wIGEgcGF5b3V0IGFmdGVyIGEgYnVnIGlzIGZvdW5kIGJldHdlZW4gdGhlCnJhbmtpbmcgYW5kIHRoZSBtb25leSBtb3ZpbmcuIEl0IGNhbm5vdCBjaGFuZ2UgYSBzY29yZSBlaXRoZXIgd2F5LCBhbmQKaXQgaXMgY2FwcGVkLCBiZWNhdXNlIGEgaG9sZCBub2JvZHkgY2FuIGVuZCBpcyBpbmRpc3Rpbmd1aXNoYWJsZSBmcm9tCm5vdCBwYXlpbmcgYXQgYWxsLgAAAA9vcGVuX3NldHRsZW1lbnQAAAAAAAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAe1SZXR1cm5zIGEgcG9zaXRpb24gdGhhdCBuZXZlciBoYWQgYSB3aW5uZXIuCgpBIHRyYWNrIG5vYm9keSBlbnRlcmVkLCBvciBvbmUgd2hvc2UgZW50cmllcyBhbGwgZmVsbCBzaG9ydCBvZiB0aGUKcXVvcnVtLCBzdGlsbCBoYXMgYSBwcml6ZSBzaXR0aW5nIGFnYWluc3QgaXQsIGFuZCBhIHZhdWx0IHRoYXQgY2FuIG5ldmVyCmVtcHR5IGlzIGEgdmF1bHQgd2hvc2UgYmFsYW5jZSBzdG9wcyBtZWFuaW5nIGFueXRoaW5nLiBUaGlzIGlzIHRoZSB3aG9sZQpwb3NpdGlvbiBhdCBvbmNlIGJlY2F1c2UgdGhlcmUgaXMgbm8gdGVhbSB0byBzcGxpdCBpdCBiZXR3ZWVuLgoKQSBwb3NpdGlvbiB0aGF0IHdhcyB3b24gaXMgb3V0IG9mIHJlYWNoIGhlcmUgaG93ZXZlciBsb25nIG5vYm9keQpjb2xsZWN0cyBpdC4gSXRzIHNoYXJlcyBiZWxvbmcgdG8gbmFtZWQgcGVvcGxlLCBhbmQgZWFjaCBvbmUgaXMgcmV0dXJuZWQKb24gaXRzIG93biB0aHJvdWdoIGBzd2VlcF9zaGFyZWAuAAAAAAAAD3N3ZWVwX3VuY2xhaW1lZAAAAAACAAAAAAAAAAV0cmFjawAAAAAAABEAAAAAAAAABHJhbmsAAAAEAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAX9BZGRzIGEgaGVscGVyIHdobyBjYW4gd29yayB0aHJvdWdoIHRoZSBhcHBsaWNhdGlvbiBxdWV1ZS4KClVubGlrZSB0aGUgcnVsZXMsIHRoZSBjb2xsYWJvcmF0b3IgbGlzdCBzdGF5cyBlZGl0YWJsZSBmb3IgdGhlIHdob2xlCmV2ZW50LCBiZWNhdXNlIGEgaHVuZHJlZCBhcHBsaWNhdGlvbnMgYXJyaXZpbmcgYXQgb25jZSBpcyBleGFjdGx5IHdoZW4KYW4gb3JnYW5pemVyIG5lZWRzIGFub3RoZXIgcGFpciBvZiBoYW5kcyBhbmQgZXhhY3RseSB3aGVuIHRoZXkgY2Fubm90CndhaXQgZm9yIGEgbmV3IGhhY2thdGhvbi4gVGhlIHJlYWNoIG9mIHRoYXQgaGVscGVyIGlzIG5hcnJvdyBlbm91Z2ggdGhhdAp3aWRlbmluZyB0aGUgbGlzdCB1bmRlciBwcmVzc3VyZSBpcyBzYWZlLgAAAAAQYWRkX2NvbGxhYm9yYXRvcgAAAAEAAAAAAAAADGNvbGxhYm9yYXRvcgAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAMRBZGRzIGEganVkZ2UncyBzaWduYXR1cmUgdG8gdGhhdCBtb3ZlLgoKV2l0aGhvbGRpbmcgYSBwcml6ZSBpcyB0aGUgb25lIGRlY2lzaW9uIHRoYXQgbW9zdCBuZWVkcyBzb21lYm9keSBvdGhlcgp0aGFuIHRoZSBvcmdhbml6ZXIgdG8gYWdyZWUsIHNpbmNlIHRoZSBvcmdhbml6ZXIgaXMgdGhlIHBhcnR5IHRoZSBtb25leQpnb2VzIGJhY2sgdG8uAAAAEGFwcHJvdmVfbm9fYXdhcmQAAAACAAAAAAAAAAVqdWRnZQAAAAAAABMAAAAAAAAABXRyYWNrAAAAAAAAEQAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAPBIb3cgbWFueSBqdWRnZXMgYXJlIGxlZnQgdG8gc2NvcmUgYSBwcm9qZWN0LCBhZnRlciByZWN1c2Fscy4KClRoaXMgaXMgdGhlIG51bWJlciB0aGUgcXVvcnVtIGlzIG1lYXN1cmVkIGFnYWluc3QsIHNvIGEgcHJvamVjdCB3aG9zZQpiZW5jaCBlbXB0aWVkIG91dCB0aHJvdWdoIGhvbmVzdCBjb25mbGljdHMgaXMgdmlzaWJseSBzaG9ydCBvZiBqdWRnZXMKcmF0aGVyIHRoYW4gbXlzdGVyaW91c2x5IHVuZmluaXNoYWJsZS4AAAAQYXZhaWxhYmxlX2p1ZGdlcwAAAAEAAAAAAAAAB3RlYW1faWQAAAAABAAAAAEAAAPpAAAABAAAAAM=",
        "AAAAAAAAADVUaGUgY2FzZSBhZ2FpbnN0IG9uZSB0ZWFtJ3MgZW50cnksIGlmIG9uZSB3YXMgb3BlbmVkLgAAAAAAABBkaXNxdWFsaWZpY2F0aW9uAAAAAQAAAAAAAAAHdGVhbV9pZAAAAAAEAAAAAQAAA+kAAAfQAAAAFERpc3F1YWxpZmljYXRpb25DYXNlAAAAAw==",
        "AAAAAAAAAx5Db21wdXRlcyB0aGUgcmFua2luZyBhbmQgY2xvc2VzIHRoZSByZXN1bHQuCgpOb3RoaW5nIGlzIGFjY2VwdGVkIGZyb20gdGhlIGNhbGxlci4gVGhlIGNvbnRyYWN0IHJlYWRzIHRoZSByZXZlYWxlZApzY29yZWNhcmRzLCB0aGUgY291bnRlZCBiYWxsb3RzIGFuZCB0aGUgbG9ja2VkIGZvcm11bGEsIGFuZCB3b3JrcyB0aGUKb3JkZXIgb3V0IGl0c2VsZiwgd2hpY2ggaXMgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBhIHJlc3VsdCBhbnlib2R5IGNhbgpyZXByb2R1Y2UgYW5kIGEgcmVzdWx0IHNvbWVib2R5IGFubm91bmNlZC4KCkV2ZXJ5IHByb2plY3QgdGhhdCB3YXMgcnVsZWQgb3V0IGluIHNjcmVlbmluZywgb3IgdGhhdCBuZXZlciByZWFjaGVkIHRoZQpqdWRnZSBxdW9ydW0sIGlzIGxlZnQgb3V0IG9mIHRoZSByYW5raW5nIHJhdGhlciB0aGFuIHBsYWNlZCBsYXN0LiBUaG9zZQphcmUgZGlmZmVyZW50IHNpdHVhdGlvbnMgZnJvbSBhIHByb2plY3QgdGhhdCB3YXMganVkZ2VkIGFuZCBjYW1lIGxhc3QsCmFuZCB0aGUgcGFnZSBzaG93cyB3aGljaCBvbmUgYXBwbGllcy4KCkEgZGlzcXVhbGlmaWNhdGlvbiBjYXNlIHN0aWxsIG9wZW4gaG9sZHMgdGhpcyBjYWxsIGJhY2suIENsb3NpbmcgdGhlCnJhbmtpbmcgYXJvdW5kIGFuIGVudHJ5IHdob3NlIHN0YW5kaW5nIGlzIHVuZGVjaWRlZCB3b3VsZCBmb3JjZSB0aGUKb3V0Y29tZSBvbmUgd2F5IHdoaWxlIHRoZSB0ZWFtIHN0aWxsIGhhZCB0aW1lIHRvIGFuc3dlciwgYW5kIHRoZXJlIGlzIG5vCndheSBiYWNrIG9uY2UgdGhlIHJlc3VsdCBpcyBmaW5hbC4AAAAAABBmaW5hbGl6ZV9yZXN1bHRzAAAAAAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAANxIb2xkcyB0aGUgbW9uZXkgd2hlcmUgaXQgaXMsIHdpdGggYSByZWFzb24uCgpTY29yZXMgYXJlIHVudG91Y2hhYmxlIGVpdGhlciB3YXkuIFRoaXMgc3RvcHMgcGF5bWVudCBhbmQgbm90aGluZyBlbHNlLAp3aGljaCBpcyB0aGUgb25seSBwb3dlciB3b3J0aCBoYXZpbmcgd2hlbiBhIGNvbnRyYWN0IGJ1ZyB0dXJucyB1cCBhZnRlcgp0aGUgcmFua2luZyBpcyBhbHJlYWR5IGNvcnJlY3QuAAAAEHBhdXNlX3NldHRsZW1lbnQAAAABAAAAAAAAAAZyZWFzb24AAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAACBXaGF0IHRoZSBwcml6ZSB0YWJsZSBhZGRzIHVwIHRvLgAAABByZXF1aXJlZF9mdW5kaW5nAAAAAAAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAAAAASNTZXR0bGVzIHRoZSBtb3ZlLCBvbmUgd2F5IG9yIHRoZSBvdGhlci4KClRoZSBhcHBlYWwgd2luZG93IGhhcyB0byBoYXZlIHJ1biBvdXQgYW5kIHRoZSBqdWRnZXMgaGF2ZSB0byBoYXZlCnNpZ25lZC4gSWYgZWl0aGVyIGlzIG1pc3NpbmcgdGhlIG1vdmUgZmFpbHMgYW5kIHRoZSB0cmFjayBwYXlzIG91dApub3JtYWxseSwgd2hpY2ggaXMgdGhlIHJpZ2h0IGRlZmF1bHQ6IGEgcHJpemUgdGhhdCB3YXMgYW5ub3VuY2VkIGlzIG93ZWQKdW5sZXNzIHNvbWVib2R5IGNsZWFycyBhIGJhciB0byB3aXRoaG9sZCBpdC4AAAAAEHJlc29sdmVfbm9fYXdhcmQAAAABAAAAAAAAAAV0cmFjawAAAAAAABEAAAABAAAD6QAAAAEAAAAD",
        "AAAAAAAAADVUaGUgZGlnZXN0IG9mIHRoZSBsb2NrZWQgcnVsZXMsIG9uY2UgdGhleSBhcmUgbG9ja2VkLgAAAAAAABFjb25zdGl0dXRpb25faGFzaAAAAAAAAAAAAAABAAAD6QAAA+4AAAAgAAAAAw==",
        "AAAAAAAAAixPcGVucyBhIG1vdmUgdG8gc3RvcCBhIGhhY2thdGhvbiBwZW9wbGUgYXJlIGFscmVhZHkgYnVpbGRpbmcgaW4uCgpGcm9tIHRoZSBtb21lbnQgc3VibWlzc2lvbnMgb3Blbiwgc3RvcHBpbmcgdGhlIGV2ZW50IGNvc3RzIHRlYW1zIHdvcmsKdGhleSBoYXZlIGFscmVhZHkgZG9uZSwgYW5kIHRoZSBvcmdhbml6ZXIgaXMgdGhlIHBhcnR5IHdob3NlIGRlcG9zaXQKY29tZXMgYmFjay4gVGhvc2UgdHdvIGZhY3RzIHRvZ2V0aGVyIGFyZSB3aHkgdGhlIHRocmVzaG9sZCBhbm5vdW5jZWQKYmVmb3JlIHRoZSBsb2NrIGFwcGxpZXMgZnJvbSBoZXJlIG9uOiB0aGUgcGVyc29uIHdobyBiZW5lZml0cyBmcm9tCnN0b3BwaW5nIGNhbm5vdCBiZSB0aGUgb25seSBwZXJzb24gd2hvIGRlY2lkZXMgdG8uCgpPcGVuaW5nIGNoYW5nZXMgbm90aGluZyBvbiBpdHMgb3duLiBUaGUgaGFja2F0aG9uIGtlZXBzIHJ1bm5pbmcsIGFuZApkZWFkbGluZXMga2VlcCBwYXNzaW5nLCB1bnRpbCB0aGUgc2lnbmF0dXJlcyBhcmUgaW4gYW5kIHNvbWVib2R5IGNhbGxzCmByZXNvbHZlX2NhbmNlbGxhdGlvbmAuAAAAEW9wZW5fY2FuY2VsbGF0aW9uAAAAAAAAAQAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAABpMZXRzIHRoZSBtb25leSBtb3ZlIGFnYWluLgAAAAAAEXJlc3VtZV9zZXR0bGVtZW50AAAAAAAAAQAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAdVTZWFscyBldmVyeSBzY29yZWNhcmQgYmVoaW5kIG9uZSBkaWdlc3QuCgpUaGlzIGlzIHRoZSBtb21lbnQgdGhlIGp1ZGdpbmcgd2luZG93IGNsb3NlcyBpbiB0aGUgZWFzeSBtb2RlLiBVbnRpbCBpdApoYXBwZW5zIHRoZSBzY29yZWNhcmRzIGxpdmUgb2ZmIGNoYWluIHdpdGggdGhlIGNvbGxlY3Rpb24gc2VydmljZTsgYWZ0ZXIKaXQsIHRoYXQgc2VydmljZSBjYW4gbm8gbG9uZ2VyIGNoYW5nZSBhbnkgb2YgdGhlbSwgYmVjYXVzZSB0aGUgcm9vdCBpdApwdWJsaXNoZWQgY29tbWl0cyB0byBhbGwgb2YgdGhlbSBhdCBvbmNlLgoKT25seSB0aGUgYWRkcmVzcyB0aGUgY29uc3RpdHV0aW9uIG5hbWVkIG1heSBjYWxsIHRoaXMsIGFuZCBvbmx5IG9uY2UuCkEgc2Vjb25kIHJvb3Qgd291bGQgbGV0IHRoZSBzZWFsZXIgcmVwbGFjZSB0aGUgd2hvbGUgc2V0IGFmdGVyIHNlZWluZwp3aGF0IHRoZSBmaXJzdCBvbmUgcHJvZHVjZWQuAAAAAAAAEnB1Ymxpc2hfc2NvcmVfcm9vdAAAAAAAAQAAAAAAAAAEcm9vdAAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAANdLZWVwcyBzb21lb25lIG91dCwgb24gdGhlIHJlY29yZC4KClRoZSByZWFzb24gZGlnZXN0IGlzIHJlcXVpcmVkIHJhdGhlciB0aGFuIG9wdGlvbmFsLiBBIHJlZnVzYWwgdGhhdApsZWF2ZXMgbm8gdHJhY2UgaXMgdGhlIHF1aWV0IGJhY2sgZG9vciBiZXNpZGUgdGhlIGRpc3F1YWxpZmljYXRpb24KcHJvY2VzcyB0aGUgcHJvZHVjdCBtYWtlcyBzbyBtdWNoIG5vaXNlIGFib3V0LgAAAAAScmVqZWN0X2FwcGxpY2F0aW9uAAAAAAADAAAAAAAAAAhyZXZpZXdlcgAAABMAAAAAAAAACWFwcGxpY2FudAAAAAAAABMAAAAAAAAABnJlYXNvbgAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAJ5MZXRzIHNvbWVvbmUgaW4uCgpPcGVuIHRvIHRoZSBvcmdhbml6ZXIgYW5kIHRvIGFueSBjb2xsYWJvcmF0b3IsIGJlY2F1c2UgYSBxdWV1ZSBvZiBhCmh1bmRyZWQgYXBwbGljYXRpb25zIGlzIGV4YWN0bHkgdGhlIHRoaW5nIG9uZSBwZXJzb24gY2Fubm90IGNsZWFyIGFsb25lLgAAAAAAE2FwcHJvdmVfYXBwbGljYXRpb24AAAAAAgAAAAAAAAAIcmV2aWV3ZXIAAAATAAAAAAAAAAlhcHBsaWNhbnQAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAW9TZWFscyBldmVyeSBjb21tdW5pdHkgYmFsbG90IGJlaGluZCBvbmUgZGlnZXN0LgoKVGhlIHNhbWUgYWRkcmVzcyB0aGF0IHNlYWxzIHRoZSBzY29yZWNhcmRzIHNlYWxzIHRoZSBiYWxsb3RzLCBhbmQgZm9yCnRoZSBzYW1lIHJlYXNvbjogdGhlIGNyb3dkIHZvdGVzIGluIGEgc2luZ2xlIGFjdGlvbiBvZmYgY2hhaW4sIGFuZAphc2tpbmcgdHdvIGh1bmRyZWQgcGVvcGxlIHRvIGNvbWUgYmFjayBhbmQgcmV2ZWFsIHdvdWxkIGxvc2UgbW9zdCBvZgp0aGVtLiBXaGF0IHRoZSBzZWFsZXIgY2Fubm90IGRvIGlzIGRyb3AgYSBiYWxsb3Qgd2l0aG91dCB0aGUgdm90ZXIgd2hvCmNhc3QgaXQgYmVpbmcgYWJsZSB0byBwcm92ZSB0aGUgb21pc3Npb24uAAAAABNwdWJsaXNoX2JhbGxvdF9yb290AAAAAAEAAAAAAAAABHJvb3QAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAORSZW1vdmVzIGEgaGVscGVyLgoKQXBwbGljYXRpb25zIHRoZXkgYWxyZWFkeSBkZWNpZGVkIHN0YXkgZGVjaWRlZC4gUmV2ZXJzaW5nIHRob3NlIHdvdWxkCm1lYW4gYSBwYXJ0aWNpcGFudCdzIGFkbWlzc2lvbiBjb3VsZCBiZSByZXZva2VkIGJ5IGFuIGFyZ3VtZW50IGJldHdlZW4Kb3JnYW5pemVycywgd2hpY2ggaXMgbm90IGEgdGhpbmcgdGhlIHBhcnRpY2lwYW50IGNhbiBkZWZlbmQgYWdhaW5zdC4AAAATcmVtb3ZlX2NvbGxhYm9yYXRvcgAAAAABAAAAAAAAAAxjb2xsYWJvcmF0b3IAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAARRBZGRzIGEganVkZ2UncyBzaWduYXR1cmUgdG8gdGhhdCBtb3ZlLgoKQW55IGp1ZGdlIG9uIHRoZSBiZW5jaCBtYXkgc2lnbiwgbm90IG9ubHkgdGhvc2UgYXNzaWduZWQgdG8gb25lIHRyYWNrLgpTdG9wcGluZyB0aGUgZXZlbnQgcmVhY2hlcyBldmVyeSB0cmFjayBhdCBvbmNlLCBzbyBuYXJyb3dpbmcgdGhlIHZvdGUgdG8KYSBzaW5nbGUgdHJhY2sncyBqdWRnZXMgd291bGQgbGV0IHRoZSBvcmdhbml6ZXIgcGljayB0aGUgc21hbGxlc3Qgcm9vbQp0aGV5IGhhZCB0byBjb252aW5jZS4AAAAUYXBwcm92ZV9jYW5jZWxsYXRpb24AAAABAAAAAAAAAAVqdWRnZQAAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAgNTdG9wcyB0aGUgaGFja2F0aG9uIGFuZCBzZW5kcyB0aGUgcG9vbCBiYWNrIGFsb25nIHRoZSBkZWNsYXJlZCByb3V0ZS4KClVubGlrZSB0aGUgbm8gYXdhcmQgcGF0aCwgZmFsbGluZyBzaG9ydCBvZiB0aGUgdGhyZXNob2xkIGlzIG5vdCBhbgpvdXRjb21lIGhlcmUsIGl0IGlzIHNpbXBseSBub3QgeWV0LiBBIGNhbmNlbGxhdGlvbiB0aGF0IGZhaWxlZCB3b3VsZApsZWF2ZSB0aGUgZXZlbnQgcnVubmluZywgd2hpY2ggaXQgYWxyZWFkeSBpcywgc28gdGhlIGNhbGwgcmVmdXNlcyBhbmQKdGhlIGhhY2thdGhvbiBjYXJyaWVzIG9uIHVudGlsIGVpdGhlciB0aGUgc2lnbmF0dXJlcyBhcnJpdmUgb3Igbm9ib2R5Cm1lbnRpb25zIGl0IGFnYWluLgoKTm9ib2R5IGhhcyB0byBzaWduIHRoaXMuIFRoZSBzaWduYXR1cmVzIGFyZSBhbHJlYWR5IGNvdW50ZWQgb24gY2hhaW4gYW5kCnRoZSByb3V0ZSB3YXMgZGVjbGFyZWQgYmVmb3JlIHRoZSBsb2NrLCBzbyB0aGVyZSBpcyBub3RoaW5nIGxlZnQgdG8KZGVjaWRlLgAAAAAUcmVzb2x2ZV9jYW5jZWxsYXRpb24AAAAAAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAypSdWxlcyBhbiBlbnRyeSBvdXQgb2YgdGhlIHJ1bm5pbmcsIG9uIHRoZSByZWNvcmQuCgpUaGlzIGlzIHRoZSBzY3JlZW5pbmcgcm91bmQ6IHNwYW0sIGFuIGVtcHR5IHJlcG9zaXRvcnksIHRoZSB3cm9uZyB0cmFjaywKY29kZSB3cml0dGVuIGJlZm9yZSB0aGUgZXZlbnQuIEl0IHJ1bnMgYmVmb3JlIGFueSBzY29yZWNhcmQgZXhpc3RzLCBzbyBhCmp1ZGdlJ3Mgb3BpbmlvbiBjYW4gbmV2ZXIgYmUgdGhlIHRoaW5nIHRoYXQgc2hhcGVzIGl0LCBhbmQgaXQgYmVsb25ncyB0bwp0aGUgb3JnYW5pemVyIHJhdGhlciB0aGFuIHRvIGEgY29sbGFib3JhdG9yIGJlY2F1c2UgaXQgaXMgYSBqdWRnZW1lbnQKYWJvdXQgdGhlIHdvcmsgcmF0aGVyIHRoYW4gYWJvdXQgd2hvIGdldHMgaW4gdGhlIGRvb3IuCgpUaGUgcHJvamVjdCBpcyBub3QgZGVsZXRlZC4gSXQga2VlcHMgaXRzIHBhZ2UgY2FycnlpbmcgdGhlIHJlYXNvbiwgd2hpY2gKaXMgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBhIHNjcmVlbmluZyByb3VuZCBhbmQgYSBkaXNhcHBlYXJhbmNlLgoKQW4gZW50cnkgd2l0aCBhIGRpc3F1YWxpZmljYXRpb24gY2FzZSBvcGVuIGlzIG91dCBvZiByZWFjaCBoZXJlLiBUd28KcHJvY2Vzc2VzIHJ1bm5pbmcgb24gb25lIGVudHJ5IHdvdWxkIGxldCB0aGUgbGlnaHRlciBvbmUgbGFuZCBmaXJzdCBhbmQKbGVhdmUgdGhlIGhlYXZpZXIgb25lIGhvbGRpbmcgYSB2ZXJkaWN0IGl0IGNhbiBubyBsb25nZXIgYXBwbHksIGFuZCB0aGUKdGVhbSB3b3VsZCBsb3NlIHRoZSBhcHBlYWwgd2luZG93IHRoZXkgaGFkIGFscmVhZHkgYmVlbiBnaXZlbi4AAAAAABVpbnZhbGlkYXRlX3N1Ym1pc3Npb24AAAAAAAACAAAAAAAAAAd0ZWFtX2lkAAAAAAQAAAAAAAAABnJlYXNvbgAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAzlPcGVucyBhIGNhc2UgZm9yIHJlbW92aW5nIGFuIGVudHJ5LCBvbiB0aGUgcmVjb3JkLgoKVGhpcyBydW5zIGFsb25nc2lkZSBzY3JlZW5pbmcgcmF0aGVyIHRoYW4gYWZ0ZXIgaXQuIFRoZSB0d28gYW5zd2VyCmRpZmZlcmVudCBwcm9ibGVtczogc2NyZWVuaW5nIGlzIGZvciB0aGUgZW50cmllcyBub2JvZHkgd291bGQgYXJndWUKYWJvdXQsIGFuZCB0aGlzIGlzIGZvciB0aGUgb25lcyBzb21lYm9keSB3b3VsZCwgd2hlbmV2ZXIgdGhleSBzdXJmYWNlLgpBbiBvcmdhbml6ZXIgd2hvIGZpbmRzIHBsYWdpYXJpc20gb24gdGhlIGxhc3QgbW9ybmluZyBvZiBzY3JlZW5pbmcKc2hvdWxkIG5vdCBoYXZlIHRvIGNob29zZSBiZXR3ZWVuIHdhaXRpbmcgYW5kIHVzaW5nIHRoZSBsaWdodGVyIHJvdXRlLApiZWNhdXNlIHRoZSBsaWdodGVyIHJvdXRlIGlzIHRoZSBvbmUgdGhhdCBnaXZlcyB0aGUgdGVhbSBubyB3aW5kb3cgdG8KYW5zd2VyIGFuZCBhc2tzIG5vIGp1ZGdlIHRvIGFncmVlLgoKSXQgY2xvc2VzIGF0IHRoZSByZXZlYWwuIFBhc3QgdGhhdCBwb2ludCB0aGUgcmFua2luZyBpcyBiZWluZyBjb21wdXRlZCwKYW5kIGEgcmVtb3ZhbCBsYW5kaW5nIGFmdGVyIHRoZSByZXN1bHQgaXMgYW5ub3VuY2VkIHdvdWxkIHB1dCBldmVyeQpwYXltZW50IGJhY2sgaW4gZG91YnQuCgpPcGVuaW5nIGEgY2FzZSByZW1vdmVzIG5vdGhpbmcgYnkgaXRzZWxmLiBUaGUgZW50cnkgc3RheXMgaW4gdGhlIHJ1bm5pbmcKdGhlIGVudGlyZSB0aW1lIHRoZSBjYXNlIGlzIG9wZW4sIGFuZCBvbmx5IGByZXNvbHZlX2Rpc3F1YWxpZmljYXRpb25gCmNhbiB0YWtlIGl0IG91dC4AAAAAAAAVb3Blbl9kaXNxdWFsaWZpY2F0aW9uAAAAAAAAAgAAAAAAAAAHdGVhbV9pZAAAAAAEAAAAAAAAAAZyZWFzb24AAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAASJBZGRzIGEganVkZ2UncyBzaWduYXR1cmUgdG8gdGhlIGNhc2UuCgpPbmx5IGEganVkZ2UgYXNzaWduZWQgdG8gdGhlIGVudHJ5J3Mgb3duIHRyYWNrIG1heSBzaWduLiBBIGJlbmNoIHRoYXQKbmV2ZXIgc2F3IHRoZSBwcm9qZWN0IGhhcyBubyBiYXNpcyB0byByZW1vdmUgaXQsIGFuZCBsZXR0aW5nIHRoZW0gc2lnbgp3b3VsZCB0dXJuIHRoZSB0aHJlc2hvbGQgaW50byBhIGhlYWRjb3VudCB0aGUgb3JnYW5pemVyIGNvdWxkIHJlYWNoIGJ5CmFza2luZyB3aG9ldmVyIHdhcyBlYXNpZXN0IHRvIGNvbnZpbmNlLgAAAAAAGGFwcHJvdmVfZGlzcXVhbGlmaWNhdGlvbgAAAAIAAAAAAAAABWp1ZGdlAAAAAAAAEwAAAAAAAAAHdGVhbV9pZAAAAAAEAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAqJTZXR0bGVzIHRoZSBjYXNlLCBvbmUgd2F5IG9yIHRoZSBvdGhlci4KClRoZSB3aW5kb3cgaGFzIHRvIGhhdmUgcnVuIG91dCBmaXJzdCwgc28gYSBjYXNlIGNhbm5vdCBiZSBydXNoZWQgdGhyb3VnaApiZWZvcmUgdGhlIHRlYW0gaGFzIGhhZCB0aGUgdGltZSB0aGV5IHdlcmUgcHJvbWlzZWQgdG8gYW5zd2VyLiBJZiB0aGUKanVkZ2VzIHJlYWNoZWQgdGhlIGFubm91bmNlZCB0aHJlc2hvbGQgdGhlIGVudHJ5IGNvbWVzIG91dCBvZiB0aGUKcnVubmluZyBjYXJyeWluZyB0aGUgcmVhc29uIGl0IHdhcyBvcGVuZWQgd2l0aDsgaWYgdGhleSBkaWQgbm90LCB0aGUKY2FzZSBjbG9zZXMgYW5kIHRoZSBwcm9qZWN0IGNvbXBldGVzIGFzIHRob3VnaCBpdCBoYWQgbmV2ZXIgYmVlbiBvcGVuZWQuClRoYXQgZGVmYXVsdCBpcyB0aGUgc2FtZSBvbmUgdGhlIG5vIGF3YXJkIHBhdGggdXNlczogYSB0ZWFtIHRoYXQgZW50ZXJlZAppcyBpbiB1bmxlc3Mgc29tZWJvZHkgY2xlYXJzIHRoZSBiYXIgdG8gcmVtb3ZlIHRoZW0uCgpOb2JvZHkgaGFzIHRvIHNpZ24gdGhpcy4gQm90aCBjb25kaXRpb25zIGFyZSBwdWJsaWMgdmFsdWVzIGFueW9uZSBjYW4KcmVhZCwgYW5kIGxlYXZpbmcgdGhlIGNhbGwgdG8gdGhlIG9yZ2FuaXplciB3b3VsZCBsZXQgdGhlbSBwYXJrIGEgY2FzZQp0aGV5IGhhZCBsb3N0LgAAAAAAGHJlc29sdmVfZGlzcXVhbGlmaWNhdGlvbgAAAAEAAAAAAAAAB3RlYW1faWQAAAAABAAAAAEAAAPpAAAAAQAAAAM=",
        "AAAAAQAAAS9PbmUganVkZ2UncyB2ZXJkaWN0IG9uIG9uZSBwcm9qZWN0LgoKSW4gdGhlIGVhc3kgbW9kZSB0aGlzIGlzIHNpZ25lZCBvZmYgY2hhaW4gYW5kIG9ubHkgaXRzIGRpZ2VzdCByZWFjaGVzIHRoZQpjaGFpbiBiZWZvcmUgdGhlIHJldmVhbC4gSW4gdGhlIHN0cmljdCBtb2RlIHRoZSBqdWRnZSBjb21taXRzIHRvIGl0CnRoZW1zZWx2ZXMuIEVpdGhlciB3YXkgdGhlIHNoYXBlIGlzIHRoZSBzYW1lLCBzbyB0aGUgc2NvcmluZyBtYXRocyBoYXMgb25lCmltcGxlbWVudGF0aW9uIHJhdGhlciB0aGFuIHR3byB0aGF0IGNhbiBkaXNhZ3JlZS4AAAAAAAAAAAlTY29yZWNhcmQAAAAAAAADAAAAAAAAAAVqdWRnZQAAAAAAABMAAAAuT25lIGVudHJ5IHBlciBjcml0ZXJpb24gaW4gdGhlIHRyYWNrJ3MgcnVicmljLgAAAAAABnNjb3JlcwAAAAAD6gAAB9AAAAAOQ3JpdGVyaW9uU2NvcmUAAAAAACNUaGUgdGVhbSB3aG9zZSBwcm9qZWN0IHRoaXMgc2NvcmVzLgAAAAAEdGVhbQAAAAQ=",
        "AAAAAQAAAUBBIHByb2plY3QncyByZXZlYWxlZCBzY29yZWNhcmRzLCBrZXB0IGFzIGEgcnVubmluZyBjb3VudCBhbmQgc3VtLgoKVGhlIGF2ZXJhZ2UgaXMgdGhlIGFyaXRobWV0aWMgbWVhbiBvZiB0aGUgdmFsaWQgc2NvcmVjYXJkcywgYW5kIGhvbGRpbmcgdGhlCnBhaXIgbWVhbnMgY29tcHV0aW5nIGl0IG5ldmVyIHJlcXVpcmVzIGxvYWRpbmcgZXZlcnkgc2NvcmVjYXJkIGEgcHJvamVjdApyZWNlaXZlZC4gVGhlIHN1bSBpcyB3aWRlbmVkIHRvIHNpeHR5IGZvdXIgYml0cyBzbyBhIHByb2plY3Qgd2l0aCBodW5kcmVkcwpvZiBqdWRnZXMgY2Fubm90IG92ZXJmbG93IGl0LgAAAAAAAAAKU2NvcmVUYWxseQAAAAAAAgAAAAAAAAAFY291bnQAAAAAAAAEAAAAAAAAAAV0b3RhbAAAAAAAAAY=",
        "AAAAAQAAACJXaGF0IG9uZSBqdWRnZSBnYXZlIG9uZSBjcml0ZXJpb24uAAAAAAAAAAAADkNyaXRlcmlvblNjb3JlAAAAAAACAAAAAAAAAAljcml0ZXJpb24AAAAAAAARAAAAHVplcm8gdG8gYSBodW5kcmVkLCBpbmNsdXNpdmUuAAAAAAAABXNjb3JlAAAAAAAABA==",
        "AAAAAQAAAQ1PbmUgY3JpdGVyaW9uJ3MgcmV2ZWFsZWQgc2NvcmVzIGZvciBvbmUgcHJvamVjdCwgYXMgYSBjb3VudCBhbmQgYSBzdW0uCgpLZXB0IGFsb25nc2lkZSB0aGUgd2VpZ2h0ZWQgdG90YWxzIGJlY2F1c2UgdGhlIHRpZSBicmVhayBjaGFpbiBjYW4gYmUgYXNrZWQKdG8gc2VwYXJhdGUgdHdvIHByb2plY3RzIG9uIGEgc2luZ2xlIGNyaXRlcmlvbiwgYW5kIHRoZSB3ZWlnaHRlZCB0b3RhbCBoYXMKYWxyZWFkeSBibGVuZGVkIHRoZSBjcml0ZXJpYSB0b2dldGhlciBieSB0aGVuLgAAAAAAAAAAAAAOQ3JpdGVyaW9uVGFsbHkAAAAAAAIAAAAAAAAABWNvdW50AAAAAAAABAAAAChTdW0gb2YgdGhlIHJhdyB6ZXJvIHRvIGEgaHVuZHJlZCBzY29yZXMuAAAABXRvdGFsAAAAAAAABg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    team: this.txFromJSON<Result<OrganizingTeam>>,
        apply: this.txFromJSON<Result<void>>,
        phase: this.txFromJSON<Result<Phase>>,
        score: this.txFromJSON<Result<u32>>,
        state: this.txFromJSON<Result<HackathonState>>,
        vault: this.txFromJSON<Result<string>>,
        cancel: this.txFromJSON<Result<i128>>,
        create: this.txFromJSON<Result<void>>,
        recuse: this.txFromJSON<Result<void>>,
        funding: this.txFromJSON<Result<i128>>,
        is_paid: this.txFromJSON<boolean>,
        publish: this.txFromJSON<Result<void>>,
        ranking: this.txFromJSON<Result<Array<Placement>>>,
        complete: this.txFromJSON<Result<void>>,
        may_vote: this.txFromJSON<Result<boolean>>,
        no_award: this.txFromJSON<Result<NoAwardCase>>,
        configure: this.txFromJSON<Result<void>>,
        has_voted: this.txFromJSON<boolean>,
        add_member: this.txFromJSON<Result<void>>,
        bind_vault: this.txFromJSON<Result<void>>,
        is_recused: this.txFromJSON<boolean>,
        lock_rules: this.txFromJSON<Result<Buffer>>,
        membership: this.txFromJSON<Array<u32>>,
        score_root: this.txFromJSON<Result<Buffer>>,
        submission: this.txFromJSON<Result<Submission>>,
        team_by_id: this.txFromJSON<Result<Team>>,
        team_count: this.txFromJSON<u32>,
        vote_count: this.txFromJSON<u32>,
        ballot_root: this.txFromJSON<Result<Buffer>>,
        create_team: this.txFromJSON<Result<u32>>,
        score_tally: this.txFromJSON<ScoreTally>,
        sweep_share: this.txFromJSON<Result<i128>>,
        cancellation: this.txFromJSON<Result<CancellationCase>>,
        constitution: this.txFromJSON<Result<Constitution>>,
        meets_quorum: this.txFromJSON<Result<boolean>>,
        registration: this.txFromJSON<Result<Registration>>,
        reveal_score: this.txFromJSON<Result<u32>>,
        settle_prize: this.txFromJSON<Result<i128>>,
        advance_phase: this.txFromJSON<Result<Phase>>,
        open_no_award: this.txFromJSON<Result<void>>,
        reveal_ballot: this.txFromJSON<Result<u32>>,
        submit_appeal: this.txFromJSON<Result<void>>,
        submit_project: this.txFromJSON<Result<void>>,
        top_vote_count: this.txFromJSON<u32>,
        criterion_tally: this.txFromJSON<CriterionTally>,
        extend_deadline: this.txFromJSON<Result<void>>,
        extension_usage: this.txFromJSON<ExtensionUsage>,
        is_fully_funded: this.txFromJSON<Result<boolean>>,
        open_settlement: this.txFromJSON<Result<void>>,
        sweep_unclaimed: this.txFromJSON<Result<i128>>,
        add_collaborator: this.txFromJSON<Result<void>>,
        approve_no_award: this.txFromJSON<Result<void>>,
        available_judges: this.txFromJSON<Result<u32>>,
        disqualification: this.txFromJSON<Result<DisqualificationCase>>,
        finalize_results: this.txFromJSON<Result<void>>,
        pause_settlement: this.txFromJSON<Result<void>>,
        required_funding: this.txFromJSON<Result<i128>>,
        resolve_no_award: this.txFromJSON<Result<boolean>>,
        constitution_hash: this.txFromJSON<Result<Buffer>>,
        open_cancellation: this.txFromJSON<Result<void>>,
        resume_settlement: this.txFromJSON<Result<void>>,
        publish_score_root: this.txFromJSON<Result<void>>,
        reject_application: this.txFromJSON<Result<void>>,
        approve_application: this.txFromJSON<Result<void>>,
        publish_ballot_root: this.txFromJSON<Result<void>>,
        remove_collaborator: this.txFromJSON<Result<void>>,
        approve_cancellation: this.txFromJSON<Result<void>>,
        resolve_cancellation: this.txFromJSON<Result<i128>>,
        invalidate_submission: this.txFromJSON<Result<void>>,
        open_disqualification: this.txFromJSON<Result<void>>,
        approve_disqualification: this.txFromJSON<Result<void>>,
        resolve_disqualification: this.txFromJSON<Result<boolean>>
  }
}