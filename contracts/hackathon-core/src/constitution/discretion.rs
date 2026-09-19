use soroban_sdk::contracttype;

use crate::errors::Error;

/// The longest a settlement may be held back after the result is final.
///
/// The window exists so a contract bug found between the ranking and the payout
/// can be caught before the money moves. It is capped because an open ended
/// hold is indistinguishable from not paying, and the participant has no way to
/// tell the two apart while they wait.
pub const MAX_SETTLEMENT_SAFETY_WINDOW: u64 = 48 * 60 * 60;

/// Where money goes when it is not awarded to a winner.
///
/// Which routes are legal depends on why the money is unspent, so each use
/// checks its own set rather than accepting the whole enum.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RefundRoute {
    /// Back to the organizer's address.
    Organizer = 0,
    /// Back to whoever deposited it, in proportion to what they put in. This is
    /// the route a sponsor wants, because it returns their contribution to them
    /// rather than to the organizer who spent none of it.
    Depositors = 1,
    /// Spread across the tracks that did award their prize.
    RemainingTracks = 2,
}

impl RefundRoute {
    /// Whether this route can return money that never reached a winner.
    ///
    /// `RemainingTracks` is refused here. A cancelled hackathon has no
    /// remaining tracks to pay, and an unclaimed prize belongs to a track that
    /// ran perfectly well, so there is nothing to spread it across.
    ///
    /// `Depositors` is refused too, for now and for a different reason: paying
    /// sponsors back in proportion needs the vault to remember who put in what,
    /// and it does not yet. Allowing the setting before the machinery exists
    /// would let an organizer promise a refund route the contract cannot walk,
    /// which is worse than not offering it.
    fn valid_for_return(self) -> bool {
        matches!(self, RefundRoute::Organizer)
    }
}

/// When the vault is allowed to pay.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SettlementMode {
    /// Payment runs the moment the result is final. Right for a small event
    /// where the operational win is that the money arrives in minutes.
    Immediate,
    /// Payment waits for this many seconds, during which a pre declared
    /// authority can pause it with a reason. Scores can never change either
    /// way; the window buys time to stop a payout, not to rewrite a result.
    SafetyWindow(u64),
}

impl SettlementMode {
    /// How long settlement is held back, in seconds.
    pub fn hold_seconds(self) -> u64 {
        match self {
            SettlementMode::Immediate => 0,
            SettlementMode::SafetyWindow(seconds) => seconds,
        }
    }

    /// Rejects a window of zero, which is [`SettlementMode::Immediate`] wearing
    /// a disguise, and one longer than the cap.
    pub fn validate(self) -> Result<(), Error> {
        match self {
            SettlementMode::Immediate => Ok(()),
            SettlementMode::SafetyWindow(seconds) => {
                if seconds == 0 || seconds > MAX_SETTLEMENT_SAFETY_WINDOW {
                    Err(Error::SettlementWindowInvalid)
                } else {
                    Ok(())
                }
            }
        }
    }
}

/// Every power the organizer holds after the rules are locked.
///
/// None of these are removed, because an organizer who cannot disqualify a
/// plagiarised entry or extend a deadline after an outage will not run their
/// event here. What the constitution does instead is publish each power before
/// anyone writes a line of code, bound it, and make every use of it leave a
/// record. Flexibility is kept; secrecy is not.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct DiscretionPolicy {
    /// Judges who must sign before a disqualification takes effect.
    pub disqualification_threshold: u32,
    /// Seconds a team has to answer a disqualification before it can be
    /// resolved.
    pub appeal_window: u64,
    /// When the vault may pay.
    pub settlement: SettlementMode,
    /// Seconds a winner has to claim a prize before the refund route applies.
    pub prize_claim_period: u64,
    /// Where an unclaimed prize goes once the claim period runs out.
    pub unclaimed_refund: RefundRoute,
    /// Where a track's prize goes when the track declares no award.
    pub no_award_refund: RefundRoute,
    /// Judges who must sign before a cancellation takes effect once submission
    /// has opened. Before that point the organizer can cancel alone, because
    /// nobody has spent anything yet.
    pub cancellation_threshold: u32,
    /// Where the prize pool goes when the hackathon is cancelled.
    pub cancellation_refund: RefundRoute,
}

