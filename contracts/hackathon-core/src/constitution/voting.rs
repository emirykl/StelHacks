use soroban_sdk::contracttype;

use crate::errors::Error;

/// The judge and community shares are expressed in basis points and always add
/// up to this total.
pub const VOTE_SPLIT_TOTAL_BPS: u32 = 10_000;

/// Above this share the community vote carries enough weight that the door has
/// to be narrowed as well: registration must be approved by the organizer, so
/// every ballot belongs to a person somebody vetted.
///
/// The share itself is not capped. An organizer may run a hackathon decided
/// entirely by the crowd, as long as the crowd was let in one applicant at a
/// time.
pub const APPROVED_REGISTRATION_REQUIRED_ABOVE_BPS: u32 = 3_000;

/// How a participant gets in.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RegistrationGate {
    /// Anyone who signs up is registered.
    Open = 0,
    /// Applicants are reviewed by the organizer and registered once approved.
    /// This is what an in person event with limited seats needs, and it is
    /// also the Sybil barrier behind a heavy community vote.
    Approved = 1,
}

/// How the final score is split between the judges and the crowd.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct VotePolicy {
    /// The judges' share of the final score, in basis points.
    pub judge_bps: u32,
    /// The community's share of the final score, in basis points.
    pub community_bps: u32,
}

impl VotePolicy {
    /// A hackathon decided entirely by its judges.
    pub fn judges_only() -> VotePolicy {
        VotePolicy {
            judge_bps: VOTE_SPLIT_TOTAL_BPS,
            community_bps: 0,
        }
    }

    /// A hackathon decided entirely by the crowd. Judges still score for the
    /// written feedback and still hold their say over disqualifications, but
    /// their scorecards do not move the ranking.
    pub fn community_only() -> VotePolicy {
        VotePolicy {
            judge_bps: 0,
            community_bps: VOTE_SPLIT_TOTAL_BPS,
        }
    }

    /// Whether there is a community vote to run at all.
    pub fn community_vote_enabled(&self) -> bool {
        self.community_bps > 0
    }

    /// Whether the judges' scorecards carry any weight in the final ranking.
    ///
    /// This is what releases the per project judge quorum. Requiring three
    /// valid scorecards before a result can be finalized protects the ranking,
    /// but when the scorecards contribute nothing to that ranking the same
    /// requirement would only strand a hackathon that is otherwise complete.
    pub fn judge_score_counts(&self) -> bool {
        self.judge_bps > 0
    }

    /// Rejects a split that does not add up, or one that gives the crowd real
    /// weight behind an open door.
    ///
    /// The second rule is the reason `gate` is an argument. The community share
    /// and the registration gate are two halves of one security decision, and
    /// checking them apart lets an organizer set a heavy vote on a hackathon
    /// anybody can sign up for. The share has no ceiling of its own; the gate
    /// is what has to keep up with it.
    pub fn validate(&self, gate: RegistrationGate) -> Result<(), Error> {
        let total = self
            .judge_bps
            .checked_add(self.community_bps)
            .ok_or(Error::VoteSplitInvalid)?;

        if total != VOTE_SPLIT_TOTAL_BPS {
            return Err(Error::VoteSplitInvalid);
        }

        if self.community_bps > APPROVED_REGISTRATION_REQUIRED_ABOVE_BPS
            && gate != RegistrationGate::Approved
        {
            return Err(Error::VoteSplitInvalid);
        }

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn a_judges_only_hackathon_needs_no_vote_window() {
        let policy = VotePolicy::judges_only();

        assert_eq!(policy.validate(RegistrationGate::Open), Ok(()));
        assert!(!policy.community_vote_enabled());
    }

    #[test]
    fn a_light_community_share_works_behind_an_open_door() {
        let policy = VotePolicy {
            judge_bps: 8_000,
            community_bps: 2_000,
        };

        assert_eq!(policy.validate(RegistrationGate::Open), Ok(()));
        assert!(policy.community_vote_enabled());
    }

    #[test]
    fn a_heavy_community_share_demands_approved_registration() {
        let policy = VotePolicy {
            judge_bps: 5_000,
            community_bps: 5_000,
        };

        assert_eq!(
            policy.validate(RegistrationGate::Open),
            Err(Error::VoteSplitInvalid)
        );
        assert_eq!(policy.validate(RegistrationGate::Approved), Ok(()));
    }

    #[test]
    fn the_threshold_for_approved_registration_is_thirty_percent() {
        let at_threshold = VotePolicy {
            judge_bps: 7_000,
            community_bps: 3_000,
        };
        let over_threshold = VotePolicy {
            judge_bps: 6_999,
            community_bps: 3_001,
        };

        assert_eq!(at_threshold.validate(RegistrationGate::Open), Ok(()));
        assert_eq!(
            over_threshold.validate(RegistrationGate::Open),
            Err(Error::VoteSplitInvalid)
        );
    }

    #[test]
    fn the_community_share_has_no_ceiling_behind_an_approved_door() {
        let crowd_led = VotePolicy {
            judge_bps: 1_000,
            community_bps: 9_000,
        };

        assert_eq!(crowd_led.validate(RegistrationGate::Approved), Ok(()));
        assert_eq!(
            VotePolicy::community_only().validate(RegistrationGate::Approved),
            Ok(())
        );
    }

    #[test]
    fn a_split_that_does_not_add_up_is_rejected() {
        let policy = VotePolicy {
            judge_bps: 8_000,
            community_bps: 1_000,
        };

        assert_eq!(
            policy.validate(RegistrationGate::Approved),
            Err(Error::VoteSplitInvalid)
        );
    }

    #[test]
    fn a_crowd_led_hackathon_still_needs_an_approved_door() {
        assert_eq!(
            VotePolicy::community_only().validate(RegistrationGate::Open),
            Err(Error::VoteSplitInvalid)
        );
    }

    #[test]
    fn the_judge_quorum_only_binds_while_scorecards_carry_weight() {
        assert!(VotePolicy::judges_only().judge_score_counts());

        let mostly_crowd = VotePolicy {
            judge_bps: 1_000,
            community_bps: 9_000,
        };
        assert!(mostly_crowd.judge_score_counts());

        assert!(!VotePolicy::community_only().judge_score_counts());
    }
}
