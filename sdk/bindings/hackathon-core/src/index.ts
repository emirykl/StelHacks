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
 * What one field of a submission is worth to the organizer.
 */
export enum FieldRule {
  Unasked = 0,
  Optional = 1,
  Required = 2,
}


/**
 * A team's entry, as the contract records it.
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
 */
export interface SubmissionMetadata {
  /**
 * Demo video, normally a YouTube or Loom URL.
 */
demo_video_url: string;
  /**
 * The contract this project deployed, as a `C…` id.
 */
deployed_contract: string;
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
 * Where the slide deck is stored.
 */
pitch_deck_url: string;
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
 * What a team has to supply before their project counts as submitted.
 */
export interface SubmissionRequirements {
  /**
 * A demo video link.
 */
demo_video: FieldRule;
  /**
 * The contract the project deployed, as an id.
 */
deployed_contract: FieldRule;
  /**
 * A link to a deployed instance a judge can open.
 */
live_url: FieldRule;
  /**
 * A slide deck.
 */
pitch_deck: FieldRule;
  /**
 * A source repository link.
 */
repository: FieldRule;
}

/**
 * How a contribution aimed at a whole track is divided between its positions.
 */
export enum Split {
  Evenly = 0,
  ByWorth = 1,
}


/**
 * One contribution to the prize pool, and the position it was aimed at.
 */
export interface Sponsorship {
  /**
 * What reaches the winner, in the smallest unit of the prize asset.
 */
amount: i128;
  /**
 * When it landed.
 */
at: u64;
  /**
 * What the platform takes on top, paid by the sponsor in the same call.
 */
fee: i128;
  /**
 * Digest of who the sponsor is and whatever they wanted said beside their
 * name, which lives off chain for the same reason the hackathon's own
 * description does: a logo and a sentence are not rules.
 */
note: Buffer;
  /**
 * The rank within that track, or zero for a contribution spread over
 * every position in it.
 */
rank: u32;
  /**
 * Who paid. The address that signed, so nobody can be credited with money
 * they did not send.
 */
sponsor: string;
  /**
 * The track whose position this was aimed at.
 */
track: string;
}

/**
 * Where a sponsor's request for a track of their own has got to.
 */
export enum TrackStatus {
  Proposed = 0,
  Accepted = 1,
  Declined = 2,
}


/**
 * A competition track a sponsor paid to open.
 */
export interface SponsorTrack {
  /**
 * When it was proposed.
 */
at: u64;
  /**
 * What the platform takes on this track, paid by the sponsor on top.
 */
fee: i128;
  /**
 * The track's identifier, unique across the frozen tracks and the
 * sponsored ones alike.
 */
id: string;
  /**
 * Digest of the sponsor's name, logo and whatever they wanted said.
 */
note: Buffer;
  /**
 * Who asked for it and funded it.
 */
sponsor: string;
  status: TrackStatus;
  /**
 * The positions it pays. Each one names this track, so a tier read out of
 * here is the same shape as a tier read out of the frozen table and every
 * reader downstream can treat them alike.
 */
tiers: Array<PrizeTier>;
}

/**
 * Where money goes when it is not awarded to a winner.
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
 */
export enum ProjectVisibility {
  Public = 0,
  Participants = 1,
  Restricted = 2,
}


/**
 * Whether outside money may join the prize pool after the lock, and how far.
 */
export interface SponsorshipPolicy {
  /**
 * The track a sponsor track takes its rubric **and its bench** from.
 */
borrows_from: string;
  /**
 * How many tracks sponsors may open between them. Zero forbids them, and
 * is the setting for an organizer who wants help with the prize but not
 * with the shape of the competition.
 */
max_new_tracks: u32;
  /**
 * The least a single contribution may carry.
 */
min_bounty: i128;
  /**
 * Whether anyone may add to a position that is already in the prize table.
 */
top_ups_allowed: boolean;
}

/**
 * Who gets into the hackathon, and whether anybody has to say so.
 */
export enum RegistrationPolicy {
  Reviewed = 0,
  Open = 1,
}


/**
 * What the platform takes for carrying the event, frozen with everything else.
 */
export interface PlatformFee {
  /**
 * Basis points of the prize table. Zero is a real answer and the common one
 * for community events.
 */
bps: u32;
  /**
 * Where it goes. Named even at a zero rate, because an address that only
 * appears at some rates is a field readers have to check the rate to
 * interpret, and every other address in this document is unconditional.
 */
collector: string;
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
 */
multi_team_allowed: boolean;
}


/**
 * How the final score is split between the judges and the crowd, and what one
 * wallet gets to do with its share.
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
  /**
 * The most projects one ballot may be spread across.
 */
max_choices: u32;
  /**
 * How many points one wallet has to place, all of which it must spend.
 */
power: u32;
}

/**
 * How judges seal their scorecards until the reveal.
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
 * What the platform takes, charged on top of the table above.
 */
platform_fee: PlatformFee;
  /**
 * The token the prize is denominated and paid in.
 */
prize_asset: string;
  /**
 * Payable positions per track.
 */
prize_tiers: Array<PrizeTier>;
  /**
 * Whether applications are reviewed or everybody is admitted on arrival.
 */
registration: RegistrationPolicy;
  /**
 * The announced deadlines.
 */
schedule: Schedule;
  /**
 * Whether outside money may join the pool after the lock, and how far.
 */
sponsorship: SponsorshipPolicy;
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
 */
export enum Deadline {
  Registration = 0,
  Submission = 1,
  Screening = 2,
  Judging = 3,
  CommunityVote = 4,
  CommunityVoteOpens = 5,
}


/**
 * The deadlines of a hackathon, as UTC ledger timestamps in seconds.
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
 * One project a voter backed, and how much of their ballot went to it.
 */
export interface VoteChoice {
  team: u32;
  /**
 * Whole points, never zero: a choice worth nothing is not a choice, and
 * allowing it would let a ballot name a project without backing it.
 */
weight: u32;
}

/**
 * Every rejection the core contract can produce.
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
  62: {message:"CommunityVoteDisabled"},
  63: {message:"BallotAlreadyCounted"},
  /**
   * The ballot is not the shape the locked rules describe: too many choices,
   * none at all, a project named twice or out of order, a choice worth
   * nothing, or a total that is not the power the rules hand out.
   */
  64: {message:"BallotMalformed"},
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
  87: {message:"VaultUnderfunded"},
  /**
   * The contribution was turned down. One code for every way that happens:
   * the locked rules never opened the door, the window has closed, the
   * allowance is used up, the amount is under the floor the rules named, or
   * the position it was aimed at is already settled.
   */
  88: {message:"SponsorshipRefused"}
}









































/**
 * A team, as the contract sees it.
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
 */
export type DataKey = {tag: "Organizers", values: void} | {tag: "Constitution", values: void} | {tag: "ConstitutionHash", values: void} | {tag: "State", values: void} | {tag: "Extensions", values: readonly [Deadline]} | {tag: "Vault", values: void} | {tag: "Registration", values: readonly [string]} | {tag: "Team", values: readonly [u32]} | {tag: "TeamCount", values: void} | {tag: "Membership", values: readonly [string]} | {tag: "Submission", values: readonly [u32]} | {tag: "Cancellation", values: void} | {tag: "CancellationApproval", values: readonly [string]} | {tag: "Disqualification", values: readonly [u32]} | {tag: "DisqualificationApproval", values: readonly [u32, string]} | {tag: "Recusal", values: readonly [string, u32]} | {tag: "RecusalCount", values: readonly [u32]} | {tag: "ScoreRoot", values: void} | {tag: "Score", values: readonly [u32, string]} | {tag: "ScoreTally", values: readonly [u32]} | {tag: "BallotRoot", values: void} | {tag: "BallotCounted", values: readonly [string]} | {tag: "VoteWeight", values: readonly [u32]} | {tag: "TopVoteWeight", values: void} | {tag: "CriterionTally", values: readonly [u32, string]} | {tag: "Ranking", values: readonly [string]} | {tag: "Paid", values: readonly [string, u32]} | {tag: "Share", values: readonly [string, u32, string]} | {tag: "ShareCount", values: readonly [string, u32]} | {tag: "PlatformFeeSettled", values: void} | {tag: "NoAward", values: readonly [string]} | {tag: "NoAwardApproval", values: readonly [string, string]} | {tag: "Bonus", values: readonly [string, u32]} | {tag: "Sponsorship", values: readonly [u32]} | {tag: "SponsorshipCount", values: void} | {tag: "SponsoredFee", values: void} | {tag: "SponsorTrack", values: readonly [string]} | {tag: "SponsorTrackIds", values: void};


/**
 * One deadline and where it is going.
 */
export interface DeadlineMove {
  deadline: Deadline;
  moved_to: u64;
}


