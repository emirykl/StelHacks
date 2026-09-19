use soroban_sdk::contracterror;

/// Every rejection the core contract can produce.
///
/// The numbering is grouped by area so that a client can classify an unknown
/// code by its decade even when it does not recognise the exact variant.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    // Instance and authority
    AlreadyInitialised = 1,
    NotInitialised = 2,
    NotOrganiser = 3,
    NotJudge = 4,
    NotTeamMember = 5,
    NotVault = 6,

    // Configuration
    TrackNotFound = 20,
    TrackAlreadyExists = 21,
    CriteriaWeightsInvalid = 22,
    CriteriaMissing = 23,
    JudgeAlreadyAssigned = 24,
    JudgeNotAssigned = 25,
    JudgeQuorumInvalid = 26,
    VoteSplitInvalid = 27,
    PrizeTiersInvalid = 28,
    TieBreakInvalid = 29,

    // Lifecycle
    WrongPhase = 40,
    PhaseOrderInvalid = 41,
    RulesAlreadyLocked = 42,
    RulesNotLocked = 43,
    DeadlineNotReached = 44,
    DeadlinePassed = 45,
    ScheduleInvalid = 46,

    // Registration and submission
    TeamAlreadyRegistered = 60,
    TeamNotFound = 61,
    TeamSharesInvalid = 62,
    MemberAlreadyInTeam = 63,
    SubmissionNotFound = 64,
    SubmissionAlreadyExists = 65,
    SubmissionNotEligible = 66,

    // Judging
    ScorecardAlreadyRecorded = 80,
    ScorecardNotFound = 81,
    ScoreOutOfRange = 82,
    JudgeRecused = 83,
    ScoreRootAlreadyPublished = 84,
    ScoreRootMissing = 85,
    RevealDoesNotMatchRoot = 86,
    JudgeQuorumNotMet = 87,

    // Community vote
    VoterNotEligible = 100,
    VoteAlreadyCast = 101,
    SelfVoteRejected = 102,
    CommunityVoteDisabled = 103,

    // Screening, disqualification and appeal
    AlreadyInvalidated = 120,
    DisqualificationAlreadyOpen = 121,
    DisqualificationNotOpen = 122,
    AppealWindowOpen = 123,
    AppealWindowClosed = 124,
    JudgeApprovalThresholdNotMet = 125,
    AlreadySigned = 126,

    // Result and settlement
    ResultsAlreadyFinalised = 140,
    ResultsNotFinalised = 141,
    NoAwardNotDeclarable = 142,
    SettlementPaused = 143,
    SettlementNotPaused = 144,
    SafetyWindowOpen = 145,
    PrizeAlreadyPaid = 146,
    VaultUnderfunded = 147,
}
