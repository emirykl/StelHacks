//! Everything the core contract announces.
//!
//! Events are not decoration here. The indexer rebuilds the entire application
//! state from this stream and from nothing else, which is what lets the product
//! claim that no backend decides anything. If a change to the hackathon does
//! not emit an event, it is a change the proof page cannot show, so every state
//! transition has one.
//!
//! Addresses are topics so a client can follow one participant without reading
//! the whole stream. Values that a reader needs but would never filter on, such
//! as a digest, travel in the payload.

use soroban_sdk::{contractevent, Address, BytesN, Env, Symbol};

use crate::constitution::Deadline;
use crate::phase::Phase;

/// A hackathon exists and is open for configuration.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Created {
    #[topic]
    pub organizer: Address,
}

/// The draft rules were replaced.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Configured {
    #[topic]
    pub organizer: Address,
}

/// Someone gained or lost the right to review applications.
///
/// One event covers both directions, with the direction in the payload, so a
/// client following an address sees its whole history under a single name.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CollaboratorChanged {
    #[topic]
    pub collaborator: Address,
    pub added: bool,
}

/// The rules stopped being editable.
///
/// The digest travels along because this is the value every later reader
/// compares against, and an indexer holding this event never has to call the
/// contract to learn what was locked.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RulesLocked {
    pub constitution_hash: BytesN<32>,
}

/// The hackathon knows where its prize lives.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultBound {
    #[topic]
    pub vault: Address,
}

/// The prize is fully funded and the event is open.
///
/// This is the moment the status strip a participant reads turns green, so the
/// funded amount travels along and nobody has to cross reference two contracts
/// to know the prize was real before anyone started building.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Published {
    pub funded: i128,
    pub required: i128,
}

/// Someone asked to take part.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Applied {
    #[topic]
    pub applicant: Address,
}

/// A request was decided.
///
/// The reason digest travels with a refusal, so a decision that keeps somebody
/// out of a hackathon can never be a silent one.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApplicationDecided {
    #[topic]
    pub applicant: Address,
    pub approved: bool,
    pub reason: BytesN<32>,
}

/// A team was founded.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TeamFounded {
    #[topic]
    pub captain: Address,
    pub team: u32,
}

/// Someone joined a team.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MemberJoined {
    #[topic]
    pub member: Address,
    pub team: u32,
}

pub fn applied(env: &Env, applicant: &Address) {
    Applied {
        applicant: applicant.clone(),
    }
    .publish(env);
}

pub fn application_decided(env: &Env, applicant: &Address, approved: bool, reason: &BytesN<32>) {
    ApplicationDecided {
        applicant: applicant.clone(),
        approved,
        reason: reason.clone(),
    }
    .publish(env);
}

pub fn team_founded(env: &Env, captain: &Address, team: u32) {
    TeamFounded {
        captain: captain.clone(),
        team,
    }
    .publish(env);
}

pub fn member_joined(env: &Env, member: &Address, team: u32) {
    MemberJoined {
        member: member.clone(),
        team,
    }
    .publish(env);
}

/// A project entered the hackathon, or an existing entry was revised.
///
/// The digest travels along because this is the value that gets pinned at the
/// deadline, and an indexer holding this event can show a participant exactly
/// what was frozen.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectSubmitted {
    #[topic]
    pub team: u32,
    pub track: Symbol,
    pub metadata_hash: BytesN<32>,
    pub revised: bool,
}

/// An entry was ruled out during screening.
///
/// The project keeps its page. What changes is its standing, and the reason has
/// to travel with the decision.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubmissionInvalidated {
    #[topic]
    pub team: u32,
    pub reason: BytesN<32>,
}

/// The hackathon moved into its next stage.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PhaseAdvanced {
    pub phase: Phase,
}

/// One deadline moved, inside the allowance the rules announced.
///
/// This event is the entire difference between the schedule that was hashed and
/// the schedule in force, so an indexer holding the constitution and this
/// stream can show both and say which is which. The reason travels with it
/// because time is the resource participants plan around, and a window that
/// moved without a stated cause is indistinguishable from one that moved to
/// suit somebody.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeadlineExtended {
    #[topic]
    pub deadline: Deadline,
    pub moved_to: u64,
    /// What this move cost against the deadline's announced budget.
    pub seconds_added: u64,
    pub reason: BytesN<32>,
}

pub fn deadline_extended(
    env: &Env,
    deadline: Deadline,
    moved_to: u64,
    seconds_added: u64,
    reason: &BytesN<32>,
) {
    DeadlineExtended {
        deadline,
        moved_to,
        seconds_added,
        reason: reason.clone(),
    }
    .publish(env);
}

/// A judge stepped away from one project.
///
/// Recorded rather than silent, because a judge quietly not scoring a project
/// and a judge declaring a conflict look identical from outside otherwise.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct JudgeRecused {
    #[topic]
    pub judge: Address,
    pub team: u32,
}

/// Every scorecard is now sealed behind one digest.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScoreRootPublished {
    pub root: BytesN<32>,
}

/// One scorecard was opened.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScoreRevealed {
    #[topic]
    pub judge: Address,
    pub team: u32,
    /// The weighted total, at full precision.
    pub weighted: u32,
}

/// Every community ballot is now sealed behind one digest.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BallotRootPublished {
    pub root: BytesN<32>,
}

/// One ballot was opened and counted.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BallotCounted {
    #[topic]
    pub voter: Address,
    pub team: u32,
    /// The project's running total, so a reader can follow the count without
    /// replaying every ballot.
    pub votes: u32,
}