/**
 * One judge's verdict on one project.
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
   */
  cancel: ({reason}: {reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a create transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Creates a hackathon in draft, with its first version of the rules.
   */
  create: ({organizer, constitution}: {organizer: string, constitution: Constitution}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a recuse transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Steps a judge away from one project.
   */
  recuse: ({judge, team_id}: {judge: string, team_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_up transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens the hackathon, all of it, in one call.
   */
  set_up: ({vault_wasm, salt}: {vault_wasm: Buffer, salt: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

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
   * Construct and simulate a payable transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * What a prize position is worth now.
   */
  payable: ({track, rank}: {track: string, rank: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a publish transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens the hackathon for registration and submissions.
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
   */
  add_member: ({team_id, member}: {team_id: u32, member: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a bind_vault transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Points the hackathon at the vault holding its prize.
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
   * Construct and simulate a ballot_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The digest sealing the ballots.
   */
  ballot_root: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a create_team transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Starts a team, with the caller as its captain.
   */
  create_team: ({captain}: {captain: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a prize_total transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * What the prize table on its own adds up to.
   */
  prize_total: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a score_tally transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * A project's revealed scorecards, as a count and a sum.
   */
  score_tally: ({team_id}: {team_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<ScoreTally>>

  /**
   * Construct and simulate a sponsorship transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One contribution, by the order it arrived.
   */
  sponsorship: ({index}: {index: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Sponsorship>>>

  /**
   * Construct and simulate a sweep_share transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns one member's share, once they have had the window they were
   * promised and not used it.
   */
  sweep_share: ({track, rank, member}: {track: string, rank: u32, member: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a vote_weight transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * How many points a project has been given, across every ballot counted.
   */
  vote_weight: ({team_id}: {team_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a accept_track transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens a proposed track, and with it the prize behind it.
   */
  accept_track: ({id}: {id: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
   * Construct and simulate a platform_fee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * What the platform is owed for this event, at the rate frozen at the lock.
   */
  platform_fee: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a registration transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One person's registration.
   */
  registration: ({applicant}: {applicant: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Registration>>>

  /**
   * Construct and simulate a reveal_score transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens one sealed scorecard.
   */
  reveal_score: ({scorecard, proof}: {scorecard: Scorecard, proof: Array<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a settle_prize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pays one team member their share of one prize position.
   */
  settle_prize: ({track, rank, member}: {track: string, rank: u32, member: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a sponsor_tier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds outside money to a prize position that is already in the table.
   */
  sponsor_tier: ({sponsor, track, rank, amount, note}: {sponsor: string, track: string, rank: u32, amount: i128, note: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a advance_phase transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Moves the hackathon into its next stage once the clock allows it.
   */
  advance_phase: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Phase>>>

  /**
   * Construct and simulate a decline_track transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Turns a proposed track down and sends the money back.
   */
  decline_track: ({id}: {id: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a open_no_award transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens a track's move to award nothing.
   */
  open_no_award: ({track, reason}: {track: string, reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a propose_track transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Asks the organizer for a track of this sponsor's own, and pays for it.
   */
  propose_track: ({sponsor, id, tiers, note}: {sponsor: string, id: string, tiers: Array<PrizeTier>, note: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a reveal_ballot transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens one sealed ballot and counts it.
   */
  reveal_ballot: ({voter, choices, proof}: {voter: string, choices: Array<VoteChoice>, proof: Array<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a sponsor_track transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One sponsored track, whatever has become of it.
   */
  sponsor_track: ({id}: {id: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<SponsorTrack>>>

  /**
   * Construct and simulate a sponsored_fee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * What the platform is owed on those contributions, on top of what the
   * frozen table owes it.
   */
  sponsored_fee: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a submit_appeal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Files the team's answer, inside the window they were given.
   */
  submit_appeal: ({member, team_id, appeal}: {member: string, team_id: u32, appeal: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a sponsor_places transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds to every position in a track at once, in one signature.
   */
  sponsor_places: ({sponsor, track, amount, split, note}: {sponsor: string, track: string, amount: i128, split: Split, note: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a submit_project transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Enters a project, or revises one already entered.
   */
  submit_project: ({member, team_id, track, metadata_hash, uri}: {member: string, team_id: u32, track: string, metadata_hash: Buffer, uri: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a criterion_tally transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One criterion's revealed scores for one project.
   */
  criterion_tally: ({team_id, criterion}: {team_id: u32, criterion: string}, options?: MethodOptions) => Promise<AssembledTransaction<CriterionTally>>

  /**
   * Construct and simulate a extend_deadline transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Gives one deadline more time, inside the allowance the rules announced.
   */
  extend_deadline: ({deadline, moved_to, reason}: {deadline: Deadline, moved_to: u64, reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a extend_schedule transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Gives several deadlines more time at once, under one signature.
   */
  extend_schedule: ({moves, reason}: {moves: Array<DeadlineMove>, reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a extension_usage transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * What one deadline has spent of its announced allowance.
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
   */
  open_settlement: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a sweep_unclaimed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns a position that never had a winner.
   */
  sweep_unclaimed: ({track, rank}: {track: string, rank: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a top_vote_weight transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The largest total any project holds.
   */
  top_vote_weight: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a add_collaborator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds a helper who can work through the application queue.
   */
  add_collaborator: ({collaborator}: {collaborator: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a approve_no_award transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds a judge's signature to that move.
   */
  approve_no_award: ({judge, track}: {judge: string, track: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a available_judges transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * How many judges are left to score a project, after recusals.
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
   */
  finalize_results: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a pause_settlement transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Holds the money where it is, with a reason.
   */
  pause_settlement: ({reason}: {reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a required_funding transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * What has to be in the vault before the hackathon may open: the prize
   * table plus the platform's cut.
   */
  required_funding: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a resolve_no_award transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Settles the move, one way or the other.
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
   */
  open_cancellation: ({reason}: {reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a resume_settlement transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lets the money move again.
   */
  resume_settlement: ({reason}: {reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a sponsor_track_ids transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Every sponsored track's name, in the order they were asked for.
   */
  sponsor_track_ids: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a sponsorship_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * How many contributions this hackathon has taken.
   */
  sponsorship_count: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a publish_score_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Seals every scorecard behind one digest.
   */
  publish_score_root: ({root}: {root: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a reject_application transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Keeps someone out, on the record.
   */
  reject_application: ({reviewer, applicant, reason}: {reviewer: string, applicant: string, reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a approve_application transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lets someone in.
   */
  approve_application: ({reviewer, applicant}: {reviewer: string, applicant: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a publish_ballot_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Seals every community ballot behind one digest.
   */
  publish_ballot_root: ({root}: {root: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a reject_applications transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Turns a whole queue away, against one written reason.
   */
  reject_applications: ({reviewer, applicants, reason}: {reviewer: string, applicants: Array<string>, reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a remove_collaborator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Removes a helper.
   */
  remove_collaborator: ({collaborator}: {collaborator: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a settle_platform_fee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Sends the platform its cut, once.
   */
  settle_platform_fee: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a approve_applications transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lets a whole queue in, on one signature.
   */
  approve_applications: ({reviewer, applicants}: {reviewer: string, applicants: Array<string>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a approve_cancellation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds a judge's signature to that move.
   */
  approve_cancellation: ({judge}: {judge: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a resolve_cancellation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Stops the hackathon and sends the pool back along the declared route.
   */
  resolve_cancellation: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a invalidate_submission transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Rules an entry out of the running, on the record.
   */
  invalidate_submission: ({team_id, reason}: {team_id: u32, reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a open_disqualification transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens a case for removing an entry, on the record.
   */
  open_disqualification: ({team_id, reason}: {team_id: u32, reason: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_platform_fee_settled transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether that cut has left the vault.
   */
  is_platform_fee_settled: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a approve_disqualification transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds a judge's signature to the case.
   */
  approve_disqualification: ({judge, team_id}: {judge: string, team_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a resolve_disqualification transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Settles the case, one way or the other.
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
      new ContractSpec([ "AAAAAQAAADhUaGUgcGVvcGxlIHJ1bm5pbmcgYSBoYWNrYXRob24gZnJvbSB0aGUgb3JnYW5pemluZyBzaWRlLgAAAAAAAAAOT3JnYW5pemluZ1RlYW0AAAAAAAIAAACOSGVscGVycyB3aG8gbWF5IHJldmlldyByZWdpc3RyYXRpb24gYXBwbGljYXRpb25zLiBDaGFuZ2VzIHRvIHRoaXMgbGlzdAphcmUgcmVjb3JkZWQsIHNvIHRoZSBwcm9vZiBwYWdlIGNhbiBzaG93IHdobyB3YXMgYWxsb3dlZCB0byBhZG1pdCB3aG9tLgAAAAAADWNvbGxhYm9yYXRvcnMAAAAAAAPqAAAAEwAAAEdUaGUgYWRkcmVzcyB0aGF0IGNyZWF0ZWQgdGhlIGhhY2thdGhvbiBhbmQgaG9sZHMgZXZlcnkgb3JnYW5pemVyIHBvd2VyLgAAAAAJb3JnYW5pemVyAAAAAAAAEw==",
        "AAAAAwAAADlXaGF0IG9uZSBmaWVsZCBvZiBhIHN1Ym1pc3Npb24gaXMgd29ydGggdG8gdGhlIG9yZ2FuaXplci4AAAAAAAAAAAAACUZpZWxkUnVsZQAAAAAAAAMAAABxTmV2ZXIgYXNrZWQgZm9yLiBUaGUgZm9ybSBoYXMgbm8gYm94IGZvciBpdCBhbmQgbm90aGluZyBsYXRlciByZXBvcnRzIGl0CmFzIG1pc3NpbmcsIGJlY2F1c2UgaXQgd2FzIG5ldmVyIHdhbnRlZC4AAAAAAAAHVW5hc2tlZAAAAAAAAAAALk9mZmVyZWQsIGFuZCBhbiBlbnRyeSB3aXRob3V0IGl0IHN0aWxsIGNvdW50cy4AAAAAAAhPcHRpb25hbAAAAAEAAAAiQW4gZW50cnkgd2l0aG91dCBpdCBpcyBpbmNvbXBsZXRlLgAAAAAACFJlcXVpcmVkAAAAAg==",
        "AAAAAQAAACtBIHRlYW0ncyBlbnRyeSwgYXMgdGhlIGNvbnRyYWN0IHJlY29yZHMgaXQuAAAAAAAAAAAKU3VibWlzc2lvbgAAAAAACAAAAEtEaWdlc3Qgb2YgdGhlIG1ldGFkYXRhLCBjb21wdXRlZCBvdmVyIHRoZSBmaWVsZHMgb2YKW2BTdWJtaXNzaW9uTWV0YWRhdGFgXS4AAAAADW1ldGFkYXRhX2hhc2gAAAAAAAPuAAAAIAAAAFJEaWdlc3Qgb2YgdGhlIHdyaXR0ZW4gcmVhc29uIHdoZW4gYSBzdWJtaXNzaW9uIGlzIHJ1bGVkIG91dDsgYWxsIHplcm9lcwpvdGhlcndpc2UuAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAAAAAAGc3RhdHVzAAAAAAfQAAAAEFN1Ym1pc3Npb25TdGF0dXMAAAAdV2hlbiB0aGUgZW50cnkgZmlyc3QgYXJyaXZlZC4AAAAAAAAMc3VibWl0dGVkX2F0AAAABgAAAB9UaGUgdGVhbSB0aGlzIGVudHJ5IGJlbG9uZ3MgdG8uAAAAAAR0ZWFtAAAABAAAABlUaGUgdHJhY2sgaXQgY29tcGV0ZXMgaW4uAAAAAAAABXRyYWNrAAAAAAAAEQAAABhXaGVuIGl0IHdhcyBsYXN0IGVkaXRlZC4AAAAKdXBkYXRlZF9hdAAAAAAABgAAACNXaGVyZSB0aGF0IG1ldGFkYXRhIGNhbiBiZSBmZXRjaGVkLgAAAAADdXJpAAAAABA=",
        "AAAAAwAAACJXaGV0aGVyIGEgc3VibWlzc2lvbiBzdGlsbCBjb3VudHMuAAAAAAAAAAAAEFN1Ym1pc3Npb25TdGF0dXMAAAADAAAAD0luIHRoZSBydW5uaW5nLgAAAAAFVmFsaWQAAAAAAAAAAAAAZVJ1bGVkIG91dCBkdXJpbmcgdGhlIHNjcmVlbmluZyByb3VuZC4gVGhlIHByb2plY3Qga2VlcHMgaXRzIHBhZ2UgYW5kIGl0cwpyZWFzb247IGl0IGlzIG5ldmVyIGRlbGV0ZWQuAAAAAAAAC0ludmFsaWRhdGVkAAAAAAEAAABIUmVtb3ZlZCBhZnRlciB0aGUgc2NyZWVuaW5nIHJvdW5kLCB0aHJvdWdoIHRoZSBkaXNxdWFsaWZpY2F0aW9uIHByb2Nlc3MuAAAADERpc3F1YWxpZmllZAAAAAI=",
        "AAAAAQAAAC1FdmVyeXRoaW5nIGEgdGVhbSB3cml0ZXMgYWJvdXQgdGhlaXIgcHJvamVjdC4AAAAAAAAAAAAAElN1Ym1pc3Npb25NZXRhZGF0YQAAAAAACgAAACtEZW1vIHZpZGVvLCBub3JtYWxseSBhIFlvdVR1YmUgb3IgTG9vbSBVUkwuAAAAAA5kZW1vX3ZpZGVvX3VybAAAAAAAEAAAADNUaGUgY29udHJhY3QgdGhpcyBwcm9qZWN0IGRlcGxveWVkLCBhcyBhIGBD4oCmYCBpZC4AAAAAEWRlcGxveWVkX2NvbnRyYWN0AAAAAAAAEAAAABJUaGUgZnVsbCB3cml0ZSB1cC4AAAAAAAtkZXNjcmlwdGlvbgAAAAAQAAAAN0EgZGVwbG95ZWQgaW5zdGFuY2UgYSBqdWRnZSBjYW4gb3BlbiBhbmQgY2xpY2sgdGhyb3VnaC4AAAAACGxpdmVfdXJsAAAAEAAAAB9XaGVyZSB0aGUgbG9nbyBpbWFnZSBpcyBzdG9yZWQuAAAAAAhsb2dvX3VyaQAAABAAAAAmVGhlIHByb2plY3QgbmFtZSBzaG93biBpbiB0aGUgZ2FsbGVyeS4AAAAAAARuYW1lAAAAEAAAAB9XaGVyZSB0aGUgc2xpZGUgZGVjayBpcyBzdG9yZWQuAAAAAA5waXRjaF9kZWNrX3VybAAAAAAAEAAAAClTb3VyY2UgcmVwb3NpdG9yeSwgbm9ybWFsbHkgYSBHaXRIdWIgVVJMLgAAAAAAAA5yZXBvc2l0b3J5X3VybAAAAAAAEAAAACFPbmUgbGluZSBkZXNjcmliaW5nIHdoYXQgaXQgZG9lcy4AAAAAAAAHc3VtbWFyeQAAAAAQAAAAI1RoZSB0cmFjayB0aGlzIHByb2plY3QgY29tcGV0ZXMgaW4uAAAAAAV0cmFjawAAAAAAABE=",
        "AAAAAQAAAEJBIGNhc2UgZm9yIHJlbW92aW5nIGFuIGVudHJ5IGFmdGVyIHRoZSBzY3JlZW5pbmcgcm91bmQgaGFzIGNsb3NlZC4AAAAAAAAAAAAURGlzcXVhbGlmaWNhdGlvbkNhc2UAAAAHAAAARERpZ2VzdCBvZiB0aGUgdGVhbSdzIHdyaXR0ZW4gYW5zd2VyOyBhbGwgemVyb2VzIHVudGlsIHRoZXkgZmlsZSBvbmUuAAAABmFwcGVhbAAAAAAD7gAAACAAAAAkV2hlbiB0aGV5IGZpbGVkIGl0LCB6ZXJvIHVudGlsIHRoZW4uAAAAC2FwcGVhbGVkX2F0AAAAAAYAAAAcSG93IG1hbnkganVkZ2VzIGhhdmUgc2lnbmVkLgAAAAlhcHByb3ZhbHMAAAAAAAAEAAAAQVdoZW4gaXQgd2FzIG9wZW5lZCwgd2hpY2ggaXMgd2hlcmUgdGhlIGFwcGVhbCB3aW5kb3cgY291bnRzIGZyb20uAAAAAAAACW9wZW5lZF9hdAAAAAAAAAYAAAAdRGlnZXN0IG9mIHRoZSB3cml0dGVuIHJlYXNvbi4AAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAADFXaGV0aGVyIGl0IGhhcyBiZWVuIHNldHRsZWQgb25lIHdheSBvciB0aGUgb3RoZXIuAAAAAAAACHJlc29sdmVkAAAAAQAAAB5UaGUgZW50cnkgdGhlIGNhc2UgaXMgYWdhaW5zdC4AAAAAAAR0ZWFtAAAABA==",
        "AAAAAQAAAENXaGF0IGEgdGVhbSBoYXMgdG8gc3VwcGx5IGJlZm9yZSB0aGVpciBwcm9qZWN0IGNvdW50cyBhcyBzdWJtaXR0ZWQuAAAAAAAAAAAWU3VibWlzc2lvblJlcXVpcmVtZW50cwAAAAAABQAAABJBIGRlbW8gdmlkZW8gbGluay4AAAAAAApkZW1vX3ZpZGVvAAAAAAfQAAAACUZpZWxkUnVsZQAAAAAAACxUaGUgY29udHJhY3QgdGhlIHByb2plY3QgZGVwbG95ZWQsIGFzIGFuIGlkLgAAABFkZXBsb3llZF9jb250cmFjdAAAAAAAB9AAAAAJRmllbGRSdWxlAAAAAAAAL0EgbGluayB0byBhIGRlcGxveWVkIGluc3RhbmNlIGEganVkZ2UgY2FuIG9wZW4uAAAAAAhsaXZlX3VybAAAB9AAAAAJRmllbGRSdWxlAAAAAAAADUEgc2xpZGUgZGVjay4AAAAAAAAKcGl0Y2hfZGVjawAAAAAH0AAAAAlGaWVsZFJ1bGUAAAAAAAAZQSBzb3VyY2UgcmVwb3NpdG9yeSBsaW5rLgAAAAAAAApyZXBvc2l0b3J5AAAAAAfQAAAACUZpZWxkUnVsZQAAAA==",
        "AAAAAwAAAEtIb3cgYSBjb250cmlidXRpb24gYWltZWQgYXQgYSB3aG9sZSB0cmFjayBpcyBkaXZpZGVkIGJldHdlZW4gaXRzIHBvc2l0aW9ucy4AAAAAAAAAAAVTcGxpdAAAAAAAAAIAAAAiVGhlIHNhbWUgYW1vdW50IHRvIGV2ZXJ5IHBvc2l0aW9uLgAAAAAABkV2ZW5seQAAAAAAAAAAADVJbiBwcm9wb3J0aW9uIHRvIHdoYXQgZWFjaCBwb3NpdGlvbiBpcyBhbHJlYWR5IHdvcnRoLgAAAAAAAAdCeVdvcnRoAAAAAAE=",
        "AAAAAQAAAEVPbmUgY29udHJpYnV0aW9uIHRvIHRoZSBwcml6ZSBwb29sLCBhbmQgdGhlIHBvc2l0aW9uIGl0IHdhcyBhaW1lZCBhdC4AAAAAAAAAAAAAC1Nwb25zb3JzaGlwAAAAAAcAAABBV2hhdCByZWFjaGVzIHRoZSB3aW5uZXIsIGluIHRoZSBzbWFsbGVzdCB1bml0IG9mIHRoZSBwcml6ZSBhc3NldC4AAAAAAAAGYW1vdW50AAAAAAALAAAAD1doZW4gaXQgbGFuZGVkLgAAAAACYXQAAAAAAAYAAABFV2hhdCB0aGUgcGxhdGZvcm0gdGFrZXMgb24gdG9wLCBwYWlkIGJ5IHRoZSBzcG9uc29yIGluIHRoZSBzYW1lIGNhbGwuAAAAAAAAA2ZlZQAAAAALAAAAwkRpZ2VzdCBvZiB3aG8gdGhlIHNwb25zb3IgaXMgYW5kIHdoYXRldmVyIHRoZXkgd2FudGVkIHNhaWQgYmVzaWRlIHRoZWlyCm5hbWUsIHdoaWNoIGxpdmVzIG9mZiBjaGFpbiBmb3IgdGhlIHNhbWUgcmVhc29uIHRoZSBoYWNrYXRob24ncyBvd24KZGVzY3JpcHRpb24gZG9lczogYSBsb2dvIGFuZCBhIHNlbnRlbmNlIGFyZSBub3QgcnVsZXMuAAAAAAAEbm90ZQAAA+4AAAAgAAAAWFRoZSByYW5rIHdpdGhpbiB0aGF0IHRyYWNrLCBvciB6ZXJvIGZvciBhIGNvbnRyaWJ1dGlvbiBzcHJlYWQgb3ZlcgpldmVyeSBwb3NpdGlvbiBpbiBpdC4AAAAEcmFuawAAAAQAAABaV2hvIHBhaWQuIFRoZSBhZGRyZXNzIHRoYXQgc2lnbmVkLCBzbyBub2JvZHkgY2FuIGJlIGNyZWRpdGVkIHdpdGggbW9uZXkKdGhleSBkaWQgbm90IHNlbmQuAAAAAAAHc3BvbnNvcgAAAAATAAAAK1RoZSB0cmFjayB3aG9zZSBwb3NpdGlvbiB0aGlzIHdhcyBhaW1lZCBhdC4AAAAABXRyYWNrAAAAAAAAEQ==",
        "AAAAAwAAAD5XaGVyZSBhIHNwb25zb3IncyByZXF1ZXN0IGZvciBhIHRyYWNrIG9mIHRoZWlyIG93biBoYXMgZ290IHRvLgAAAAAAAAAAAAtUcmFja1N0YXR1cwAAAAADAAAAJEZ1bmRlZCBhbmQgd2FpdGluZyBvbiB0aGUgb3JnYW5pemVyLgAAAAhQcm9wb3NlZAAAAAAAAABCUnVubmluZy4gVGVhbXMgbWF5IGVudGVyIGl0IGFuZCBpdCBpcyByYW5rZWQgd2l0aCBldmVyeXRoaW5nIGVsc2UuAAAAAAAIQWNjZXB0ZWQAAAABAAAAOVR1cm5lZCBkb3duLCBhbmQgdGhlIG1vbmV5IGFscmVhZHkgYmFjayB3aXRoIHRoZSBzcG9uc29yLgAAAAAAAAhEZWNsaW5lZAAAAAI=",
        "AAAAAQAAACtBIGNvbXBldGl0aW9uIHRyYWNrIGEgc3BvbnNvciBwYWlkIHRvIG9wZW4uAAAAAAAAAAAMU3BvbnNvclRyYWNrAAAABwAAABVXaGVuIGl0IHdhcyBwcm9wb3NlZC4AAAAAAAACYXQAAAAAAAYAAABCV2hhdCB0aGUgcGxhdGZvcm0gdGFrZXMgb24gdGhpcyB0cmFjaywgcGFpZCBieSB0aGUgc3BvbnNvciBvbiB0b3AuAAAAAAADZmVlAAAAAAsAAABVVGhlIHRyYWNrJ3MgaWRlbnRpZmllciwgdW5pcXVlIGFjcm9zcyB0aGUgZnJvemVuIHRyYWNrcyBhbmQgdGhlCnNwb25zb3JlZCBvbmVzIGFsaWtlLgAAAAAAAAJpZAAAAAAAEQAAAEFEaWdlc3Qgb2YgdGhlIHNwb25zb3IncyBuYW1lLCBsb2dvIGFuZCB3aGF0ZXZlciB0aGV5IHdhbnRlZCBzYWlkLgAAAAAAAARub3RlAAAD7gAAACAAAAAfV2hvIGFza2VkIGZvciBpdCBhbmQgZnVuZGVkIGl0LgAAAAAHc3BvbnNvcgAAAAATAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAALVHJhY2tTdGF0dXMAAAAAt1RoZSBwb3NpdGlvbnMgaXQgcGF5cy4gRWFjaCBvbmUgbmFtZXMgdGhpcyB0cmFjaywgc28gYSB0aWVyIHJlYWQgb3V0IG9mCmhlcmUgaXMgdGhlIHNhbWUgc2hhcGUgYXMgYSB0aWVyIHJlYWQgb3V0IG9mIHRoZSBmcm96ZW4gdGFibGUgYW5kIGV2ZXJ5CnJlYWRlciBkb3duc3RyZWFtIGNhbiB0cmVhdCB0aGVtIGFsaWtlLgAAAAAFdGllcnMAAAAAAAPqAAAH0AAAAAlQcml6ZVRpZXIAAAA=",
        "AAAAAwAAADRXaGVyZSBtb25leSBnb2VzIHdoZW4gaXQgaXMgbm90IGF3YXJkZWQgdG8gYSB3aW5uZXIuAAAAAAAAAAtSZWZ1bmRSb3V0ZQAAAAADAAAAIEJhY2sgdG8gdGhlIG9yZ2FuaXplcidzIGFkZHJlc3MuAAAACU9yZ2FuaXplcgAAAAAAAAAAAADEQmFjayB0byB3aG9ldmVyIGRlcG9zaXRlZCBpdCwgaW4gcHJvcG9ydGlvbiB0byB3aGF0IHRoZXkgcHV0IGluLiBUaGlzIGlzCnRoZSByb3V0ZSBhIHNwb25zb3Igd2FudHMsIGJlY2F1c2UgaXQgcmV0dXJucyB0aGVpciBjb250cmlidXRpb24gdG8gdGhlbQpyYXRoZXIgdGhhbiB0byB0aGUgb3JnYW5pemVyIHdobyBzcGVudCBub25lIG9mIGl0LgAAAApEZXBvc2l0b3JzAAAAAAABAAAANFNwcmVhZCBhY3Jvc3MgdGhlIHRyYWNrcyB0aGF0IGRpZCBhd2FyZCB0aGVpciBwcml6ZS4AAAAPUmVtYWluaW5nVHJhY2tzAAAAAAI=",
        "AAAAAgAAACFXaGVuIHRoZSB2YXVsdCBpcyBhbGxvd2VkIHRvIHBheS4AAAAAAAAAAAAADlNldHRsZW1lbnRNb2RlAAAAAAACAAAAAAAAAIRQYXltZW50IHJ1bnMgdGhlIG1vbWVudCB0aGUgcmVzdWx0IGlzIGZpbmFsLiBSaWdodCBmb3IgYSBzbWFsbCBldmVudAp3aGVyZSB0aGUgb3BlcmF0aW9uYWwgd2luIGlzIHRoYXQgdGhlIG1vbmV5IGFycml2ZXMgaW4gbWludXRlcy4AAAAJSW1tZWRpYXRlAAAAAAAAAQAAAMpQYXltZW50IHdhaXRzIGZvciB0aGlzIG1hbnkgc2Vjb25kcywgZHVyaW5nIHdoaWNoIGEgcHJlIGRlY2xhcmVkCmF1dGhvcml0eSBjYW4gcGF1c2UgaXQgd2l0aCBhIHJlYXNvbi4gU2NvcmVzIGNhbiBuZXZlciBjaGFuZ2UgZWl0aGVyCndheTsgdGhlIHdpbmRvdyBidXlzIHRpbWUgdG8gc3RvcCBhIHBheW91dCwgbm90IHRvIHJld3JpdGUgYSByZXN1bHQuAAAAAAAMU2FmZXR5V2luZG93AAAAAQAAAAY=",
        "AAAAAQAAADtFdmVyeSBwb3dlciB0aGUgb3JnYW5pemVyIGhvbGRzIGFmdGVyIHRoZSBydWxlcyBhcmUgbG9ja2VkLgAAAAAAAAAAEERpc2NyZXRpb25Qb2xpY3kAAAAIAAAASlNlY29uZHMgYSB0ZWFtIGhhcyB0byBhbnN3ZXIgYSBkaXNxdWFsaWZpY2F0aW9uIGJlZm9yZSBpdCBjYW4gYmUKcmVzb2x2ZWQuAAAAAAANYXBwZWFsX3dpbmRvdwAAAAAAAAYAAAA6V2hlcmUgdGhlIHByaXplIHBvb2wgZ29lcyB3aGVuIHRoZSBoYWNrYXRob24gaXMgY2FuY2VsbGVkLgAAAAAAE2NhbmNlbGxhdGlvbl9yZWZ1bmQAAAAH0AAAAAtSZWZ1bmRSb3V0ZQAAAACsSnVkZ2VzIHdobyBtdXN0IHNpZ24gYmVmb3JlIGEgY2FuY2VsbGF0aW9uIHRha2VzIGVmZmVjdCBvbmNlIHN1Ym1pc3Npb24KaGFzIG9wZW5lZC4gQmVmb3JlIHRoYXQgcG9pbnQgdGhlIG9yZ2FuaXplciBjYW4gY2FuY2VsIGFsb25lLCBiZWNhdXNlCm5vYm9keSBoYXMgc3BlbnQgYW55dGhpbmcgeWV0LgAAABZjYW5jZWxsYXRpb25fdGhyZXNob2xkAAAAAAAEAAAAPEp1ZGdlcyB3aG8gbXVzdCBzaWduIGJlZm9yZSBhIGRpc3F1YWxpZmljYXRpb24gdGFrZXMgZWZmZWN0LgAAABpkaXNxdWFsaWZpY2F0aW9uX3RocmVzaG9sZAAAAAAABAAAADxXaGVyZSBhIHRyYWNrJ3MgcHJpemUgZ29lcyB3aGVuIHRoZSB0cmFjayBkZWNsYXJlcyBubyBhd2FyZC4AAAAPbm9fYXdhcmRfcmVmdW5kAAAAB9AAAAALUmVmdW5kUm91dGUAAAAARlNlY29uZHMgYSB3aW5uZXIgaGFzIHRvIGNsYWltIGEgcHJpemUgYmVmb3JlIHRoZSByZWZ1bmQgcm91dGUgYXBwbGllcy4AAAAAABJwcml6ZV9jbGFpbV9wZXJpb2QAAAAAAAYAAAAXV2hlbiB0aGUgdmF1bHQgbWF5IHBheS4AAAAACnNldHRsZW1lbnQAAAAAB9AAAAAOU2V0dGxlbWVudE1vZGUAAAAAAD1XaGVyZSBhbiB1bmNsYWltZWQgcHJpemUgZ29lcyBvbmNlIHRoZSBjbGFpbSBwZXJpb2QgcnVucyBvdXQuAAAAAAAAEHVuY2xhaW1lZF9yZWZ1bmQAAAfQAAAAC1JlZnVuZFJvdXRlAA==",
        "AAAAAwAAAENXaG8gbWF5IHJlYWQgdGhlIHN1Ym1pdHRlZCBwcm9qZWN0cyB3aGlsZSB0aGUgaGFja2F0aG9uIGlzIHJ1bm5pbmcuAAAAAAAAAAARUHJvamVjdFZpc2liaWxpdHkAAAAAAAADAAAAgkFueW9uZSBjYW4gYnJvd3NlIHRoZSBnYWxsZXJ5LCBzaWduZWQgaW4gb3Igbm90LiBUaGlzIGlzIHRoZSBkZWZhdWx0IGFuZAp0aGUgc2V0dGluZyB0aGF0IG1ha2VzIGEgaGFja2F0aG9uIGl0cyBvd24gYWR2ZXJ0aXNlbWVudC4AAAAAAAZQdWJsaWMAAAAAAAAAAAC/T25seSBhcHByb3ZlZCBwYXJ0aWNpcGFudHMgb2YgdGhpcyBoYWNrYXRob24gY2FuIHNlZSB0aGUgcHJvamVjdHMuCkEgY2xvc2VkIGV2ZW50IHN0aWxsIG5lZWRzIHRoaXMgbXVjaCwgYmVjYXVzZSBhIGNvbW11bml0eSB2b3RlIGFza3MKcGFydGljaXBhbnRzIHRvIGp1ZGdlIHdvcmsgdGhleSBoYXZlIHRvIGJlIGFibGUgdG8gb3Blbi4AAAAADFBhcnRpY2lwYW50cwAAAAEAAACoT25seSB0aGUgb3JnYW5pemluZyB0ZWFtIGFuZCB0aGUganVkZ2VzIGNhbiBzZWUgdGhlIHByb2plY3RzLiBTdWl0YWJsZQpmb3IgYSBjb3Jwb3JhdGUgb3IgaW50ZXJuYWwgZXZlbnQsIGFuZCBpbmNvbXBhdGlibGUgd2l0aCBhIGNvbW11bml0eQp2b3RlIGZvciB0aGUgb2J2aW91cyByZWFzb24uAAAAClJlc3RyaWN0ZWQAAAAAAAI=",
        "AAAAAQAAAEpXaGV0aGVyIG91dHNpZGUgbW9uZXkgbWF5IGpvaW4gdGhlIHByaXplIHBvb2wgYWZ0ZXIgdGhlIGxvY2ssIGFuZCBob3cgZmFyLgAAAAAAAAAAABFTcG9uc29yc2hpcFBvbGljeQAAAAAAAAQAAABCVGhlIHRyYWNrIGEgc3BvbnNvciB0cmFjayB0YWtlcyBpdHMgcnVicmljICoqYW5kIGl0cyBiZW5jaCoqIGZyb20uAAAAAAAMYm9ycm93c19mcm9tAAAAEQAAAK9Ib3cgbWFueSB0cmFja3Mgc3BvbnNvcnMgbWF5IG9wZW4gYmV0d2VlbiB0aGVtLiBaZXJvIGZvcmJpZHMgdGhlbSwgYW5kCmlzIHRoZSBzZXR0aW5nIGZvciBhbiBvcmdhbml6ZXIgd2hvIHdhbnRzIGhlbHAgd2l0aCB0aGUgcHJpemUgYnV0IG5vdAp3aXRoIHRoZSBzaGFwZSBvZiB0aGUgY29tcGV0aXRpb24uAAAAAA5tYXhfbmV3X3RyYWNrcwAAAAAABAAAACpUaGUgbGVhc3QgYSBzaW5nbGUgY29udHJpYnV0aW9uIG1heSBjYXJyeS4AAAAAAAptaW5fYm91bnR5AAAAAAALAAAASFdoZXRoZXIgYW55b25lIG1heSBhZGQgdG8gYSBwb3NpdGlvbiB0aGF0IGlzIGFscmVhZHkgaW4gdGhlIHByaXplIHRhYmxlLgAAAA90b3BfdXBzX2FsbG93ZWQAAAAAAQ==",
        "AAAAAwAAAD9XaG8gZ2V0cyBpbnRvIHRoZSBoYWNrYXRob24sIGFuZCB3aGV0aGVyIGFueWJvZHkgaGFzIHRvIHNheSBzby4AAAAAAAAAABJSZWdpc3RyYXRpb25Qb2xpY3kAAAAAAAIAAAA8RXZlcnkgYXBwbGljYXRpb24gd2FpdHMgZm9yIHRoZSBvcmdhbml6ZXIgb3IgYSBjb2xsYWJvcmF0b3IuAAAACFJldmlld2VkAAAAAAAAADVBbnlib2R5IHdobyBhcHBsaWVzIGlzIGluIGZyb20gdGhlIG1vbWVudCB0aGV5IGFwcGx5LgAAAAAAAARPcGVuAAAAAQ==",
        "AAAAAQAAAExXaGF0IHRoZSBwbGF0Zm9ybSB0YWtlcyBmb3IgY2FycnlpbmcgdGhlIGV2ZW50LCBmcm96ZW4gd2l0aCBldmVyeXRoaW5nIGVsc2UuAAAAAAAAAAtQbGF0Zm9ybUZlZQAAAAACAAAAX0Jhc2lzIHBvaW50cyBvZiB0aGUgcHJpemUgdGFibGUuIFplcm8gaXMgYSByZWFsIGFuc3dlciBhbmQgdGhlIGNvbW1vbiBvbmUKZm9yIGNvbW11bml0eSBldmVudHMuAAAAAANicHMAAAAABAAAAM9XaGVyZSBpdCBnb2VzLiBOYW1lZCBldmVuIGF0IGEgemVybyByYXRlLCBiZWNhdXNlIGFuIGFkZHJlc3MgdGhhdCBvbmx5CmFwcGVhcnMgYXQgc29tZSByYXRlcyBpcyBhIGZpZWxkIHJlYWRlcnMgaGF2ZSB0byBjaGVjayB0aGUgcmF0ZSB0bwppbnRlcnByZXQsIGFuZCBldmVyeSBvdGhlciBhZGRyZXNzIGluIHRoaXMgZG9jdW1lbnQgaXMgdW5jb25kaXRpb25hbC4AAAAACWNvbGxlY3RvcgAAAAAAABM=",
        "AAAAAQAAABhIb3cgdGVhbXMgbWF5IGJlIGZvcm1lZC4AAAAAAAAAClRlYW1Qb2xpY3kAAAAAAAIAAAA4VGhlIG1vc3QgcGVvcGxlIG9uZSB0ZWFtIG1heSBob2xkLCBjb3VudGluZyB0aGUgY2FwdGFpbi4AAAAIbWF4X3NpemUAAAAEAAAANFdoZXRoZXIgb25lIHBlcnNvbiBtYXkgYmVsb25nIHRvIG1vcmUgdGhhbiBvbmUgdGVhbS4AAAASbXVsdGlfdGVhbV9hbGxvd2VkAAAAAAAB",
        "AAAAAQAAAG1Ib3cgdGhlIGZpbmFsIHNjb3JlIGlzIHNwbGl0IGJldHdlZW4gdGhlIGp1ZGdlcyBhbmQgdGhlIGNyb3dkLCBhbmQgd2hhdCBvbmUKd2FsbGV0IGdldHMgdG8gZG8gd2l0aCBpdHMgc2hhcmUuAAAAAAAAAAAAAApWb3RlUG9saWN5AAAAAAAEAAAAOlRoZSBjb21tdW5pdHkncyBzaGFyZSBvZiB0aGUgZmluYWwgc2NvcmUsIGluIGJhc2lzIHBvaW50cy4AAAAAAA1jb21tdW5pdHlfYnBzAAAAAAAABAAAADZUaGUganVkZ2VzJyBzaGFyZSBvZiB0aGUgZmluYWwgc2NvcmUsIGluIGJhc2lzIHBvaW50cy4AAAAAAAlqdWRnZV9icHMAAAAAAAAEAAAAMlRoZSBtb3N0IHByb2plY3RzIG9uZSBiYWxsb3QgbWF5IGJlIHNwcmVhZCBhY3Jvc3MuAAAAAAALbWF4X2Nob2ljZXMAAAAABAAAAERIb3cgbWFueSBwb2ludHMgb25lIHdhbGxldCBoYXMgdG8gcGxhY2UsIGFsbCBvZiB3aGljaCBpdCBtdXN0IHNwZW5kLgAAAAVwb3dlcgAAAAAAAAQ=",
        "AAAAAgAAADJIb3cganVkZ2VzIHNlYWwgdGhlaXIgc2NvcmVjYXJkcyB1bnRpbCB0aGUgcmV2ZWFsLgAAAAAAAAAAAAtKdWRnaW5nTW9kZQAAAAACAAAAAQAAAMtUaGUganVkZ2Ugc2lnbnMgYSBzY29yZWNhcmQgb2ZmIGNoYWluIGluIGEgc2luZ2xlIGFjdGlvbiwgcGF5aW5nIG5vIGZlZQphbmQgbmV2ZXIgaGF2aW5nIHRvIGNvbWUgYmFjay4gVGhlIGNvbGxlY3Rpb24gc2VydmljZSBwdWJsaXNoZXMgYSBNZXJrbGUKcm9vdCB3aGVuIHRoZSB3aW5kb3cgY2xvc2VzLCBhbmQgdGhlIGxlYXZlcyBhdCB0aGUgcmV2ZWFsLgAAAAAERWFzeQAAAAEAAAATAAAAAAAAAHVUaGUganVkZ2Ugd3JpdGVzIGEgY29tbWl0bWVudCBvbiBjaGFpbiB0aGVtc2VsdmVzIGFuZCBvcGVucyBpdAp0aGVtc2VsdmVzLiBUd28gdHJhbnNhY3Rpb25zLCBubyB0cnVzdCBpbiBhbnkgc2VydmljZS4AAAAAAAAGU3RyaWN0AAA=",
        "AAAAAgAAAERPbmUgc3RlcCBpbiB0aGUgY2hhaW4gdGhhdCBzZXBhcmF0ZXMgdHdvIHByb2plY3RzIG9uIHRoZSBzYW1lIHNjb3JlLgAAAAAAAAAMVGllQnJlYWtSdWxlAAAABAAAAAAAAABaVGhlIGhpZ2hlciBqdWRnZSBzY29yZSB3aW5zLiBVc2VmdWwgd2hlbiB0aGUgY29tbXVuaXR5IHNoYXJlIGlzIHdoYXQKcHVsbGVkIHRoZSB0d28gbGV2ZWwuAAAAAAAKSnVkZ2VTY29yZQAAAAAAAQAAANBUaGUgaGlnaGVyIHNjb3JlIG9uIG9uZSBuYW1lZCBjcml0ZXJpb24gd2lucywgZm9yIGV4YW1wbGUgdGhlIHRlY2huaWNhbApvbmUuIFRoZSBjcml0ZXJpb24gaGFzIHRvIGV4aXN0IGluIGV2ZXJ5IHRyYWNrLCBzaW5jZSBhIHJ1bGUgdGhhdCBjYW5ub3QKYmUgYXBwbGllZCBpbiBzb21lIHRyYWNrIGxlYXZlcyB0aGF0IHRyYWNrIHdpdGhvdXQgYSB0aWUgYnJlYWsuAAAACUNyaXRlcmlvbgAAAAAAAAEAAAARAAAAAAAAACBUaGUgaGlnaGVyIGNvbW11bml0eSBzY29yZSB3aW5zLgAAAA5Db21tdW5pdHlTY29yZQAAAAAAAAAAAIlUaGUgcHJvamVjdCBzdWJtaXR0ZWQgZmlyc3Qgd2lucy4gVGhpcyBpcyB0aGUgb25seSBydWxlIGd1YXJhbnRlZWQgdG8Kc2VwYXJhdGUgYW55IHR3byBwcm9qZWN0cywgd2hpY2ggaXMgd2h5IGEgY2hhaW4gaGFzIHRvIGVuZCB3aXRoIGl0LgAAAAAAAA9TdWJtaXNzaW9uT3JkZXIA",
        "AAAAAQAAADdBIGNvbXBldGl0aW9uIHRyYWNrIHdpdGggaXRzIG93biBydWJyaWMgYW5kIHByaXplIGxpbmUuAAAAAAAAAAAFVHJhY2sAAAAAAAADAAAAOVRoZSBydWJyaWMsIHdob3NlIHdlaWdodHMgYWRkIHVwIHRvIFtgV0VJR0hUX1RPVEFMX0JQU2BdLgAAAAAAAAhjcml0ZXJpYQAAA+oAAAfQAAAACUNyaXRlcmlvbgAAAAAAACpTdGFibGUgaWRlbnRpZmllciwgZm9yIGV4YW1wbGUgYHBheW1lbnRzYC4AAAAAAAJpZAAAAAAAEQAAAJ5XaGV0aGVyIHRoZSBvcmdhbml6ZXIgZGVjbGFyZWQsIGJlZm9yZSB0aGUgbG9jaywgdGhhdCB0aGlzIHRyYWNrIG1heSBlbmQKd2l0aG91dCBhd2FyZGluZyBpdHMgcHJpemUuIEEgdHJhY2sgd2l0aG91dCB0aGlzIGZsYWcgY2FuIG5ldmVyIGJlIGxlZnQKdW5wYWlkIGxhdGVyLgAAAAAAEG5vX2F3YXJkX2FsbG93ZWQAAAAB",
        "AAAAAQAAAChPbmUgbGluZSBvZiB0aGUgcnVicmljIGEganVkZ2UgZmlsbHMgaW4uAAAAAAAAAAlDcml0ZXJpb24AAAAAAAACAAAAPFN0YWJsZSBpZGVudGlmaWVyLCBmb3IgZXhhbXBsZSBgdGVjaG5pY2FsYCBvciBgc3RlbGxhcl91c2VgLgAAAAJpZAAAAAAAEQAAACpTaGFyZSBvZiB0aGUgdHJhY2sgc2NvcmUsIGluIGJhc2lzIHBvaW50cy4AAAAAAAp3ZWlnaHRfYnBzAAAAAAAE",
        "AAAAAQAAAEVPbmUgcGF5YWJsZSBwb3NpdGlvbiwgZm9yIGV4YW1wbGUgc2Vjb25kIHBsYWNlIGluIHRoZSBwYXltZW50cyB0cmFjay4AAAAAAAAAAAAACVByaXplVGllcgAAAAAAAAMAAAAvQW1vdW50IGluIHRoZSBzbWFsbGVzdCB1bml0IG9mIHRoZSBwcml6ZSBhc3NldC4AAAAABmFtb3VudAAAAAAACwAAACBPbmUgYmFzZWQgcmFuayB3aXRoaW4gdGhlIHRyYWNrLgAAAARyYW5rAAAABAAAACNUaGUgdHJhY2sgdGhpcyBwb3NpdGlvbiBiZWxvbmdzIHRvLgAAAAAFdHJhY2sAAAAAAAAR",
        "AAAAAQAAADNFdmVyeXRoaW5nIHRoYXQgZGVjaWRlcyB0aGUgb3V0Y29tZSBvZiBhIGhhY2thdGhvbi4AAAAAAAAAAAxDb25zdGl0dXRpb24AAAATAAAAL0V2ZXJ5IHBvd2VyIHRoZSBvcmdhbml6ZXIga2VlcHMgYWZ0ZXIgdGhlIGxvY2suAAAAAApkaXNjcmV0aW9uAAAAAAfQAAAAEERpc2NyZXRpb25Qb2xpY3kAAAAnSG93IGZhciB0aG9zZSBkZWFkbGluZXMgbWF5IGxhdGVyIG1vdmUuAAAAAApleHRlbnNpb25zAAAAAAfQAAAAD0V4dGVuc2lvblBvbGljeQAAAABEVmFsaWQgc2NvcmVjYXJkcyBhIHByb2plY3QgbmVlZHMgYmVmb3JlIHRoZSByZXN1bHQgY2FuIGJlIGZpbmFsaXplZC4AAAAManVkZ2VfcXVvcnVtAAAABAAAAC5BdXRob3JpemVkIGp1ZGdlcyBhbmQgdGhlaXIgdHJhY2sgYXNzaWdubWVudHMuAAAAAAAGanVkZ2VzAAAAAAPqAAAH0AAAAA9KdWRnZUFzc2lnbm1lbnQAAAAAK0hvdyBzY29yZWNhcmRzIGFyZSBzZWFsZWQgdW50aWwgdGhlIHJldmVhbC4AAAAADGp1ZGdpbmdfbW9kZQAAB9AAAAALSnVkZ2luZ01vZGUAAAAAPEhhc2ggb2YgdGhlIGRldGVybWluaXN0aWNhbGx5IHNlcmlhbGl6ZWQgb2ZmIGNoYWluIG1ldGFkYXRhLgAAAA1tZXRhZGF0YV9oYXNoAAAAAAAD7gAAACAAAAA7V2hhdCB0aGUgcGxhdGZvcm0gdGFrZXMsIGNoYXJnZWQgb24gdG9wIG9mIHRoZSB0YWJsZSBhYm92ZS4AAAAADHBsYXRmb3JtX2ZlZQAAB9AAAAALUGxhdGZvcm1GZWUAAAAAL1RoZSB0b2tlbiB0aGUgcHJpemUgaXMgZGVub21pbmF0ZWQgYW5kIHBhaWQgaW4uAAAAAAtwcml6ZV9hc3NldAAAAAATAAAAHFBheWFibGUgcG9zaXRpb25zIHBlciB0cmFjay4AAAALcHJpemVfdGllcnMAAAAD6gAAB9AAAAAJUHJpemVUaWVyAAAAAAAARldoZXRoZXIgYXBwbGljYXRpb25zIGFyZSByZXZpZXdlZCBvciBldmVyeWJvZHkgaXMgYWRtaXR0ZWQgb24gYXJyaXZhbC4AAAAAAAxyZWdpc3RyYXRpb24AAAfQAAAAElJlZ2lzdHJhdGlvblBvbGljeQAAAAAAGFRoZSBhbm5vdW5jZWQgZGVhZGxpbmVzLgAAAAhzY2hlZHVsZQAAB9AAAAAIU2NoZWR1bGUAAABEV2hldGhlciBvdXRzaWRlIG1vbmV5IG1heSBqb2luIHRoZSBwb29sIGFmdGVyIHRoZSBsb2NrLCBhbmQgaG93IGZhci4AAAALc3BvbnNvcnNoaXAAAAAH0AAAABFTcG9uc29yc2hpcFBvbGljeQAAAAAAADRXaGljaCBsaW5rcyBhIHRlYW0gaGFzIHRvIHN1cHBseSB3aXRoIHRoZWlyIHByb2plY3QuAAAAF3N1Ym1pc3Npb25fcmVxdWlyZW1lbnRzAAAAB9AAAAAWU3VibWlzc2lvblJlcXVpcmVtZW50cwAAAAAAGEhvdyB0ZWFtcyBtYXkgYmUgZm9ybWVkLgAAAAV0ZWFtcwAAAAAAB9AAAAAKVGVhbVBvbGljeQAAAAAAOFRoZSBjaGFpbiB0aGF0IHNlcGFyYXRlcyB0d28gcHJvamVjdHMgb24gdGhlIHNhbWUgc2NvcmUuAAAACXRpZV9icmVhawAAAAAAA+oAAAfQAAAADFRpZUJyZWFrUnVsZQAAAC1Db21wZXRpdGlvbiB0cmFja3MsIGVhY2ggd2l0aCBpdHMgb3duIHJ1YnJpYy4AAAAAAAAGdHJhY2tzAAAAAAPqAAAH0AAAAAVUcmFjawAAAAAAAC1Gb3JtYXQgdmVyc2lvbiwgc2VlIFtgQ09OU1RJVFVUSU9OX1ZFUlNJT05gXS4AAAAAAAAHdmVyc2lvbgAAAAAEAAAAOVdobyBtYXkgcmVhZCB0aGUgc3VibWl0dGVkIHByb2plY3RzIHdoaWxlIHRoZSBldmVudCBydW5zLgAAAAAAAAp2aXNpYmlsaXR5AAAAAAfQAAAAEVByb2plY3RWaXNpYmlsaXR5AAAAAAAAOkhvdyB0aGUgZmluYWwgc2NvcmUgaXMgc3BsaXQgYmV0d2VlbiBqdWRnZXMgYW5kIHRoZSBjcm93ZC4AAAAAAAR2b3RlAAAH0AAAAApWb3RlUG9saWN5AAA=",
        "AAAAAQAAADBBIGp1ZGdlIGFuZCB0aGUgdHJhY2tzIHRoZXkgYXJlIHJlc3BvbnNpYmxlIGZvci4AAAAAAAAAD0p1ZGdlQXNzaWdubWVudAAAAAACAAAAAAAAAAVqdWRnZQAAAAAAABMAAACASWRlbnRpZmllcnMgb2YgdGhlIHRyYWNrcyB0aGlzIGp1ZGdlIHNjb3Jlcy4gQSBqdWRnZSB3aXRoIG5vIHRyYWNrIGhhcwpubyByZWFzb24gdG8gYmUgYXV0aG9yaXplZCwgc28gYW4gZW1wdHkgbGlzdCBpcyByZWplY3RlZC4AAAAGdHJhY2tzAAAAAAPqAAAAEQ==",
        "AAAAAwAAAC5UaGUgZGVhZGxpbmVzIGFuIG9yZ2FuaXplciBpcyBhbGxvd2VkIHRvIG1vdmUuAAAAAAAAAAAACERlYWRsaW5lAAAABgAAAAAAAAAMUmVnaXN0cmF0aW9uAAAAAAAAAAAAAAAKU3VibWlzc2lvbgAAAAAAAQAAAAAAAAAJU2NyZWVuaW5nAAAAAAAAAgAAAAAAAAAHSnVkZ2luZwAAAAADAAAAAAAAAA1Db21tdW5pdHlWb3RlAAAAAAAABAAAAAAAAAASQ29tbXVuaXR5Vm90ZU9wZW5zAAAAAAAF",
        "AAAAAQAAAEJUaGUgZGVhZGxpbmVzIG9mIGEgaGFja2F0aG9uLCBhcyBVVEMgbGVkZ2VyIHRpbWVzdGFtcHMgaW4gc2Vjb25kcy4AAAAAAAAAAAAIU2NoZWR1bGUAAAAIAAAAQ1RoZSBjb21tdW5pdHkgdm90ZSBjbG9zZXMuIElnbm9yZWQgd2hlbiB0aGUgY29tbXVuaXR5IGhhcyBubyBzaGFyZS4AAAAAGGNvbW11bml0eV92b3RlX2Nsb3Nlc19hdAAAAAYAAACIVGhlIGNvbW11bml0eSB2b3RlIG9wZW5zLCB0eXBpY2FsbHkgcmlnaHQgYWZ0ZXIgdGhlIHByZXNlbnRhdGlvbnMgd2hpbGUKdGhlIGp1ZGdlcyBhcmUgc2NvcmluZy4gSWdub3JlZCB3aGVuIHRoZSBjb21tdW5pdHkgaGFzIG5vIHNoYXJlLgAAABdjb21tdW5pdHlfdm90ZV9vcGVuc19hdAAAAAAGAAAAQFNjb3JlY2FyZHMgYW5kIGJhbGxvdHMgYXJlIGR1ZSwgYW5kIHRoZSByZXZlYWwgYmVjb21lcyBwb3NzaWJsZS4AAAARanVkZ2luZ19jbG9zZXNfYXQAAAAAAAAGAAAAiFNpZ24gdXAgY2xvc2VzLiBUaGlzIGlzIGFsc28gdGhlIHNuYXBzaG90IHRoYXQgZml4ZXMgd2hvIG1heSB2b3RlLCBzbyBhCndhbGxldCBjcmVhdGVkIGFmdGVyIHRoaXMgbW9tZW50IGNhbiBuZXZlciBpbmZsdWVuY2UgdGhlIHJlc3VsdC4AAAAWcmVnaXN0cmF0aW9uX2Nsb3Nlc19hdAAAAAAABgAAAB9TaWduIHVwIG9wZW5zIGZvciBwYXJ0aWNpcGFudHMuAAAAABVyZWdpc3RyYXRpb25fb3BlbnNfYXQAAAAAAAAGAAAAL1RoZSBvcmdhbml6ZXIgaGFzIGZpbmlzaGVkIHRoZSBzY3JlZW5pbmcgcm91bmQuAAAAABNzY3JlZW5pbmdfY2xvc2VzX2F0AAAAAAYAAAA6UHJvamVjdHMgYXJlIHBpbm5lZCBhbmQgbm8gZnVydGhlciBzdWJtaXNzaW9uIGlzIGFjY2VwdGVkLgAAAAAAFHN1Ym1pc3Npb25fY2xvc2VzX2F0AAAABgAAACVUZWFtcyBtYXkgc3RhcnQgZmlsaW5nIHRoZWlyIHByb2plY3QuAAAAAAAAE3N1Ym1pc3Npb25fb3BlbnNfYXQAAAAABg==",
        "AAAAAQAAADtIb3cgbXVjaCByb29tIHRoZSBvcmdhbml6ZXIgYW5ub3VuY2VkIGZvciBtb3ZpbmcgZGVhZGxpbmVzLgAAAAAAAAAAD0V4dGVuc2lvblBvbGljeQAAAAACAAAAWkhvdyBtYW55IHRpbWVzIGEgc2luZ2xlIGRlYWRsaW5lIG1heSBiZSBtb3ZlZC4gWmVybyBtZWFucyB0aGUgYW5ub3VuY2VkCnNjaGVkdWxlIGlzIGZpbmFsLgAAAAAAG21heF9leHRlbnNpb25zX3Blcl9kZWFkbGluZQAAAAAEAAAAVFRoZSB0b3RhbCBudW1iZXIgb2Ygc2Vjb25kcyBhIHNpbmdsZSBkZWFkbGluZSBtYXkgZ2FpbiBhY3Jvc3MgYWxsIG9mCml0cyBleHRlbnNpb25zLgAAAB5tYXhfdG90YWxfc2Vjb25kc19wZXJfZGVhZGxpbmUAAAAAAAY=",
        "AAAAAwAAAC9UaGUgc3RhZ2VzIGEgaGFja2F0aG9uIHdhbGtzIHRocm91Z2gsIGluIG9yZGVyLgAAAAAAAAAABVBoYXNlAAAAAAAACgAAAD9Db25maWd1cmF0aW9uIGlzIHN0aWxsIGJlaW5nIGVkaXRlZCBhbmQgbm90aGluZyBpcyBiaW5kaW5nIHlldC4AAAAABURyYWZ0AAAAAAAAAAAAAEBUaGUgcHJpemUgaXMgYmVpbmcgZGVwb3NpdGVkIGFuZCBmdWxsIGZ1bmRpbmcgaXMgYmVpbmcgdmVyaWZpZWQuAAAAB0Z1bmRpbmcAAAAAAQAAAEZUaGUgZXZlbnQgaXMgcnVubmluZzogcGFydGljaXBhbnRzIGFwcGx5LCB0ZWFtcyBmb3JtLCBwcm9qZWN0cyBhcnJpdmUuAAAAAAAET3BlbgAAAAIAAAB/VGhlIG9yZ2FuaXplciB3b3JrcyB0aHJvdWdoIHRoZSBzY3JlZW5pbmcgcm91bmQgZm9yIHNwYW0gYW5kIHJ1bGUKYnJlYWNoZXMsIGJlZm9yZSBhbnkgc2NvcmVjYXJkIGV4aXN0cyB0byBiZSBpbmZsdWVuY2VkIGJ5IGl0LgAAAAAJU2NyZWVuaW5nAAAAAAAAAwAAAGRKdWRnZXMgc2NvcmUgdGhlaXIgYXNzaWduZWQgcHJvamVjdHMgYW5kIGVsaWdpYmxlIHdhbGxldHMgY2FzdCB0aGVpcgpjb21tdW5pdHkgYmFsbG90cywgYm90aCBzZWFsZWQuAAAAB0p1ZGdpbmcAAAAABAAAADZFdmVyeSBzY29yZWNhcmQgYW5kIGV2ZXJ5IGJhbGxvdCBpcyBwdWJsaXNoZWQgYXQgb25jZS4AAAAAAAZSZXZlYWwAAAAAAAUAAAA6VGhlIGNvbnRyYWN0IGNvbXB1dGVzIHRoZSByYW5raW5nIGZyb20gdGhlIGxvY2tlZCBmb3JtdWxhLgAAAAAADEZpbmFsaXphdGlvbgAAAAYAAAAbVGhlIHZhdWx0IHBheXMgdGhlIHdpbm5lcnMuAAAAAApTZXR0bGVtZW50AAAAAAAHAAAAM1RoZSBwcm9vZiBwYWdlIGlzIHBlcm1hbmVudCBhbmQgbm90aGluZyBjYW4gY2hhbmdlLgAAAAAJQ29tcGxldGVkAAAAAAAACAAAAENFbmRlZCBlYXJseSB1bmRlciB0aGUgY2FuY2VsbGF0aW9uIHBvbGljeSBkZWNsYXJlZCBiZWZvcmUgdGhlIGxvY2suAAAAAAlDYW5jZWxsZWQAAAAAAAAJ",
        "AAAAAQAAADtIb3cgbXVjaCBvZiBpdHMgZXh0ZW5zaW9uIGFsbG93YW5jZSBvbmUgZGVhZGxpbmUgaGFzIHNwZW50LgAAAAAAAAAADkV4dGVuc2lvblVzYWdlAAAAAAACAAAAKFRvdGFsIHNlY29uZHMgZ2FpbmVkIGFjcm9zcyB0aG9zZSBtb3Zlcy4AAAANc2Vjb25kc19hZGRlZAAAAAAAAAYAAAAsSG93IG1hbnkgdGltZXMgdGhpcyBkZWFkbGluZSBoYXMgYmVlbiBtb3ZlZC4AAAAFdGltZXMAAAAAAAAE",
        "AAAAAQAAADhFdmVyeXRoaW5nIGFib3V0IGEgaGFja2F0aG9uIHRoYXQgY2hhbmdlcyB3aGlsZSBpdCBydW5zLgAAAAAAAAAOSGFja2F0aG9uU3RhdGUAAAAAAAUAAABXV2hlbiB0aGUgcmFua2luZyBjbG9zZWQsIHdoaWNoIGlzIHdoZXJlIHRoZSBzYWZldHkgd2luZG93IGNvdW50cyBmcm9tLgpaZXJvIHVudGlsIHRoZW4uAAAAAAxmaW5hbGl6ZWRfYXQAAAAGAAAAKFdoZXJlIHRoZSBoYWNrYXRob24gaXMgaW4gaXRzIGxpZmVjeWNsZS4AAAAFcGhhc2UAAAAAAAfQAAAABVBoYXNlAAAAAAAAUlRoZSBkZWFkbGluZXMgYWN0dWFsbHkgaW4gZm9yY2U6IHRoZSBhbm5vdW5jZWQgb25lcyBwbHVzIGV2ZXJ5IHJlY29yZGVkCmV4dGVuc2lvbi4AAAAAAAhzY2hlZHVsZQAAB9AAAAAIU2NoZWR1bGUAAADzV2hlbiB0aGUgbW9uZXkgYWN0dWFsbHkgYmVjYW1lIHBheWFibGUsIHdoaWNoIGlzIHdoZXJlIHRoZSBjbGFpbSBwZXJpb2QKY291bnRzIGZyb20uIEtlcHQgYXBhcnQgZnJvbSBgZmluYWxpemVkX2F0YCBiZWNhdXNlIGEgc2V0dGxlbWVudCBub2JvZHkKb3BlbmVkIGZvciBhIG1vbnRoIHdvdWxkIG90aGVyd2lzZSBidXJuIHRoZSBjbGFpbSBwZXJpb2QgYmVmb3JlIGFueQp3aW5uZXIgY291bGQgcmVhY2ggdGhlaXIgcHJpemUuAAAAABRzZXR0bGVtZW50X29wZW5lZF9hdAAAAAYAAACFV2hldGhlciBzZXR0bGVtZW50IGlzIGJlaW5nIGhlbGQgYnkgdGhlIHByZSBkZWNsYXJlZCBhdXRob3JpdHkuIFNjb3JlcwphcmUgdW50b3VjaGFibGUgZWl0aGVyIHdheTsgdGhpcyBvbmx5IHN0b3BzIG1vbmV5IGZyb20gbW92aW5nLgAAAAAAABFzZXR0bGVtZW50X3BhdXNlZAAAAAAAAAE=",
        "AAAAAQAAADtBIG1vdmUgdG8gZW5kIHRoZSBoYWNrYXRob24gZWFybHksIGFuZCBob3cgZmFyIGFsb25nIGl0IGlzLgAAAAAAAAAAEENhbmNlbGxhdGlvbkNhc2UAAAADAAAAHEhvdyBtYW55IGp1ZGdlcyBoYXZlIHNpZ25lZC4AAAAJYXBwcm92YWxzAAAAAAAABAAAAB1XaGVuIHRoZSBvcmdhbml6ZXIgb3BlbmVkIGl0LgAAAAAAAAlvcGVuZWRfYXQAAAAAAAAGAAAAHURpZ2VzdCBvZiB0aGUgd3JpdHRlbiByZWFzb24uAAAAAAAABnJlYXNvbgAAAAAD7gAAACA=",
        "AAAAAQAAAERPbmUgcHJvamVjdCBhIHZvdGVyIGJhY2tlZCwgYW5kIGhvdyBtdWNoIG9mIHRoZWlyIGJhbGxvdCB3ZW50IHRvIGl0LgAAAAAAAAAKVm90ZUNob2ljZQAAAAAAAgAAAAAAAAAEdGVhbQAAAAQAAACHV2hvbGUgcG9pbnRzLCBuZXZlciB6ZXJvOiBhIGNob2ljZSB3b3J0aCBub3RoaW5nIGlzIG5vdCBhIGNob2ljZSwgYW5kCmFsbG93aW5nIGl0IHdvdWxkIGxldCBhIGJhbGxvdCBuYW1lIGEgcHJvamVjdCB3aXRob3V0IGJhY2tpbmcgaXQuAAAAAAZ3ZWlnaHQAAAAAAAQ=",
        "AAAABAAAAC5FdmVyeSByZWplY3Rpb24gdGhlIGNvcmUgY29udHJhY3QgY2FuIHByb2R1Y2UuAAAAAAAAAAAABUVycm9yAAAAAAAAMQAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAgAAAKtUaGUgY2FsbGVyIGlzIG5vdCB0aGUgb3JnYW5pemVyLCBhbmQgbm90IGEgY29sbGFib3JhdG9yIHdoZXJlIG9uZSB3b3VsZApoYXZlIGRvbmUuIFdoaWNoIG9mIHRoZSB0d28gd2FzIG5lZWRlZCBpcyBhIHByb3BlcnR5IG9mIHRoZSBlbnRyeSBwb2ludApyYXRoZXIgdGhhbiBvZiB0aGUgZmFpbHVyZS4AAAAADU5vdEF1dGhvcml6ZWQAAAAAAAADAAAAAAAAAAhOb3RKdWRnZQAAAAQAAAAAAAAADU5vdFRlYW1NZW1iZXIAAAAAAAAFAAAAfUEgY29sbGFib3JhdG9yIGNoYW5nZSB0aGF0IGNhbm5vdCBzdGFuZDogYWxyZWFkeSBvbiB0aGUgbGlzdCwgbm90IG9uIGl0LApvciB0aGUgb3JnYW5pemVyIHRyeWluZyB0byBhbHNvIGJlIHRoZWlyIG93biBoZWxwZXIuAAAAAAAAE0NvbGxhYm9yYXRvckludmFsaWQAAAAABgAAAAAAAAANVmF1bHROb3RCb3VuZAAAAAAAAAcAAAAAAAAAEVZhdWx0QWxyZWFkeUJvdW5kAAAAAAAACAAAAGVUaGUgdmF1bHQgbmFtZWQgc2VydmVzIGEgZGlmZmVyZW50IGhhY2thdGhvbiwgb3IgaG9sZHMgYSBkaWZmZXJlbnQgYXNzZXQKZnJvbSB0aGUgb25lIHRoZSBydWxlcyBuYW1lLgAAAAAAAA1WYXVsdFJlamVjdGVkAAAAAAAACQAAAINUaGUgY29uc3RpdHV0aW9uIGRvZXMgbm90IGhvbGQgdG9nZXRoZXIuIEV2ZXJ5IHZhbGlkYXRpb24gZmFpbHVyZQphcnJpdmVzIGhlcmUsIGFuZCB0aGUgU0RLIGlzIHdoYXQgdGVsbHMgYW4gb3JnYW5pemVyIHdoaWNoIGZpZWxkLgAAAAATQ29uc3RpdHV0aW9uSW52YWxpZAAAAAAUAAAAi1RoZSBoYWNrYXRob24gaXMgbm90IGluIGEgcGhhc2Ugd2hlcmUgdGhpcyBjYWxsIG1lYW5zIGFueXRoaW5nLiBBbHNvCmNvdmVycyBhIHBoYXNlIHRoYXQgZW5kcyBvbiBhbiBhY3Rpb24gYmVpbmcgYXNrZWQgdG8gZW5kIG9uIHRoZSBjbG9jay4AAAAACldyb25nUGhhc2UAAAAAAB4AAAAAAAAAElJ1bGVzQWxyZWFkeUxvY2tlZAAAAAAAHwAAAAAAAAASRGVhZGxpbmVOb3RSZWFjaGVkAAAAAAAgAAAAAAAAAA5EZWFkbGluZVBhc3NlZAAAAAAAIQAAAG5UaGUgc2NoZWR1bGUgdGhhdCB3b3VsZCByZXN1bHQgZG9lcyBub3QgcnVuIGluIG9yZGVyLCB3aGljaCBpbmNsdWRlcyBhCmRlYWRsaW5lIGJlaW5nIGFza2VkIHRvIG1vdmUgYmFja3dhcmRzLgAAAAAAD1NjaGVkdWxlSW52YWxpZAAAAAAiAAAAAAAAABVFeHRlbnNpb25MaW1pdFJlYWNoZWQAAAAAAAAjAAAAh1RoZSByZWNvcmQgbmFtZWQgZG9lcyBub3QgZXhpc3Q6IG5vIHN1Y2ggYXBwbGljYXRpb24sIHRlYW0sIHN1Ym1pc3Npb24sCnRyYWNrLCBzY29yZWNhcmQgb3IgcHJpemUgcG9zaXRpb24uIFRoZSBlbnRyeSBwb2ludCBzYXlzIHdoaWNoLgAAAAAITm90Rm91bmQAAAAoAAAAVlRoZSBhcHBsaWNhdGlvbiBpcyBub3QgaW4gdGhlIHN0YXRlIHRoZSBjYWxsIG5lZWRzOiBhbHJlYWR5IGZpbGVkLCBvcgphbHJlYWR5IGRlY2lkZWQuAAAAAAAVQXBwbGljYXRpb25Ob3RQZW5kaW5nAAAAAAAAKQAAAAAAAAALTm90QXBwcm92ZWQAAAAAKgAAAIRUaGlzIHBlcnNvbiBjYW5ub3Qgam9pbiB0aGlzIHRlYW06IGl0IGlzIGZ1bGwsIHRoZXkgYXJlIGFscmVhZHkgb24gaXQsCm9yIHRoZXkgYXJlIGFscmVhZHkgb24gYW5vdGhlciBhbmQgdGhlIHJ1bGVzIGZvcmJpZCBhIHNlY29uZC4AAAAQVGVhbUpvaW5SZWplY3RlZAAAACsAAABNVGhlIGVudHJ5IGlzIG91dCBvZiB0aGUgcnVubmluZywgd2hldGhlciBpdCB3YXMgc2NyZWVuZWQgb3V0IG9yCmRpc3F1YWxpZmllZC4AAAAAAAAVU3VibWlzc2lvbk5vdEVsaWdpYmxlAAAAAAAALAAAAHFUaGUgc2NvcmVjYXJkIGRvZXMgbm90IGZpdCB0aGUgcnVicmljOiBhIG1pc3NpbmcgY3JpdGVyaW9uLCBhbiB1bmtub3duCm9uZSwgb3IgYSBzY29yZSBvdXRzaWRlIHRoZSBhbGxvd2VkIHJhbmdlLgAAAAAAABBTY29yZWNhcmRJbnZhbGlkAAAAMgAAAAAAAAAYU2NvcmVjYXJkQWxyZWFkeVJlY29yZGVkAAAAMwAAAFhUaGlzIGp1ZGdlIHN0ZXBwZWQgYXdheSBmcm9tIHRoaXMgcHJvamVjdCwgb3IgaXMgYmVpbmcgYXNrZWQgdG8gc3RlcAphd2F5IGZyb20gaXQgdHdpY2UuAAAADEp1ZGdlUmVjdXNlZAAAADQAAAAAAAAAEFdyb25nSnVkZ2luZ01vZGUAAAA1AAAAZFRoZSBzZWFsaW5nIGRpZ2VzdCBpcyBhbHJlYWR5IHB1Ymxpc2hlZCBhbmQgY2Fubm90IGJlIHJlcGxhY2VkLiBDb3ZlcnMKc2NvcmVjYXJkcyBhbmQgYmFsbG90cyBhbGlrZS4AAAAUUm9vdEFscmVhZHlQdWJsaXNoZWQAAAA2AAAAAAAAAAtSb290TWlzc2luZwAAAAA3AAAAAAAAABVQcm9vZkRvZXNOb3RNYXRjaFJvb3QAAAAAAAA4AAAAAAAAABBWb3Rlck5vdEVsaWdpYmxlAAAAPAAAAAAAAAAVQ29tbXVuaXR5Vm90ZURpc2FibGVkAAAAAAAAPgAAAAAAAAAUQmFsbG90QWxyZWFkeUNvdW50ZWQAAAA/AAAAyVRoZSBiYWxsb3QgaXMgbm90IHRoZSBzaGFwZSB0aGUgbG9ja2VkIHJ1bGVzIGRlc2NyaWJlOiB0b28gbWFueSBjaG9pY2VzLApub25lIGF0IGFsbCwgYSBwcm9qZWN0IG5hbWVkIHR3aWNlIG9yIG91dCBvZiBvcmRlciwgYSBjaG9pY2Ugd29ydGgKbm90aGluZywgb3IgYSB0b3RhbCB0aGF0IGlzIG5vdCB0aGUgcG93ZXIgdGhlIHJ1bGVzIGhhbmQgb3V0LgAAAAAAAA9CYWxsb3RNYWxmb3JtZWQAAAAAQAAAADxBIGNhc2Ugb2YgdGhpcyBraW5kIGlzIGFscmVhZHkgcnVubmluZyBhZ2FpbnN0IHRoaXMgc3ViamVjdC4AAAAPQ2FzZUFscmVhZHlPcGVuAAAAAEYAAABBTm8gY2FzZSBpcyBydW5uaW5nLCBvciB0aGUgb25lIHRoYXQgd2FzIGhhcyBhbHJlYWR5IGJlZW4gc2V0dGxlZC4AAAAAAAALQ2FzZU5vdE9wZW4AAAAARwAAAAAAAAANQWxyZWFkeVNpZ25lZAAAAAAAAEgAAAAAAAAAHEp1ZGdlQXBwcm92YWxUaHJlc2hvbGROb3RNZXQAAABJAAAAAAAAABBBcHBlYWxXaW5kb3dPcGVuAAAASgAAAAAAAAASQXBwZWFsV2luZG93Q2xvc2VkAAAAAABLAAAAOVRoZSByYW5raW5nIGNhbm5vdCBjbG9zZSB3aGlsZSBhIGNhc2UgaXMgc3RpbGwgdW5kZWNpZGVkLgAAAAAAABpEaXNxdWFsaWZpY2F0aW9uVW5yZXNvbHZlZAAAAAAATAAAAAAAAAAUTm9Bd2FyZE5vdERlY2xhcmFibGUAAABNAAAAAAAAABNSZXN1bHRzTm90RmluYWxpemVkAAAAAFAAAAAAAAAAEFNhZmV0eVdpbmRvd09wZW4AAABRAAAAAAAAABBTZXR0bGVtZW50UGF1c2VkAAAAUgAAAAAAAAATU2V0dGxlbWVudE5vdFBhdXNlZAAAAABTAAAAAAAAABRTZXR0bGVtZW50SW5jb21wbGV0ZQAAAFQAAAAAAAAAEFByaXplQWxyZWFkeVBhaWQAAABVAAAAAAAAAA9DbGFpbVBlcmlvZE9wZW4AAAAAVgAAAAAAAAAQVmF1bHRVbmRlcmZ1bmRlZAAAAFcAAAECVGhlIGNvbnRyaWJ1dGlvbiB3YXMgdHVybmVkIGRvd24uIE9uZSBjb2RlIGZvciBldmVyeSB3YXkgdGhhdCBoYXBwZW5zOgp0aGUgbG9ja2VkIHJ1bGVzIG5ldmVyIG9wZW5lZCB0aGUgZG9vciwgdGhlIHdpbmRvdyBoYXMgY2xvc2VkLCB0aGUKYWxsb3dhbmNlIGlzIHVzZWQgdXAsIHRoZSBhbW91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",
        "AAAABQAAACFUaGUgdGVhbSBhbnN3ZXJlZCwgb24gdGhlIHJlY29yZC4AAAAAAAAAAAAAD0FwcGVhbFN1Ym1pdHRlZAAAAAABAAAAEGFwcGVhbF9zdWJtaXR0ZWQAAAADAAAAAAAAAAR0ZWFtAAAABAAAAAEAAAAAAAAABm1lbWJlcgAAAAAAEwAAAAAAAAAAAAAABmFwcGVhbAAAAAAD7gAAACAAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAD05vQXdhcmRBcHByb3ZlZAAAAAABAAAAEW5vX2F3YXJkX2FwcHJvdmVkAAAAAAAAAwAAAAAAAAAFdHJhY2sAAAAAAAARAAAAAQAAAAAAAAAFanVkZ2UAAAAAAAATAAAAAAAAAAAAAAAJYXBwcm92YWxzAAAAAAAABAAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAD05vQXdhcmRSZXNvbHZlZAAAAAABAAAAEW5vX2F3YXJkX3Jlc29sdmVkAAAAAAAAAwAAAAAAAAAFdHJhY2sAAAAAAAARAAAAAQAAAAAAAAAIZGVjbGFyZWQAAAABAAAAAAAAAAAAAAAIcmV0dXJuZWQAAAALAAAAAAAAAAI=",
        "AAAABQAAAD1PbmUgZGVhZGxpbmUgbW92ZWQsIGluc2lkZSB0aGUgYWxsb3dhbmNlIHRoZSBydWxlcyBhbm5vdW5jZWQuAAAAAAAAAAAAABBEZWFkbGluZUV4dGVuZGVkAAAAAQAAABFkZWFkbGluZV9leHRlbmRlZAAAAAAAAAQAAAAAAAAACGRlYWRsaW5lAAAH0AAAAAhEZWFkbGluZQAAAAEAAAAAAAAACG1vdmVkX3RvAAAABgAAAAAAAAA8V2hhdCB0aGlzIG1vdmUgY29zdCBhZ2FpbnN0IHRoZSBkZWFkbGluZSdzIGFubm91bmNlZCBidWRnZXQuAAAADXNlY29uZHNfYWRkZWQAAAAAAAAGAAAAAAAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAAAAAAC",
        "AAAABQAAAEJBIHByb2plY3QgZW50ZXJlZCB0aGUgaGFja2F0aG9uLCBvciBhbiBleGlzdGluZyBlbnRyeSB3YXMgcmV2aXNlZC4AAAAAAAAAAAAQUHJvamVjdFN1Ym1pdHRlZAAAAAEAAAARcHJvamVjdF9zdWJtaXR0ZWQAAAAAAAAEAAAAAAAAAAR0ZWFtAAAABAAAAAEAAAAAAAAABXRyYWNrAAAAAAAAEQAAAAAAAAAAAAAADW1ldGFkYXRhX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAAAAAAB3JldmlzZWQAAAAAAQAAAAAAAAAC",
        "AAAABQAAACxUaGUgcmVzdWx0IGlzIGNsb3NlZCBhbmQgdGhlIG1vbmV5IGNhbiBtb3ZlLgAAAAAAAAAQUmVzdWx0c0ZpbmFsaXplZAAAAAEAAAARcmVzdWx0c19maW5hbGl6ZWQAAAAAAAABAAAARldoZW4gdGhlIHJhbmtpbmcgY2xvc2VkLCB3aGljaCBpcyB3aGVyZSBhbnkgc2FmZXR5IHdpbmRvdyBjb3VudHMgZnJvbS4AAAAAAAJhdAAAAAAABgAAAAAAAAAC",
        "AAAABQAAABZBIHJlcXVlc3Qgd2FzIGRlY2lkZWQuAAAAAAAAAAAAEkFwcGxpY2F0aW9uRGVjaWRlZAAAAAAAAQAAABNhcHBsaWNhdGlvbl9kZWNpZGVkAAAAAAMAAAAAAAAACWFwcGxpY2FudAAAAAAAABMAAAABAAAAAAAAAAhhcHByb3ZlZAAAAAEAAAAAAAAAAAAAAAZyZWFzb24AAAAAA+4AAAAgAAAAAAAAAAI=",
        "AAAABQAAAC1BIG1vdmUgdG8gZW5kIHRoZSBoYWNrYXRob24gZWFybHkgd2FzIG9wZW5lZC4AAAAAAAAAAAAAEkNhbmNlbGxhdGlvbk9wZW5lZAAAAAAAAQAAABNjYW5jZWxsYXRpb25fb3BlbmVkAAAAAAEAAAAAAAAABnJlYXNvbgAAAAAD7gAAACAAAAAAAAAAAg==",
        "AAAABQAAAEdUaGUgaGFja2F0aG9uIHN0b3BwZWQsIGFuZCB0aGUgcG9vbCB3ZW50IGJhY2sgYWxvbmcgdGhlIGRlY2xhcmVkIHJvdXRlLgAAAAAAAAAAEkhhY2thdGhvbkNhbmNlbGxlZAAAAAAAAQAAABNoYWNrYXRob25fY2FuY2VsbGVkAAAAAAMAAAAAAAAABnJlYXNvbgAAAAAD7gAAACAAAAAAAAAAc0hvdyBtYW55IGp1ZGdlcyBzaWduZWQuIFplcm8gd2hlbiB0aGUgb3JnYW5pemVyIGNhbmNlbGxlZCBhbG9uZSwgd2hpY2gKaXMgb25seSBwb3NzaWJsZSBiZWZvcmUgYW55Ym9keSBoYWQgZW50ZXJlZC4AAAAACWFwcHJvdmFscwAAAAAAAAQAAAAAAAAAAAAAAAhyZXR1cm5lZAAAAAsAAAAAAAAAAg==",
        "AAAABQAAABpUaGUgcGxhdGZvcm0gdG9vayBpdHMgY3V0LgAAAAAAAAAAABJQbGF0Zm9ybUZlZVNldHRsZWQAAAAAAAEAAAAUcGxhdGZvcm1fZmVlX3NldHRsZWQAAAADAAAAAAAAAAljb2xsZWN0b3IAAAAAAAATAAAAAQAAADBXaGF0IGxlZnQgdGhlIHZhdWx0LCBhdCB0aGUgcHJpemUgYXNzZXQncyBzY2FsZS4AAAAGYW1vdW50AAAAAAALAAAAAAAAAEZUaGUgcmF0ZSBpdCB3YXMgdGFrZW4gYXQsIHdoaWNoIHdhcyBmcm96ZW4gd2l0aCB0aGUgcmVzdCBvZiB0aGUgcnVsZXMuAAAAAAADYnBzAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAADBFdmVyeSBzY29yZWNhcmQgaXMgbm93IHNlYWxlZCBiZWhpbmQgb25lIGRpZ2VzdC4AAAAAAAAAElNjb3JlUm9vdFB1Ymxpc2hlZAAAAAAAAQAAABRzY29yZV9yb290X3B1Ymxpc2hlZAAAAAEAAAAAAAAABHJvb3QAAAPuAAAAIAAAAAAAAAAC",
        "AAAABQAAADdFdmVyeSBjb21tdW5pdHkgYmFsbG90IGlzIG5vdyBzZWFsZWQgYmVoaW5kIG9uZSBkaWdlc3QuAAAAAAAAAAATQmFsbG90Um9vdFB1Ymxpc2hlZAAAAAABAAAAFWJhbGxvdF9yb290X3B1Ymxpc2hlZAAAAAAAAAEAAAAAAAAABHJvb3QAAAPuAAAAIAAAAAAAAAAC",
        "AAAABQAAADhTb21lb25lIGdhaW5lZCBvciBsb3N0IHRoZSByaWdodCB0byByZXZpZXcgYXBwbGljYXRpb25zLgAAAAAAAAATQ29sbGFib3JhdG9yQ2hhbmdlZAAAAAABAAAAFGNvbGxhYm9yYXRvcl9jaGFuZ2VkAAAAAgAAAAAAAAAMY29sbGFib3JhdG9yAAAAEwAAAAEAAAAAAAAABWFkZGVkAAAAAAAAAQAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAFENhbmNlbGxhdGlvbkFwcHJvdmVkAAAAAQAAABVjYW5jZWxsYXRpb25fYXBwcm92ZWQAAAAAAAACAAAAAAAAAAVqdWRnZQAAAAAAABMAAAABAAAAAAAAAAlhcHByb3ZhbHMAAAAAAAAEAAAAAAAAAAI=",
        "AAAABQAAAChBbiBlbnRyeSB3YXMgcnVsZWQgb3V0IGR1cmluZyBzY3JlZW5pbmcuAAAAAAAAABVTdWJtaXNzaW9uSW52YWxpZGF0ZWQAAAAAAAABAAAAFnN1Ym1pc3Npb25faW52YWxpZGF0ZWQAAAAAAAIAAAAAAAAABHRlYW0AAAAEAAAAAQAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAAAAAAC",
        "AAAABQAAAEBBIGNhc2Ugd2FzIG9wZW5lZCB0byByZW1vdmUgYW4gZW50cnkgYWZ0ZXIgc2NyZWVuaW5nIGhhZCBjbG9zZWQuAAAAAAAAABZEaXNxdWFsaWZpY2F0aW9uT3BlbmVkAAAAAAABAAAAF2Rpc3F1YWxpZmljYXRpb25fb3BlbmVkAAAAAAIAAAAAAAAABHRlYW0AAAAEAAAAAQAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAGERpc3F1YWxpZmljYXRpb25BcHByb3ZlZAAAAAEAAAAZZGlzcXVhbGlmaWNhdGlvbl9hcHByb3ZlZAAAAAAAAAMAAAAAAAAABHRlYW0AAAAEAAAAAQAAAAAAAAAFanVkZ2UAAAAAAAATAAAAAAAAAAAAAAAJYXBwcm92YWxzAAAAAAAABAAAAAAAAAAC",
        "AAAABQAAACxUaGUgY2FzZSB3YXMgc2V0dGxlZCwgd2hpY2hldmVyIHdheSBpdCB3ZW50LgAAAAAAAAAYRGlzcXVhbGlmaWNhdGlvblJlc29sdmVkAAAAAQAAABlkaXNxdWFsaWZpY2F0aW9uX3Jlc29sdmVkAAAAAAAAAwAAAAAAAAAEdGVhbQAAAAQAAAABAAAAAAAAAAZ1cGhlbGQAAAAAAAEAAAAAAAAAAAAAAAlhcHByb3ZhbHMAAAAAAAAEAAAAAAAAAAI=",
        "AAAAAQAAACBBIHRlYW0sIGFzIHRoZSBjb250cmFjdCBzZWVzIGl0LgAAAAAAAAAEVGVhbQAAAAMAAAB5V2hvZXZlciBmb3VuZGVkIHRoZSB0ZWFtIGFuZCBjYW4gYWRtaXQgcGVvcGxlIHRvIGl0LiBUaGV5IGhvbGQgbm8gY2xhaW0Kb24gdGhlIHByaXplIGJleW9uZCB0aGUgc2hhcmUgZXZlcnkgbWVtYmVyIHRha2VzLgAAAAAAAAdjYXB0YWluAAAAABMAAAAAAAAAAmlkAAAAAAAEAAAAPEV2ZXJ5b25lIG9uIHRoZSB0ZWFtLCB0aGUgY2FwdGFpbiBpbmNsdWRlZCBhbmQgYWx3YXlzIGZpcnN0LgAAAAdtZW1iZXJzAAAAA+oAAAAT",
        "AAAAAQAAADdPbmUgcGVyc29uJ3MgcmVxdWVzdCB0byB0YWtlIHBhcnQsIGFuZCB3aGF0IGNhbWUgb2YgaXQuAAAAAAAAAAAMUmVnaXN0cmF0aW9uAAAABAAAABlXaGVuIHRoZSByZXF1ZXN0IGFycml2ZWQuAAAAAAAACmFwcGxpZWRfYXQAAAAAAAYAAAA0V2hlbiBpdCB3YXMgZGVjaWRlZDsgemVybyB3aGlsZSBpdCBpcyBzdGlsbCBwZW5kaW5nLgAAAApkZWNpZGVkX2F0AAAAAAAGAAAAQURpZ2VzdCBvZiB0aGUgd3JpdHRlbiByZWFzb24gZm9yIGEgcmVmdXNhbDsgYWxsIHplcm9lcyBvdGhlcndpc2UuAAAAAAAABnJlYXNvbgAAAAAD7gAAACAAAAAAAAAABnN0YXR1cwAAAAAH0AAAABFBcHBsaWNhdGlvblN0YXR1cwAAAA==",
        "AAAAAwAAACRXaGVyZSBhIHJlcXVlc3QgdG8gdGFrZSBwYXJ0IHN0YW5kcy4AAAAAAAAAEUFwcGxpY2F0aW9uU3RhdHVzAAAAAAAAAwAAAAAAAAAHUGVuZGluZwAAAAAAAAAAAAAAAAhBcHByb3ZlZAAAAAEAAAAAAAAACFJlamVjdGVkAAAAAg==",
        "AAAAAQAAACNPbmUgcHJvamVjdCBhcyB0aGUgcmFua2luZyBzZWVzIGl0LgAAAAAAAAAACUNhbmRpZGF0ZQAAAAAAAAYAAAAAAAAACWNvbW11bml0eQAAAAAAAAQAAABATWVhbnMgZm9yIHRoZSBjcml0ZXJpYSB0aGUgdGllIGJyZWFrIGNoYWluIG5hbWVzLCBhbmQgbm8gb3RoZXJzLgAAABJjcml0ZXJpb25fYXZlcmFnZXMAAAAAA+oAAAfQAAAADkNyaXRlcmlvblNjb3JlAAAAAAAAAAAAC2ZpbmFsX3Njb3JlAAAAAAQAAAAvVGhlIGp1ZGdlcycgbWVhbiwgb3IgemVybyB3aGVuIHRoZXJlIHdlcmUgbm9uZS4AAAAADWp1ZGdlX2F2ZXJhZ2UAAAAAAAAEAAAAQ1doZW4gdGhlIHByb2plY3QgZmlyc3QgYXJyaXZlZCwgd2hpY2ggaXMgdGhlIGxhc3QgcmVzb3J0IHNlcGFyYXRvci4AAAAADHN1Ym1pdHRlZF9hdAAAAAYAAAAAAAAABHRlYW0AAAAE",
        "AAAAAwAAADRXaGljaCBzdGVwIG9mIHRoZSB0aWUgYnJlYWsgY2hhaW4gZGVjaWRlZCBhIHBsYWNpbmcuAAAAAAAAAAlEZWNpZGVkQnkAAAAAAAAFAAAAM1RoZSBmaW5hbCBzY29yZXMgZGlmZmVyZWQ7IG5vIHRpZSBicmVhayB3YXMgbmVlZGVkLgAAAAAFU2NvcmUAAAAAAAAAAAAAIVNlcGFyYXRlZCBvbiB0aGUganVkZ2VzJyBhdmVyYWdlLgAAAAAAAApKdWRnZVNjb3JlAAAAAAABAAAAIVNlcGFyYXRlZCBvbiBvbmUgbmFtZWQgY3JpdGVyaW9uLgAAAAAAAAlDcml0ZXJpb24AAAAAAAACAAAAIFNlcGFyYXRlZCBvbiB0aGUgY29tbXVuaXR5IHZvdGUuAAAADkNvbW11bml0eVNjb3JlAAAAAAADAAAALVNlcGFyYXRlZCBieSB3aGljaCBwcm9qZWN0IHdhcyBlbnRlcmVkIGZpcnN0LgAAAAAAAA9TdWJtaXNzaW9uT3JkZXIAAAAABA==",
        "AAAAAQAAADhPbmUgcHJvamVjdCdzIHBsYWNlIGluIGl0cyB0cmFjaywgYW5kIHdoeSBpdCBzaXRzIHRoZXJlLgAAAAAAAAAJUGxhY2VtZW50AAAAAAAABgAAAAAAAAAJY29tbXVuaXR5AAAAAAAABAAAAIZIb3cgdGhpcyBwcm9qZWN0IHdhcyBzZXBhcmF0ZWQgZnJvbSB0aGUgb25lIHBsYWNlZCBkaXJlY3RseSBhYm92ZSBpdC4KVGhlIHdpbm5lciBoYXMgbm90aGluZyBhYm92ZSB0aGVtLCBzbyB0aGVpcnMgcmVhZHMgYXMgdGhlIHNjb3JlLgAAAAAACmRlY2lkZWRfYnkAAAAAB9AAAAAJRGVjaWRlZEJ5AAAAAAAAAAAAAAtmaW5hbF9zY29yZQAAAAAEAAAAAAAAAA1qdWRnZV9hdmVyYWdlAAAAAAAABAAAAClPbmUgYmFzZWQsIGNvdW50aW5nIGRvd24gZnJvbSB0aGUgd2lubmVyLgAAAAAAAARyYW5rAAAABAAAAAAAAAAEdGVhbQAAAAQ=",
        "AAAAAQAAADlBIHRyYWNrJ3MgbW92ZSB0byBhd2FyZCBub3RoaW5nLCBhbmQgaG93IGZhciBhbG9uZyBpdCBpcy4AAAAAAAAAAAAAC05vQXdhcmRDYXNlAAAAAAQAAAAcSG93IG1hbnkganVkZ2VzIGhhdmUgc2lnbmVkLgAAAAlhcHByb3ZhbHMAAAAAAAAEAAAAS1doZW4gdGhlIG9yZ2FuaXplciBvcGVuZWQgaXQsIHdoaWNoIGlzIHdoZXJlIHRoZSBhcHBlYWwgd2luZG93IGNvdW50cwpmcm9tLgAAAAAJb3BlbmVkX2F0AAAAAAAABgAAAB1EaWdlc3Qgb2YgdGhlIHdyaXR0ZW4gcmVhc29uLgAAAAAAAAZyZWFzb24AAAAAA+4AAAAgAAAAMVdoZXRoZXIgaXQgaGFzIGJlZW4gc2V0dGxlZCBvbmUgd2F5IG9yIHRoZSBvdGhlci4AAAAAAAAIcmVzb2x2ZWQAAAAB",
        "AAAAAgAAAEVFdmVyeXRoaW5nIHRoZSBjb3JlIGNvbnRyYWN0IHN0b3Jlcywgb25lIHZhcmlhbnQgcGVyIGZhbWlseSBvZiBlbnRyeS4AAAAAAAAAAAAAB0RhdGFLZXkAAAAAJgAAAAAAAAAmVGhlIG9yZ2FuaXplciBhbmQgdGhlaXIgY29sbGFib3JhdG9ycy4AAAAAAApPcmdhbml6ZXJzAAAAAAAAAAAAF1RoZSBydWxlcywgb25jZSBsb2NrZWQuAAAAAAxDb25zdGl0dXRpb24AAAAAAAAAZFRoZSBkaWdlc3Qgb2YgdGhvc2UgcnVsZXMsIGtlcHQgYmVzaWRlIHRoZW0gc28gYSByZWFkZXIgbmV2ZXIgaGFzIHRvCnRydXN0IGEgY2xpZW50IHRvIHJlY29tcHV0ZSBpdC4AAAAQQ29uc3RpdHV0aW9uSGFzaAAAAAAAAABJUGhhc2UsIGVmZmVjdGl2ZSBzY2hlZHVsZSBhbmQgdGhlIHJlc3Qgb2Ygd2hhdCBjaGFuZ2VzIGFzIHRoZSBldmVudCBydW5zLgAAAAAAAAVTdGF0ZQAAAAAAAAEAAAD8SG93IG11Y2ggb2YgaXRzIGFubm91bmNlZCBhbGxvd2FuY2Ugb25lIGRlYWRsaW5lIGhhcyBzcGVudC4gS2VwdCBwZXIKZGVhZGxpbmUgcmF0aGVyIHRoYW4gYXMgb25lIGNvdW50ZXIsIGJlY2F1c2UgdGhlIGFsbG93YW5jZSBpcyBkZWNsYXJlZApwZXIgZGVhZGxpbmUgYW5kIGEgc2luZ2xlIGNvdW50ZXIgd291bGQgbGV0IGEgc2xpcHBpbmcgc3VibWlzc2lvbiB3aW5kb3cKc2lsZW50bHkgZWF0IHRoZSBqdWRnaW5nIHdpbmRvdydzIHJvb20uAAAACkV4dGVuc2lvbnMAAAAAAAEAAAfQAAAACERlYWRsaW5lAAAAAAAAAClUaGUgdmF1bHQgaG9sZGluZyB0aGlzIGhhY2thdGhvbidzIHByaXplLgAAAAAAAAVWYXVsdAAAAAAAAAEAAAAiT25lIHBlcnNvbidzIHJlcXVlc3QgdG8gdGFrZSBwYXJ0LgAAAAAADFJlZ2lzdHJhdGlvbgAAAAEAAAATAAAAAQAAAAlPbmUgdGVhbS4AAAAAAAAEVGVhbQAAAAEAAAAEAAAAAAAAAD9Ib3cgbWFueSB0ZWFtcyBleGlzdCwgd2hpY2ggaXMgYWxzbyB0aGUgbmV4dCB0ZWFtJ3MgaWRlbnRpZmllci4AAAAACVRlYW1Db3VudAAAAAAAAAEAAAAgVGhlIHRlYW1zIG9uZSBwZXJzb24gYmVsb25ncyB0by4AAAAKTWVtYmVyc2hpcAAAAAAAAQAAABMAAAABAAAAO09uZSB0ZWFtJ3MgZW50cnksIGtleWVkIGJ5IHRlYW0gYmVjYXVzZSBhIHRlYW0gZW50ZXJzIG9uY2UuAAAAAApTdWJtaXNzaW9uAAAAAAABAAAABAAAAAAAAAAiQSBtb3ZlIHRvIGVuZCB0aGUgaGFja2F0aG9uIGVhcmx5LgAAAAAADENhbmNlbGxhdGlvbgAAAAEAAAAjT25lIGp1ZGdlJ3Mgc2lnbmF0dXJlIG9uIHRoYXQgbW92ZS4AAAAAFENhbmNlbGxhdGlvbkFwcHJvdmFsAAAAAQAAABMAAAABAAAAQEEgY2FzZSBmb3IgcmVtb3Zpbmcgb25lIHRlYW0ncyBlbnRyeSBhZnRlciBzY3JlZW5pbmcgaGFzIGNsb3NlZC4AAAAQRGlzcXVhbGlmaWNhdGlvbgAAAAEAAAAEAAAAAQAAACNPbmUganVkZ2UncyBzaWduYXR1cmUgb24gdGhhdCBjYXNlLgAAAAAYRGlzcXVhbGlmaWNhdGlvbkFwcHJvdmFsAAAAAgAAAAQAAAATAAAAAQAAACpBIGp1ZGdlIHdobyBzdGVwcGVkIGF3YXkgZnJvbSBvbmUgcHJvamVjdC4AAAAAAAdSZWN1c2FsAAAAAAIAAAATAAAABAAAAAEAAABsSG93IG1hbnkganVkZ2VzIHN0ZXBwZWQgYXdheSBmcm9tIG9uZSBwcm9qZWN0LCBzbyB0aGUgcXVvcnVtIGNhbiBiZQpjaGVja2VkIHdpdGhvdXQgd2Fsa2luZyB0aGUgd2hvbGUgYmVuY2guAAAADFJlY3VzYWxDb3VudAAAAAEAAAAEAAAAAAAAADRUaGUgZGlnZXN0IHNlYWxpbmcgZXZlcnkgc2NvcmVjYXJkIHVudGlsIHRoZSByZXZlYWwuAAAACVNjb3JlUm9vdAAAAAAAAAEAAAA6T25lIGp1ZGdlJ3Mgd2VpZ2h0ZWQgdG90YWwgZm9yIG9uZSBwcm9qZWN0LCBvbmNlIHJldmVhbGVkLgAAAAAABVNjb3JlAAAAAAAAAgAAAAQAAAATAAAAAQAAAHBIb3cgbWFueSBzY29yZWNhcmRzIGEgcHJvamVjdCBoYXMgaGFkIHJldmVhbGVkLCBhbmQgdGhlaXIgc3VtLCBzbyB0aGUKYXZlcmFnZSBuZXZlciBuZWVkcyB0aGUgd2hvbGUgbGlzdCBsb2FkZWQuAAAAClNjb3JlVGFsbHkAAAAAAAEAAAAEAAAAAAAAADtUaGUgZGlnZXN0IHNlYWxpbmcgZXZlcnkgY29tbXVuaXR5IGJhbGxvdCB1bnRpbCB0aGUgcmV2ZWFsLgAAAAAKQmFsbG90Um9vdAAAAAAAAQAAAC1XaGV0aGVyIG9uZSB3YWxsZXQncyBiYWxsb3QgaGFzIGJlZW4gY291bnRlZC4AAAAAAAANQmFsbG90Q291bnRlZAAAAAAAAAEAAAATAAAAAQAAAEBIb3cgbWFueSBwb2ludHMgb25lIHByb2plY3QgaGFzIGJlZW4gZ2l2ZW4sIGFjcm9zcyBldmVyeSBiYWxsb3QuAAAAClZvdGVXZWlnaHQAAAAAAAEAAAAEAAAAAAAAAGZUaGUgbGFyZ2VzdCB0b3RhbCBhbnkgcHJvamVjdCBob2xkcywgd2hpY2ggaXMgdGhlIGRlbm9taW5hdG9yIHRoZQpjb21tdW5pdHkgc2NvcmUgaXMgbWVhc3VyZWQgYWdhaW5zdC4AAAAAAA1Ub3BWb3RlV2VpZ2h0AAAAAAAAAQAAADBPbmUgY3JpdGVyaW9uJ3MgcmV2ZWFsZWQgc2NvcmVzIGZvciBvbmUgcHJvamVjdC4AAAAOQ3JpdGVyaW9uVGFsbHkAAAAAAAIAAAAEAAAAEQAAAAEAAAAnT25lIHRyYWNrJ3MgZmluaXNoZWQgcmFua2luZywgaW4gb3JkZXIuAAAAAAdSYW5raW5nAAAAAAEAAAARAAAAAQAAAEdBIHByaXplIHBvc2l0aW9uIHRoYXQgaXMgc2V0dGxlZCBpbiBmdWxsIGFuZCBjYW4gYmUgcmVhY2hlZCBubyBmdXJ0aGVyLgAAAAAEUGFpZAAAAAIAAAARAAAABAAAAAEAAAA/T25lIG1lbWJlcidzIHNoYXJlIG9mIG9uZSBwb3NpdGlvbiwgb25jZSBpdCBoYXMgbGVmdCB0aGUgdmF1bHQuAAAAAAVTaGFyZQAAAAAAAAMAAAARAAAABAAAABMAAAABAAAAc0hvdyBtYW55IG9mIGEgcG9zaXRpb24ncyBzaGFyZXMgYXJlIHNldHRsZWQsIHNvIGEgcG9zaXRpb24gY2FuIGJlIGNsb3NlZAp3aXRob3V0IHdhbGtpbmcgdGhlIHRlYW0gb24gZXZlcnkgcGF5bWVudC4AAAAAClNoYXJlQ291bnQAAAAAAAIAAAARAAAABAAAAAAAAADUVGhlIHBsYXRmb3JtJ3MgY3V0LCBvbmNlIGl0IGhhcyBsZWZ0IHRoZSB2YXVsdC4gSXRzIG93biBrZXkgcmF0aGVyIHRoYW4KYSBmaWVsZCBvbiB0aGUgc3RhdGUsIGJlY2F1c2UgaXQgaXMgc2V0dGxlZCBieSB0aGUgc2FtZSBraW5kIG9mIGNhbGwgYXMgYQpwcml6ZSBhbmQgYW5zd2VycyB0aGUgc2FtZSBxdWVzdGlvbjogaGFzIHRoaXMgbW9uZXkgYWxyZWFkeSBtb3ZlZC4AAAASUGxhdGZvcm1GZWVTZXR0bGVkAAAAAAABAAAAIEEgdHJhY2sncyBtb3ZlIHRvIGF3YXJkIG5vdGhpbmcuAAAAB05vQXdhcmQAAAAAAQAAABEAAAABAAAAI09uZSBqdWRnZSdzIHNpZ25hdHVyZSBvbiB0aGF0IG1vdmUuAAAAAA9Ob0F3YXJkQXBwcm92YWwAAAAAAgAAABEAAAATAAAAAQAAAMdXaGF0IHNwb25zb3JzIGhhdmUgYWRkZWQgdG8gb25lIHByaXplIHBvc2l0aW9uIHNpbmNlIHRoZSBsb2NrLiBLZXB0IHBlcgpwb3NpdGlvbiByYXRoZXIgdGhhbiBwZXIgZXZlbnQsIGJlY2F1c2UgdGhhdCBpcyB0aGUgZ3JhbnVsYXJpdHkgdGhlCm1vbmV5IGlzIGFpbWVkIGF0IGFuZCB0aGUgZ3JhbnVsYXJpdHkgc2V0dGxlbWVudCBwYXlzIGZyb20uAAAAAAVCb251cwAAAAAAAAIAAAARAAAABAAAAAEAAAAqT25lIGNvbnRyaWJ1dGlvbiwgaW4gdGhlIG9yZGVyIGl0IGFycml2ZWQuAAAAAAALU3BvbnNvcnNoaXAAAAAAAQAAAAQAAAAAAAAAPUhvdyBtYW55IHRoZXJlIGhhdmUgYmVlbiwgd2hpY2ggaXMgYWxzbyB0aGUgbmV4dCBvbmUncyBpbmRleC4AAAAAAAAQU3BvbnNvcnNoaXBDb3VudAAAAAAAAADRV2hhdCB0aGUgcGxhdGZvcm0gaXMgb3dlZCBvbiB0aG9zZSBjb250cmlidXRpb25zLCBhY2N1bXVsYXRlZCBhcyB0aGV5CmFycml2ZS4gSXRzIG93biB0b3RhbCByYXRoZXIgdGhhbiBmb2xkZWQgaW50byB0aGUgY29uc3RpdHV0aW9uJ3MgZmVlLApiZWNhdXNlIHRoYXQgb25lIGlzIGEgZnVuY3Rpb24gb2YgYSBmcm96ZW4gdGFibGUgYW5kIHRoaXMgb25lIGlzIG5vdC4AAAAAAAAMU3BvbnNvcmVkRmVlAAAAAQAAADdPbmUgdHJhY2sgYSBzcG9uc29yIGFza2VkIGZvciwga2V5ZWQgYnkgaXRzIGlkZW50aWZpZXIuAAAAAAxTcG9uc29yVHJhY2sAAAABAAAAEQAAAAAAAAC5RXZlcnkgc3VjaCBpZGVudGlmaWVyLCBzbyB0aGUgdHJhY2tzIGNhbiBiZSB3YWxrZWQgd2l0aG91dCBrbm93aW5nIHRoZWlyCm5hbWVzLiBSYW5raW5nLCBzZXR0bGVtZW50IGFuZCB0aGUgcmVmdW5kIGFsbCBoYXZlIHRvIHZpc2l0IGVhY2ggb25lLAphbmQgbm9uZSBvZiB0aGVtIGhhcyBhIG5hbWUgdG8gc3RhcnQgZnJvbS4AAAAAAAAPU3BvbnNvclRyYWNrSWRzAA==",
        "AAAAAAAAACZUaGUgb3JnYW5pemVyIGFuZCB0aGVpciBjb2xsYWJvcmF0b3JzLgAAAAAABHRlYW0AAAAAAAAAAQAAA+kAAAfQAAAADk9yZ2FuaXppbmdUZWFtAAAAAAAD",
        "AAAAAAAAABJBc2tzIHRvIHRha2UgcGFydC4AAAAAAAVhcHBseQAAAAAAAAEAAAAAAAAACWFwcGxpY2FudAAAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAADxUaGUgY3VycmVudCBwaGFzZSwgd2hpY2ggaXMgdGhlIG9uZSB2YWx1ZSBtb3N0IHJlYWRlcnMgd2FudC4AAAAFcGhhc2UAAAAAAAAAAAAAAQAAA+kAAAfQAAAABVBoYXNlAAAAAAAAAw==",
        "AAAAAAAAADpPbmUganVkZ2UncyB3ZWlnaHRlZCB0b3RhbCBmb3Igb25lIHByb2plY3QsIG9uY2UgcmV2ZWFsZWQuAAAAAAAFc2NvcmUAAAAAAAACAAAAAAAAAAd0ZWFtX2lkAAAAAAQAAAAAAAAABWp1ZGdlAAAAAAAAEwAAAAEAAAPpAAAABAAAAAM=",
        "AAAAAAAAAERXaGVyZSB0aGUgaGFja2F0aG9uIGlzIGluIGl0cyBsaWZlY3ljbGUsIGFuZCB0aGUgZGVhZGxpbmVzIGluIGZvcmNlLgAAAAVzdGF0ZQAAAAAAAAAAAAABAAAD6QAAB9AAAAAOSGFja2F0aG9uU3RhdGUAAAAAAAM=",
        "AAAAAAAAAClUaGUgdmF1bHQgaG9sZGluZyB0aGlzIGhhY2thdGhvbidzIHByaXplLgAAAAAAAAV2YXVsdAAAAAAAAAAAAAABAAAD6QAAABMAAAAD",
        "AAAAAQAAACNPbmUgZGVhZGxpbmUgYW5kIHdoZXJlIGl0IGlzIGdvaW5nLgAAAAAAAAAADERlYWRsaW5lTW92ZQAAAAIAAAAAAAAACGRlYWRsaW5lAAAH0AAAAAhEZWFkbGluZQAAAAAAAAAIbW92ZWRfdG8AAAAG",
        "AAAAAAAAADxDYWxscyB0aGUgd2hvbGUgaGFja2F0aG9uIG9mZiBiZWZvcmUgYW55Ym9keSBoYXMgZW50ZXJlZCBpdC4AAAAGY2FuY2VsAAAAAAABAAAAAAAAAAZyZWFzb24AAAAAA+4AAAAgAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAEJDcmVhdGVzIGEgaGFja2F0aG9uIGluIGRyYWZ0LCB3aXRoIGl0cyBmaXJzdCB2ZXJzaW9uIG9mIHRoZSBydWxlcy4AAAAAAAZjcmVhdGUAAAAAAAIAAAAAAAAACW9yZ2FuaXplcgAAAAAAABMAAAAAAAAADGNvbnN0aXR1dGlvbgAAB9AAAAAMQ29uc3RpdHV0aW9uAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAACRTdGVwcyBhIGp1ZGdlIGF3YXkgZnJvbSBvbmUgcHJvamVjdC4AAAAGcmVjdXNlAAAAAAACAAAAAAAAAAVqdWRnZQAAAAAAABMAAAAAAAAAB3RlYW1faWQAAAAABAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAACxPcGVucyB0aGUgaGFja2F0aG9uLCBhbGwgb2YgaXQsIGluIG9uZSBjYWxsLgAAAAZzZXRfdXAAAAAAAAIAAAAAAAAACnZhdWx0X3dhc20AAAAAA+4AAAAgAAAAAAAAAARzYWx0AAAD7gAAACAAAAABAAAD6QAAABMAAAAD",
        "AAAAAAAAAB5XaGF0IHRoZSB2YXVsdCBhY3R1YWxseSBob2xkcy4AAAAAAAdmdW5kaW5nAAAAAAAAAAABAAAD6QAAAAsAAAAD",
        "AAAAAAAAAC9XaGV0aGVyIGEgcHJpemUgcG9zaXRpb24gaGFzIGFscmVhZHkgYmVlbiBwYWlkLgAAAAAHaXNfcGFpZAAAAAACAAAAAAAAAAV0cmFjawAAAAAAABEAAAAAAAAABHJhbmsAAAAEAAAAAQAAAAE=",
        "AAAAAAAAACNXaGF0IGEgcHJpemUgcG9zaXRpb24gaXMgd29ydGggbm93LgAAAAAHcGF5YWJsZQAAAAACAAAAAAAAAAV0cmFjawAAAAAAABEAAAAAAAAABHJhbmsAAAAEAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAADVPcGVucyB0aGUgaGFja2F0aG9uIGZvciByZWdpc3RyYXRpb24gYW5kIHN1Ym1pc3Npb25zLgAAAAAAAAdwdWJsaXNoAAAAAAAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAACdPbmUgdHJhY2sncyBmaW5pc2hlZCByYW5raW5nLCBpbiBvcmRlci4AAAAAB3JhbmtpbmcAAAAAAQAAAAAAAAAFdHJhY2sAAAAAAAARAAAAAQAAA+kAAAPqAAAH0AAAAAlQbGFjZW1lbnQAAAAAAAAD",
        "AAAAAAAAAB5DbG9zZXMgdGhlIGhhY2thdGhvbiBmb3IgZ29vZC4AAAAAAAhjb21wbGV0ZQAAAAAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAADBXaGV0aGVyIHRoaXMgcGVyc29uIG1heSBjYXN0IGEgY29tbXVuaXR5IGJhbGxvdC4AAAAIbWF5X3ZvdGUAAAABAAAAAAAAAAN3aG8AAAAAEwAAAAEAAAPpAAAAAQAAAAM=",
        "AAAAAAAAADNBIHRyYWNrJ3MgbW92ZSB0byBhd2FyZCBub3RoaW5nLCBpZiBvbmUgd2FzIG9wZW5lZC4AAAAACG5vX2F3YXJkAAAAAQAAAAAAAAAFdHJhY2sAAAAAAAARAAAAAQAAA+kAAAfQAAAAC05vQXdhcmRDYXNlAAAAAAM=",
        "AAAAAAAAABlSZXBsYWNlcyB0aGUgZHJhZnQgcnVsZXMuAAAAAAAACWNvbmZpZ3VyZQAAAAAAAAEAAAAAAAAADGNvbnN0aXR1dGlvbgAAB9AAAAAMQ29uc3RpdHV0aW9uAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAADZXaGV0aGVyIHRoaXMgd2FsbGV0J3MgYmFsbG90IGhhcyBhbHJlYWR5IGJlZW4gY291bnRlZC4AAAAAAAloYXNfdm90ZWQAAAAAAAABAAAAAAAAAAV2b3RlcgAAAAAAABMAAAABAAAAAQ==",
        "AAAAAAAAABdBZGRzIHNvbWVvbmUgdG8gYSB0ZWFtLgAAAAAKYWRkX21lbWJlcgAAAAAAAgAAAAAAAAAHdGVhbV9pZAAAAAAEAAAAAAAAAAZtZW1iZXIAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAADRQb2ludHMgdGhlIGhhY2thdGhvbiBhdCB0aGUgdmF1bHQgaG9sZGluZyBpdHMgcHJpemUuAAAACmJpbmRfdmF1bHQAAAAAAAEAAAAAAAAABXZhdWx0AAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAADJXaGV0aGVyIHRoaXMganVkZ2Ugc3RlcHBlZCBhd2F5IGZyb20gdGhpcyBwcm9qZWN0LgAAAAAACmlzX3JlY3VzZWQAAAAAAAIAAAAAAAAABWp1ZGdlAAAAAAAAEwAAAAAAAAAHdGVhbV9pZAAAAAAEAAAAAQAAAAE=",
        "AAAAAAAAACtGcmVlemVzIHRoZSBydWxlcyBhbmQgcmV0dXJucyB0aGVpciBkaWdlc3QuAAAAAApsb2NrX3J1bGVzAAAAAAAAAAAAAQAAA+kAAAPuAAAAIAAAAAM=",
        "AAAAAAAAACBUaGUgdGVhbXMgb25lIHBlcnNvbiBiZWxvbmdzIHRvLgAAAAptZW1iZXJzaGlwAAAAAAABAAAAAAAAAAN3aG8AAAAAEwAAAAEAAAPqAAAABA==",
        "AAAAAAAAACJUaGUgZGlnZXN0IHNlYWxpbmcgdGhlIHNjb3JlY2FyZHMuAAAAAAAKc2NvcmVfcm9vdAAAAAAAAAAAAAEAAAPpAAAD7gAAACAAAAAD",
        "AAAAAAAAABFPbmUgdGVhbSdzIGVudHJ5LgAAAAAAAApzdWJtaXNzaW9uAAAAAAABAAAAAAAAAAd0ZWFtX2lkAAAAAAQAAAABAAAD6QAAB9AAAAAKU3VibWlzc2lvbgAAAAAAAw==",
        "AAAAAAAAAAlPbmUgdGVhbS4AAAAAAAAKdGVhbV9ieV9pZAAAAAAAAQAAAAAAAAACaWQAAAAAAAQAAAABAAAD6QAAB9AAAAAEVGVhbQAAAAM=",
        "AAAAAAAAACFIb3cgbWFueSB0ZWFtcyBoYXZlIGJlZW4gZm91bmRlZC4AAAAAAAAKdGVhbV9jb3VudAAAAAAAAAAAAAEAAAAE",
        "AAAAAAAAAB9UaGUgZGlnZXN0IHNlYWxpbmcgdGhlIGJhbGxvdHMuAAAAAAtiYWxsb3Rfcm9vdAAAAAAAAAAAAQAAA+kAAAPuAAAAIAAAAAM=",
        "AAAAAAAAAC5TdGFydHMgYSB0ZWFtLCB3aXRoIHRoZSBjYWxsZXIgYXMgaXRzIGNhcHRhaW4uAAAAAAALY3JlYXRlX3RlYW0AAAAAAQAAAAAAAAAHY2FwdGFpbgAAAAATAAAAAQAAA+kAAAAEAAAAAw==",
        "AAAAAAAAACtXaGF0IHRoZSBwcml6ZSB0YWJsZSBvbiBpdHMgb3duIGFkZHMgdXAgdG8uAAAAAAtwcml6ZV90b3RhbAAAAAAAAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAADZBIHByb2plY3QncyByZXZlYWxlZCBzY29yZWNhcmRzLCBhcyBhIGNvdW50IGFuZCBhIHN1bS4AAAAAAAtzY29yZV90YWxseQAAAAABAAAAAAAAAAd0ZWFtX2lkAAAAAAQAAAABAAAH0AAAAApTY29yZVRhbGx5AAA=",
        "AAAAAAAAACpPbmUgY29udHJpYnV0aW9uLCBieSB0aGUgb3JkZXIgaXQgYXJyaXZlZC4AAAAAAAtzcG9uc29yc2hpcAAAAAABAAAAAAAAAAVpbmRleAAAAAAAAAQAAAABAAAD6QAAB9AAAAALU3BvbnNvcnNoaXAAAAAAAw==",
        "AAAAAAAAAF1SZXR1cm5zIG9uZSBtZW1iZXIncyBzaGFyZSwgb25jZSB0aGV5IGhhdmUgaGFkIHRoZSB3aW5kb3cgdGhleSB3ZXJlCnByb21pc2VkIGFuZCBub3QgdXNlZCBpdC4AAAAAAAALc3dlZXBfc2hhcmUAAAAAAwAAAAAAAAAFdHJhY2sAAAAAAAARAAAAAAAAAARyYW5rAAAABAAAAAAAAAAGbWVtYmVyAAAAAAATAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAEZIb3cgbWFueSBwb2ludHMgYSBwcm9qZWN0IGhhcyBiZWVuIGdpdmVuLCBhY3Jvc3MgZXZlcnkgYmFsbG90IGNvdW50ZWQuAAAAAAALdm90ZV93ZWlnaHQAAAAAAQAAAAAAAAAHdGVhbV9pZAAAAAAEAAAAAQAAAAQ=",
        "AAAAAAAAADhPcGVucyBhIHByb3Bvc2VkIHRyYWNrLCBhbmQgd2l0aCBpdCB0aGUgcHJpemUgYmVoaW5kIGl0LgAAAAxhY2NlcHRfdHJhY2sAAAABAAAAAAAAAAJpZAAAAAAAEQAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAADdUaGUgbW92ZSB0byBlbmQgdGhlIGhhY2thdGhvbiBlYXJseSwgaWYgb25lIHdhcyBvcGVuZWQuAAAAAAxjYW5jZWxsYXRpb24AAAAAAAAAAQAAA+kAAAfQAAAAEENhbmNlbGxhdGlvbkNhc2UAAAAD",
        "AAAAAAAAABtUaGUgcnVsZXMsIGRyYWZ0IG9yIGxvY2tlZC4AAAAADGNvbnN0aXR1dGlvbgAAAAAAAAABAAAD6QAAB9AAAAAMQ29uc3RpdHV0aW9uAAAAAw==",
        "AAAAAAAAAEZXaGV0aGVyIGEgcHJvamVjdCBnYXRoZXJlZCB0aGUgc2NvcmVjYXJkcyBpdHMgdHJhY2sncyBxdW9ydW0gYXNrcyBmb3IuAAAAAAAMbWVldHNfcXVvcnVtAAAAAQAAAAAAAAAHdGVhbV9pZAAAAAAEAAAAAQAAA+kAAAABAAAAAw==",
        "AAAAAAAAAElXaGF0IHRoZSBwbGF0Zm9ybSBpcyBvd2VkIGZvciB0aGlzIGV2ZW50LCBhdCB0aGUgcmF0ZSBmcm96ZW4gYXQgdGhlIGxvY2suAAAAAAAADHBsYXRmb3JtX2ZlZQAAAAAAAAABAAAD6QAAAAsAAAAD",
        "AAAAAAAAABpPbmUgcGVyc29uJ3MgcmVnaXN0cmF0aW9uLgAAAAAADHJlZ2lzdHJhdGlvbgAAAAEAAAAAAAAACWFwcGxpY2FudAAAAAAAABMAAAABAAAD6QAAB9AAAAAMUmVnaXN0cmF0aW9uAAAAAw==",
        "AAAAAAAAABtPcGVucyBvbmUgc2VhbGVkIHNjb3JlY2FyZC4AAAAADHJldmVhbF9zY29yZQAAAAIAAAAAAAAACXNjb3JlY2FyZAAAAAAAB9AAAAAJU2NvcmVjYXJkAAAAAAAAAAAAAAVwcm9vZgAAAAAAA+oAAAPuAAAAIAAAAAEAAAPpAAAABAAAAAM=",
        "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",
        "AAAAAAAAADBPbmUgY3JpdGVyaW9uJ3MgcmV2ZWFsZWQgc2NvcmVzIGZvciBvbmUgcHJvamVjdC4AAAAPY3JpdGVyaW9uX3RhbGx5AAAAAAIAAAAAAAAAB3RlYW1faWQAAAAABAAAAAAAAAAJY3JpdGVyaW9uAAAAAAAAEQAAAAEAAAfQAAAADkNyaXRlcmlvblRhbGx5AAA=",
        "AAAAAAAAAEdHaXZlcyBvbmUgZGVhZGxpbmUgbW9yZSB0aW1lLCBpbnNpZGUgdGhlIGFsbG93YW5jZSB0aGUgcnVsZXMgYW5ub3VuY2VkLgAAAAAPZXh0ZW5kX2RlYWRsaW5lAAAAAAMAAAAAAAAACGRlYWRsaW5lAAAH0AAAAAhEZWFkbGluZQAAAAAAAAAIbW92ZWRfdG8AAAAGAAAAAAAAAAZyZWFzb24AAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAD9HaXZlcyBzZXZlcmFsIGRlYWRsaW5lcyBtb3JlIHRpbWUgYXQgb25jZSwgdW5kZXIgb25lIHNpZ25hdHVyZS4AAAAAD2V4dGVuZF9zY2hlZHVsZQAAAAACAAAAAAAAAAVtb3ZlcwAAAAAAA+oAAAfQAAAADERlYWRsaW5lTW92ZQAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAADdXaGF0IG9uZSBkZWFkbGluZSBoYXMgc3BlbnQgb2YgaXRzIGFubm91bmNlZCBhbGxvd2FuY2UuAAAAAA9leHRlbnNpb25fdXNhZ2UAAAAAAQAAAAAAAAAIZGVhZGxpbmUAAAfQAAAACERlYWRsaW5lAAAAAQAAB9AAAAAORXh0ZW5zaW9uVXNhZ2UAAA==",
        "AAAAAAAAACVXaGV0aGVyIHRoZSBwcml6ZSBpcyBjb3ZlcmVkIGluIGZ1bGwuAAAAAAAAD2lzX2Z1bGx5X2Z1bmRlZAAAAAAAAAAAAQAAA+kAAAABAAAAAw==",
        "AAAAAAAAADRPcGVucyBzZXR0bGVtZW50IG9uY2UgdGhlIHNhZmV0eSB3aW5kb3cgaGFzIHJ1biBvdXQuAAAAD29wZW5fc2V0dGxlbWVudAAAAAAAAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAACtSZXR1cm5zIGEgcG9zaXRpb24gdGhhdCBuZXZlciBoYWQgYSB3aW5uZXIuAAAAAA9zd2VlcF91bmNsYWltZWQAAAAAAgAAAAAAAAAFdHJhY2sAAAAAAAARAAAAAAAAAARyYW5rAAAABAAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAAAAACRUaGUgbGFyZ2VzdCB0b3RhbCBhbnkgcHJvamVjdCBob2xkcy4AAAAPdG9wX3ZvdGVfd2VpZ2h0AAAAAAAAAAABAAAABA==",
        "AAAAAAAAADlBZGRzIGEgaGVscGVyIHdobyBjYW4gd29yayB0aHJvdWdoIHRoZSBhcHBsaWNhdGlvbiBxdWV1ZS4AAAAAAAAQYWRkX2NvbGxhYm9yYXRvcgAAAAEAAAAAAAAADGNvbGxhYm9yYXRvcgAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAACZBZGRzIGEganVkZ2UncyBzaWduYXR1cmUgdG8gdGhhdCBtb3ZlLgAAAAAAEGFwcHJvdmVfbm9fYXdhcmQAAAACAAAAAAAAAAVqdWRnZQAAAAAAABMAAAAAAAAABXRyYWNrAAAAAAAAEQAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAADxIb3cgbWFueSBqdWRnZXMgYXJlIGxlZnQgdG8gc2NvcmUgYSBwcm9qZWN0LCBhZnRlciByZWN1c2Fscy4AAAAQYXZhaWxhYmxlX2p1ZGdlcwAAAAEAAAAAAAAAB3RlYW1faWQAAAAABAAAAAEAAAPpAAAABAAAAAM=",
        "AAAAAAAAADVUaGUgY2FzZSBhZ2FpbnN0IG9uZSB0ZWFtJ3MgZW50cnksIGlmIG9uZSB3YXMgb3BlbmVkLgAAAAAAABBkaXNxdWFsaWZpY2F0aW9uAAAAAQAAAAAAAAAHdGVhbV9pZAAAAAAEAAAAAQAAA+kAAAfQAAAAFERpc3F1YWxpZmljYXRpb25DYXNlAAAAAw==",
        "AAAAAAAAACtDb21wdXRlcyB0aGUgcmFua2luZyBhbmQgY2xvc2VzIHRoZSByZXN1bHQuAAAAABBmaW5hbGl6ZV9yZXN1bHRzAAAAAAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAACtIb2xkcyB0aGUgbW9uZXkgd2hlcmUgaXQgaXMsIHdpdGggYSByZWFzb24uAAAAABBwYXVzZV9zZXR0bGVtZW50AAAAAQAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAGNXaGF0IGhhcyB0byBiZSBpbiB0aGUgdmF1bHQgYmVmb3JlIHRoZSBoYWNrYXRob24gbWF5IG9wZW46IHRoZSBwcml6ZQp0YWJsZSBwbHVzIHRoZSBwbGF0Zm9ybSdzIGN1dC4AAAAAEHJlcXVpcmVkX2Z1bmRpbmcAAAAAAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAACdTZXR0bGVzIHRoZSBtb3ZlLCBvbmUgd2F5IG9yIHRoZSBvdGhlci4AAAAAEHJlc29sdmVfbm9fYXdhcmQAAAABAAAAAAAAAAV0cmFjawAAAAAAABEAAAABAAAD6QAAAAEAAAAD",
        "AAAAAAAAADVUaGUgZGlnZXN0IG9mIHRoZSBsb2NrZWQgcnVsZXMsIG9uY2UgdGhleSBhcmUgbG9ja2VkLgAAAAAAABFjb25zdGl0dXRpb25faGFzaAAAAAAAAAAAAAABAAAD6QAAA+4AAAAgAAAAAw==",
        "AAAAAAAAAEBPcGVucyBhIG1vdmUgdG8gc3RvcCBhIGhhY2thdGhvbiBwZW9wbGUgYXJlIGFscmVhZHkgYnVpbGRpbmcgaW4uAAAAEW9wZW5fY2FuY2VsbGF0aW9uAAAAAAAAAQAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAABpMZXRzIHRoZSBtb25leSBtb3ZlIGFnYWluLgAAAAAAEXJlc3VtZV9zZXR0bGVtZW50AAAAAAAAAQAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAD9FdmVyeSBzcG9uc29yZWQgdHJhY2sncyBuYW1lLCBpbiB0aGUgb3JkZXIgdGhleSB3ZXJlIGFza2VkIGZvci4AAAAAEXNwb25zb3JfdHJhY2tfaWRzAAAAAAAAAAAAAAEAAAPqAAAAEQ==",
        "AAAAAAAAADBIb3cgbWFueSBjb250cmlidXRpb25zIHRoaXMgaGFja2F0aG9uIGhhcyB0YWtlbi4AAAARc3BvbnNvcnNoaXBfY291bnQAAAAAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAChTZWFscyBldmVyeSBzY29yZWNhcmQgYmVoaW5kIG9uZSBkaWdlc3QuAAAAEnB1Ymxpc2hfc2NvcmVfcm9vdAAAAAAAAQAAAAAAAAAEcm9vdAAAA+4AAAAgAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAACFLZWVwcyBzb21lb25lIG91dCwgb24gdGhlIHJlY29yZC4AAAAAAAAScmVqZWN0X2FwcGxpY2F0aW9uAAAAAAADAAAAAAAAAAhyZXZpZXdlcgAAABMAAAAAAAAACWFwcGxpY2FudAAAAAAAABMAAAAAAAAABnJlYXNvbgAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAABBMZXRzIHNvbWVvbmUgaW4uAAAAE2FwcHJvdmVfYXBwbGljYXRpb24AAAAAAgAAAAAAAAAIcmV2aWV3ZXIAAAATAAAAAAAAAAlhcHBsaWNhbnQAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAC9TZWFscyBldmVyeSBjb21tdW5pdHkgYmFsbG90IGJlaGluZCBvbmUgZGlnZXN0LgAAAAATcHVibGlzaF9iYWxsb3Rfcm9vdAAAAAABAAAAAAAAAARyb290AAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAADVUdXJucyBhIHdob2xlIHF1ZXVlIGF3YXksIGFnYWluc3Qgb25lIHdyaXR0ZW4gcmVhc29uLgAAAAAAABNyZWplY3RfYXBwbGljYXRpb25zAAAAAAMAAAAAAAAACHJldmlld2VyAAAAEwAAAAAAAAAKYXBwbGljYW50cwAAAAAD6gAAABMAAAAAAAAABnJlYXNvbgAAAAAD7gAAACAAAAABAAAD6QAAAAQAAAAD",
        "AAAAAAAAABFSZW1vdmVzIGEgaGVscGVyLgAAAAAAABNyZW1vdmVfY29sbGFib3JhdG9yAAAAAAEAAAAAAAAADGNvbGxhYm9yYXRvcgAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAACFTZW5kcyB0aGUgcGxhdGZvcm0gaXRzIGN1dCwgb25jZS4AAAAAAAATc2V0dGxlX3BsYXRmb3JtX2ZlZQAAAAAAAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAChMZXRzIGEgd2hvbGUgcXVldWUgaW4sIG9uIG9uZSBzaWduYXR1cmUuAAAAFGFwcHJvdmVfYXBwbGljYXRpb25zAAAAAgAAAAAAAAAIcmV2aWV3ZXIAAAATAAAAAAAAAAphcHBsaWNhbnRzAAAAAAPqAAAAEwAAAAEAAAPpAAAABAAAAAM=",
        "AAAAAAAAACZBZGRzIGEganVkZ2UncyBzaWduYXR1cmUgdG8gdGhhdCBtb3ZlLgAAAAAAFGFwcHJvdmVfY2FuY2VsbGF0aW9uAAAAAQAAAAAAAAAFanVkZ2UAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAEVTdG9wcyB0aGUgaGFja2F0aG9uIGFuZCBzZW5kcyB0aGUgcG9vbCBiYWNrIGFsb25nIHRoZSBkZWNsYXJlZCByb3V0ZS4AAAAAAAAUcmVzb2x2ZV9jYW5jZWxsYXRpb24AAAAAAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAADFSdWxlcyBhbiBlbnRyeSBvdXQgb2YgdGhlIHJ1bm5pbmcsIG9uIHRoZSByZWNvcmQuAAAAAAAAFWludmFsaWRhdGVfc3VibWlzc2lvbgAAAAAAAAIAAAAAAAAAB3RlYW1faWQAAAAABAAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAADJPcGVucyBhIGNhc2UgZm9yIHJlbW92aW5nIGFuIGVudHJ5LCBvbiB0aGUgcmVjb3JkLgAAAAAAFW9wZW5fZGlzcXVhbGlmaWNhdGlvbgAAAAAAAAIAAAAAAAAAB3RlYW1faWQAAAAABAAAAAAAAAAGcmVhc29uAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAACRXaGV0aGVyIHRoYXQgY3V0IGhhcyBsZWZ0IHRoZSB2YXVsdC4AAAAXaXNfcGxhdGZvcm1fZmVlX3NldHRsZWQAAAAAAAAAAAEAAAAB",
        "AAAAAAAAACVBZGRzIGEganVkZ2UncyBzaWduYXR1cmUgdG8gdGhlIGNhc2UuAAAAAAAAGGFwcHJvdmVfZGlzcXVhbGlmaWNhdGlvbgAAAAIAAAAAAAAABWp1ZGdlAAAAAAAAEwAAAAAAAAAHdGVhbV9pZAAAAAAEAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAACdTZXR0bGVzIHRoZSBjYXNlLCBvbmUgd2F5IG9yIHRoZSBvdGhlci4AAAAAGHJlc29sdmVfZGlzcXVhbGlmaWNhdGlvbgAAAAEAAAAAAAAAB3RlYW1faWQAAAAABAAAAAEAAAPpAAAAAQAAAAM=",
        "AAAAAQAAACNPbmUganVkZ2UncyB2ZXJkaWN0IG9uIG9uZSBwcm9qZWN0LgAAAAAAAAAACVNjb3JlY2FyZAAAAAAAAAMAAAAAAAAABWp1ZGdlAAAAAAAAEwAAAC5PbmUgZW50cnkgcGVyIGNyaXRlcmlvbiBpbiB0aGUgdHJhY2sncyBydWJyaWMuAAAAAAAGc2NvcmVzAAAAAAPqAAAH0AAAAA5Dcml0ZXJpb25TY29yZQAAAAAAI1RoZSB0ZWFtIHdob3NlIHByb2plY3QgdGhpcyBzY29yZXMuAAAAAAR0ZWFtAAAABA==",
        "AAAAAQAAAEFBIHByb2plY3QncyByZXZlYWxlZCBzY29yZWNhcmRzLCBrZXB0IGFzIGEgcnVubmluZyBjb3VudCBhbmQgc3VtLgAAAAAAAAAAAAAKU2NvcmVUYWxseQAAAAAAAgAAAAAAAAAFY291bnQAAAAAAAAEAAAAAAAAAAV0b3RhbAAAAAAAAAY=",
        "AAAAAQAAACJXaGF0IG9uZSBqdWRnZSBnYXZlIG9uZSBjcml0ZXJpb24uAAAAAAAAAAAADkNyaXRlcmlvblNjb3JlAAAAAAACAAAAAAAAAAljcml0ZXJpb24AAAAAAAARAAAAHVplcm8gdG8gYSBodW5kcmVkLCBpbmNsdXNpdmUuAAAAAAAABXNjb3JlAAAAAAAABA==",
        "AAAAAQAAAEZPbmUgY3JpdGVyaW9uJ3MgcmV2ZWFsZWQgc2NvcmVzIGZvciBvbmUgcHJvamVjdCwgYXMgYSBjb3VudCBhbmQgYSBzdW0uAAAAAAAAAAAADkNyaXRlcmlvblRhbGx5AAAAAAACAAAAAAAAAAVjb3VudAAAAAAAAAQAAAAoU3VtIG9mIHRoZSByYXcgemVybyB0byBhIGh1bmRyZWQgc2NvcmVzLgAAAAV0b3RhbAAAAAAAAAY=" ]),
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
        set_up: this.txFromJSON<Result<string>>,
        funding: this.txFromJSON<Result<i128>>,
        is_paid: this.txFromJSON<boolean>,
        payable: this.txFromJSON<Result<i128>>,
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
        ballot_root: this.txFromJSON<Result<Buffer>>,
        create_team: this.txFromJSON<Result<u32>>,
        prize_total: this.txFromJSON<Result<i128>>,
        score_tally: this.txFromJSON<ScoreTally>,
        sponsorship: this.txFromJSON<Result<Sponsorship>>,
        sweep_share: this.txFromJSON<Result<i128>>,
        vote_weight: this.txFromJSON<u32>,
        accept_track: this.txFromJSON<Result<void>>,
        cancellation: this.txFromJSON<Result<CancellationCase>>,
        constitution: this.txFromJSON<Result<Constitution>>,
        meets_quorum: this.txFromJSON<Result<boolean>>,
        platform_fee: this.txFromJSON<Result<i128>>,
        registration: this.txFromJSON<Result<Registration>>,
        reveal_score: this.txFromJSON<Result<u32>>,
        settle_prize: this.txFromJSON<Result<i128>>,
        sponsor_tier: this.txFromJSON<Result<i128>>,
        advance_phase: this.txFromJSON<Result<Phase>>,
        decline_track: this.txFromJSON<Result<i128>>,
        open_no_award: this.txFromJSON<Result<void>>,
        propose_track: this.txFromJSON<Result<void>>,
        reveal_ballot: this.txFromJSON<Result<void>>,
        sponsor_track: this.txFromJSON<Result<SponsorTrack>>,
        sponsored_fee: this.txFromJSON<i128>,
        submit_appeal: this.txFromJSON<Result<void>>,
        sponsor_places: this.txFromJSON<Result<i128>>,
        submit_project: this.txFromJSON<Result<void>>,
        criterion_tally: this.txFromJSON<CriterionTally>,
        extend_deadline: this.txFromJSON<Result<void>>,
        extend_schedule: this.txFromJSON<Result<void>>,
        extension_usage: this.txFromJSON<ExtensionUsage>,
        is_fully_funded: this.txFromJSON<Result<boolean>>,
        open_settlement: this.txFromJSON<Result<void>>,
        sweep_unclaimed: this.txFromJSON<Result<i128>>,
        top_vote_weight: this.txFromJSON<u32>,
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
        sponsor_track_ids: this.txFromJSON<Array<string>>,
        sponsorship_count: this.txFromJSON<u32>,
        publish_score_root: this.txFromJSON<Result<void>>,
        reject_application: this.txFromJSON<Result<void>>,
        approve_application: this.txFromJSON<Result<void>>,
        publish_ballot_root: this.txFromJSON<Result<void>>,
        reject_applications: this.txFromJSON<Result<u32>>,
        remove_collaborator: this.txFromJSON<Result<void>>,
        settle_platform_fee: this.txFromJSON<Result<i128>>,
        approve_applications: this.txFromJSON<Result<u32>>,
        approve_cancellation: this.txFromJSON<Result<void>>,
        resolve_cancellation: this.txFromJSON<Result<i128>>,
        invalidate_submission: this.txFromJSON<Result<void>>,
        open_disqualification: this.txFromJSON<Result<void>>,
        is_platform_fee_settled: this.txFromJSON<boolean>,
        approve_disqualification: this.txFromJSON<Result<void>>,
        resolve_disqualification: this.txFromJSON<Result<boolean>>
  }
}