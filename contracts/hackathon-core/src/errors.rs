use soroban_sdk::contracterror;

/// Every rejection the core contract can produce.
//
// # Why there are only so many
//
// The contract spec caps an error enum at fifty cases, and that cap is
// normative: it lives in `Stellar-contract-spec.x` as `cases<50>`. An enum
// past it still compiles and still deploys, because the Rust reader is
// lenient, but the published interface it produces cannot be parsed by a
// strict XDR reader. The official JavaScript SDK is one, so a contract over
// the limit cannot be called from a browser at all, and no wallet or explorer
// can read its interface either.
//
// So the budget is real, and it is spent where it buys something. A caller
// hitting one of these already knows which entry point they called and what
// they passed it; the code only has to say what went wrong that the caller
// could not have known. That principle sorts the two kinds of failure:
//
// **Rules that were submitted and refused** collapse into
// [`Error::ConstitutionInvalid`]. The organizer is holding the document that
// was rejected, the SDK validates it field by field before it is ever signed,
// and it names the exact problem in the interface. Fifteen distinct codes for
// "the weights do not add up" versus "the appeal window is zero" were being
// spent to tell a client something the client already had in its hands.
//
// **Everything that depends on chain state** keeps its own code. Whether a
// deadline has passed, whether a prize was already paid, whether a case is
// still open: none of that can be known from the request alone, so the answer
// has to come back from here.
//
// # Numbering
//
// Codes are grouped by decade so a client can classify an unknown one by its
// range even when it does not recognise the variant. The numbering was chosen
// fresh when the enum was cut down to fit the cap, which was the last moment
// it could be done cheaply; no code here has ever appeared in a released
// client, and from here on a value is never reused for a different meaning.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    // Instance and authority
    NotInitialized = 1,
    AlreadyInitialized = 2,
    /// The caller is not the organizer, and not a collaborator where one would
    /// have done. Which of the two was needed is a property of the entry point
    /// rather than of the failure.
    NotAuthorized = 3,
    NotJudge = 4,
    NotTeamMember = 5,
    /// A collaborator change that cannot stand: already on the list, not on it,
    /// or the organizer trying to also be their own helper.
    CollaboratorInvalid = 6,
    VaultNotBound = 7,
    VaultAlreadyBound = 8,
    /// The vault named serves a different hackathon, or holds a different asset
    /// from the one the rules name.
    VaultRejected = 9,

    // The rules, as submitted
    /// The constitution does not hold together. Every validation failure
    /// arrives here, and the SDK is what tells an organizer which field.
    ConstitutionInvalid = 20,

    // Lifecycle
    /// The hackathon is not in a phase where this call means anything. Also
    /// covers a phase that ends on an action being asked to end on the clock.
    WrongPhase = 30,
    RulesAlreadyLocked = 31,
    DeadlineNotReached = 32,
    DeadlinePassed = 33,
    /// The schedule that would result does not run in order, which includes a
    /// deadline being asked to move backwards.
    ScheduleInvalid = 34,
    ExtensionLimitReached = 35,

    // Registration, teams and submissions
    /// The record named does not exist: no such application, team, submission,
    /// track, scorecard or prize position. The entry point says which.
    NotFound = 40,
    /// The application is not in the state the call needs: already filed, or
    /// already decided.
    ApplicationNotPending = 41,
    NotApproved = 42,
    /// This person cannot join this team: it is full, they are already on it,
    /// or they are already on another and the rules forbid a second.
    TeamJoinRejected = 43,
    /// The entry is out of the running, whether it was screened out or
    /// disqualified.
    SubmissionNotEligible = 44,

    // Judging
    /// The scorecard does not fit the rubric: a missing criterion, an unknown
    /// one, or a score outside the allowed range.
    ScorecardInvalid = 50,
    ScorecardAlreadyRecorded = 51,
    /// This judge stepped away from this project, or is being asked to step
    /// away from it twice.
    JudgeRecused = 52,
    WrongJudgingMode = 53,
    /// The sealing digest is already published and cannot be replaced. Covers
    /// scorecards and ballots alike.
    RootAlreadyPublished = 54,
    RootMissing = 55,
    ProofDoesNotMatchRoot = 56,

    // Community vote
    VoterNotEligible = 60,
    CommunityVoteDisabled = 62,
    BallotAlreadyCounted = 63,
    /// The ballot is not the shape the locked rules describe: too many choices,
    /// none at all, a project named twice or out of order, a choice worth
    /// nothing, or a total that is not the power the rules hand out.
    BallotMalformed = 64,

    // Discretion: disqualification, no award, cancellation
    /// A case of this kind is already running against this subject.
    CaseAlreadyOpen = 70,
    /// No case is running, or the one that was has already been settled.
    CaseNotOpen = 71,
    AlreadySigned = 72,
    JudgeApprovalThresholdNotMet = 73,
    AppealWindowOpen = 74,
    AppealWindowClosed = 75,
    /// The ranking cannot close while a case is still undecided.
    DisqualificationUnresolved = 76,
    NoAwardNotDeclarable = 77,

    // Result and settlement
    ResultsNotFinalized = 80,
    SafetyWindowOpen = 81,
    SettlementPaused = 82,
    SettlementNotPaused = 83,
    SettlementIncomplete = 84,
    PrizeAlreadyPaid = 85,
    ClaimPeriodOpen = 86,
    VaultUnderfunded = 87,

    // Sponsorship
    /// The contribution was turned down. One code for every way that happens:
    /// the locked rules never opened the door, the window has closed, the
    /// allowance is used up, the amount is under the floor the rules named, or
    /// the position it was aimed at is already settled.
    //
    // One rather than five, for the reason the enum's own budget forces and
    // [`Error::ConstitutionInvalid`] already demonstrates. A sponsor reaches
    // this holding the policy they were refused against: it is public, it was
    // frozen before they arrived, and the SDK checks their contribution
    // against it before anything is signed. Spending four of the two remaining
    // slots to tell a client which clause it already has would leave this
    // contract unable to say anything new ever again.
    SponsorshipRefused = 88,
}