/// One track's ranking is settled.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TrackRanked {
    #[topic]
    pub track: Symbol,
    /// How many projects made it into the ranking, which is not the same as how
    /// many entered: screened out and short of quorum are both left out.
    pub ranked: u32,
}

/// The result is closed and the money can move.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResultsFinalized {
    /// When the ranking closed, which is where any safety window counts from.
    pub at: u64,
}

/// A prize reached a winner.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrizePaid {
    #[topic]
    pub to: Address,
    pub track: Symbol,
    pub rank: u32,
    pub team: u32,
    pub amount: i128,
}

/// Settlement was held, or released again.
///
/// The reason travels with the hold, because money stopping is the one thing a
/// winner cannot investigate for themselves.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SettlementHeld {
    pub paused: bool,
    pub reason: BytesN<32>,
}

/// A track moved to award nothing, or that move was settled.
///
/// The reason travels with it and the signature count travels with it, because
/// a prize that was announced and then not paid is the single thing a
/// participant is most owed an explanation for.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NoAwardOpened {
    #[topic]
    pub track: Symbol,
    pub reason: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NoAwardApproved {
    #[topic]
    pub track: Symbol,
    pub judge: Address,
    pub approvals: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NoAwardResolved {
    #[topic]
    pub track: Symbol,
    pub declared: bool,
    pub returned: i128,
}

pub fn no_award_opened(env: &Env, track: &Symbol, reason: &BytesN<32>) {
    NoAwardOpened {
        track: track.clone(),
        reason: reason.clone(),
    }
    .publish(env);
}

pub fn no_award_approved(env: &Env, track: &Symbol, judge: &Address, approvals: u32) {
    NoAwardApproved {
        track: track.clone(),
        judge: judge.clone(),
        approvals,
    }
    .publish(env);
}

pub fn no_award_resolved(env: &Env, track: &Symbol, declared: bool, returned: i128) {
    NoAwardResolved {
        track: track.clone(),
        declared,
        returned,
    }
    .publish(env);
}

/// A prize nobody claimed went back along the announced route.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrizeSwept {
    #[topic]
    pub track: Symbol,
    pub rank: u32,
    pub amount: i128,
}

pub fn prize_swept(env: &Env, track: &Symbol, rank: u32, amount: i128) {
    PrizeSwept {
        track: track.clone(),
        rank,
        amount,
    }
    .publish(env);
}

pub fn prize_paid(env: &Env, to: &Address, track: &Symbol, rank: u32, team: u32, amount: i128) {
    PrizePaid {
        to: to.clone(),
        track: track.clone(),
        rank,
        team,
        amount,
    }
    .publish(env);
}

pub fn settlement_held(env: &Env, paused: bool, reason: &BytesN<32>) {
    SettlementHeld {
        paused,
        reason: reason.clone(),
    }
    .publish(env);
}

pub fn track_ranked(env: &Env, track: &Symbol, ranked: u32) {
    TrackRanked {
        track: track.clone(),
        ranked,
    }
    .publish(env);
}

pub fn results_finalized(env: &Env, at: u64) {
    ResultsFinalized { at }.publish(env);
}

pub fn ballot_root_published(env: &Env, root: &BytesN<32>) {
    BallotRootPublished { root: root.clone() }.publish(env);
}

pub fn ballot_counted(env: &Env, voter: &Address, team: u32, votes: u32) {
    BallotCounted {
        voter: voter.clone(),
        team,
        votes,
    }
    .publish(env);
}

pub fn score_root_published(env: &Env, root: &BytesN<32>) {
    ScoreRootPublished { root: root.clone() }.publish(env);
}

pub fn score_revealed(env: &Env, judge: &Address, team: u32, weighted: u32) {
    ScoreRevealed {
        judge: judge.clone(),
        team,
        weighted,
    }
    .publish(env);
}

pub fn judge_recused(env: &Env, judge: &Address, team: u32) {
    JudgeRecused {
        judge: judge.clone(),
        team,
    }
    .publish(env);
}

pub fn phase_advanced(env: &Env, phase: Phase) {
    PhaseAdvanced { phase }.publish(env);
}

pub fn project_submitted(
    env: &Env,
    team: u32,
    track: &Symbol,
    metadata_hash: &BytesN<32>,
    revised: bool,
) {
    ProjectSubmitted {
        team,
        track: track.clone(),
        metadata_hash: metadata_hash.clone(),
        revised,
    }
    .publish(env);
}

pub fn submission_invalidated(env: &Env, team: u32, reason: &BytesN<32>) {
    SubmissionInvalidated {
        team,
        reason: reason.clone(),
    }
    .publish(env);
}

pub fn vault_bound(env: &Env, vault: &Address) {
    VaultBound {
        vault: vault.clone(),
    }
    .publish(env);
}

pub fn published(env: &Env, funded: i128, required: i128) {
    Published { funded, required }.publish(env);
}

pub fn hackathon_created(env: &Env, organizer: &Address) {
    Created {
        organizer: organizer.clone(),
    }
    .publish(env);
}

pub fn hackathon_configured(env: &Env, organizer: &Address) {
    Configured {
        organizer: organizer.clone(),
    }
    .publish(env);
}

pub fn collaborator_added(env: &Env, collaborator: &Address) {
    CollaboratorChanged {
        collaborator: collaborator.clone(),
        added: true,
    }
    .publish(env);
}

pub fn collaborator_removed(env: &Env, collaborator: &Address) {
    CollaboratorChanged {
        collaborator: collaborator.clone(),
        added: false,
    }
    .publish(env);
}

pub fn rules_locked(env: &Env, hash: &BytesN<32>) {
    RulesLocked {
        constitution_hash: hash.clone(),
    }
    .publish(env);
}