impl DiscretionPolicy {
    /// Rejects a policy that cannot be honoured.
    ///
    /// `judge_count` is an argument because a threshold above the number of
    /// judges is not a strict rule, it is an unreachable one. A disqualification
    /// requiring four signatures from three judges can never resolve, so the
    /// power reads as available while being permanently dead, which is worse
    /// than not having it.
    pub fn validate(&self, judge_count: u32) -> Result<(), Error> {
        if self.disqualification_threshold == 0 || self.disqualification_threshold > judge_count {
            return Err(Error::DisqualificationThresholdInvalid);
        }

        if self.cancellation_threshold == 0 || self.cancellation_threshold > judge_count {
            return Err(Error::CancellationThresholdInvalid);
        }

        if self.appeal_window == 0 {
            return Err(Error::AppealWindowInvalid);
        }

        if self.prize_claim_period == 0 {
            return Err(Error::ClaimPeriodInvalid);
        }

        self.settlement.validate()?;

        // A track declaring no award can send its prize anywhere, including to
        // the tracks that did produce a winner, so `no_award_refund` is not
        // checked. The other two have nowhere to spread money to.
        if !self.unclaimed_refund.valid_for_return() || !self.cancellation_refund.valid_for_return()
        {
            return Err(Error::RefundRouteInvalid);
        }

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;

    const HOUR: u64 = 60 * 60;
    const DAY: u64 = 24 * HOUR;

    fn policy() -> DiscretionPolicy {
        DiscretionPolicy {
            disqualification_threshold: 3,
            appeal_window: 48 * HOUR,
            settlement: SettlementMode::SafetyWindow(24 * HOUR),
            prize_claim_period: 90 * DAY,
            unclaimed_refund: RefundRoute::Organizer,
            no_award_refund: RefundRoute::Organizer,
            cancellation_threshold: 3,
            cancellation_refund: RefundRoute::Organizer,
        }
    }

    #[test]
    fn a_workable_policy_is_accepted() {
        assert_eq!(policy().validate(5), Ok(()));
    }

    #[test]
    fn a_threshold_above_the_judge_count_can_never_resolve() {
        let mut policy = policy();
        policy.disqualification_threshold = 6;

        assert_eq!(
            policy.validate(5),
            Err(Error::DisqualificationThresholdInvalid)
        );
    }

    #[test]
    fn a_threshold_of_zero_would_let_anyone_disqualify() {
        let mut policy = policy();
        policy.disqualification_threshold = 0;

        assert_eq!(
            policy.validate(5),
            Err(Error::DisqualificationThresholdInvalid)
        );
    }

    #[test]
    fn the_cancellation_threshold_is_bounded_the_same_way() {
        let mut policy = policy();
        policy.cancellation_threshold = 9;

        assert_eq!(policy.validate(5), Err(Error::CancellationThresholdInvalid));

        policy.cancellation_threshold = 0;
        assert_eq!(policy.validate(5), Err(Error::CancellationThresholdInvalid));
    }

    #[test]
    fn a_disqualification_without_a_chance_to_answer_is_rejected() {
        let mut policy = policy();
        policy.appeal_window = 0;

        assert_eq!(policy.validate(5), Err(Error::AppealWindowInvalid));
    }

    #[test]
    fn a_prize_with_no_claim_period_is_rejected() {
        let mut policy = policy();
        policy.prize_claim_period = 0;

        assert_eq!(policy.validate(5), Err(Error::ClaimPeriodInvalid));
    }

    #[test]
    fn immediate_settlement_holds_nothing_back() {
        let mut policy = policy();
        policy.settlement = SettlementMode::Immediate;

        assert_eq!(policy.validate(5), Ok(()));
        assert_eq!(policy.settlement.hold_seconds(), 0);
    }

    #[test]
    fn a_safety_window_of_zero_is_refused_as_a_disguised_immediate() {
        let mut policy = policy();
        policy.settlement = SettlementMode::SafetyWindow(0);

        assert_eq!(policy.validate(5), Err(Error::SettlementWindowInvalid));
    }

    #[test]
    fn a_safety_window_longer_than_two_days_is_refused() {
        let mut policy = policy();

        policy.settlement = SettlementMode::SafetyWindow(MAX_SETTLEMENT_SAFETY_WINDOW);
        assert_eq!(policy.validate(5), Ok(()));

        policy.settlement = SettlementMode::SafetyWindow(MAX_SETTLEMENT_SAFETY_WINDOW + 1);
        assert_eq!(policy.validate(5), Err(Error::SettlementWindowInvalid));
    }

    #[test]
    fn a_no_award_prize_may_go_to_the_tracks_that_did_produce_a_winner() {
        let mut policy = policy();
        policy.no_award_refund = RefundRoute::RemainingTracks;

        assert_eq!(policy.validate(5), Ok(()));
    }

    #[test]
    fn a_cancelled_hackathon_has_no_remaining_tracks_to_pay() {
        let mut policy = policy();
        policy.cancellation_refund = RefundRoute::RemainingTracks;

        assert_eq!(policy.validate(5), Err(Error::RefundRouteInvalid));
    }

    #[test]
    fn an_unclaimed_prize_cannot_be_spread_across_other_tracks() {
        let mut policy = policy();
        policy.unclaimed_refund = RefundRoute::RemainingTracks;

        assert_eq!(policy.validate(5), Err(Error::RefundRouteInvalid));
    }

    /// Paying sponsors back in proportion is the route they would want, and it
    /// is refused until the vault can actually do it rather than accepted and
    /// quietly unhonoured.
    #[test]
    fn paying_sponsors_back_directly_is_not_offered_yet() {
        let mut policy = policy();
        policy.cancellation_refund = RefundRoute::Depositors;

        assert_eq!(policy.validate(5), Err(Error::RefundRouteInvalid));
    }

    #[test]
    fn a_single_judge_hackathon_needs_a_threshold_of_one() {
        let mut policy = policy();
        policy.disqualification_threshold = 1;
        policy.cancellation_threshold = 1;

        assert_eq!(policy.validate(1), Ok(()));
    }
}
