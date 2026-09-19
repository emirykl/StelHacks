use soroban_sdk::contracttype;

use crate::errors::Error;

/// The judge and community shares are expressed in basis points and always add
/// up to this total.
pub const VOTE_SPLIT_TOTAL_BPS: u32 = 10_000;

/// The community may shape the ranking but never own it outright. Judges keep
/// at least forty percent of the final score, so a hackathon can never be
/// decided purely by who brought the most friends.
pub const MAX_COMMUNITY_SHARE_BPS: u32 = 6_000;

/// Above this share the community vote carries enough weight that the door has
/// to be narrowed as well: registration must be approved by the organizer, so
/// every ballot belongs to a person somebody vetted.
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

    /// Whether there is a community vote to run at all.
    pub fn community_vote_enabled(&self) -> bool {
        self.community_bps > 0
    }

    /// Rejects a split that does not add up, hands the crowd more than the cap,
    /// or gives the crowd real weight behind an open door.
    ///
    /// The last rule is the reason `gate` is an argument. The community share
    /// and the registration gate are two halves of one security decision, and
    /// checking them apart lets an organizer set a heavy vote on a hackathon
    /// anybody can sign up for.
    pub fn validate(&self, gate: RegistrationGate) -> Result<(), Error> {
        let total = self
            .judge_bps
            .checked_add(self.community_bps)
            .ok_or(Error::VoteSplitInvalid)?;

        if total != VOTE_SPLIT_TOTAL_BPS {
            return Err(Error::VoteSplitInvalid);
        }

        if self.community_bps > MAX_COMMUNITY_SHARE_BPS {
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
    fn the_community_share_is_capped_at_sixty_percent() {
        let at_cap = VotePolicy {
            judge_bps: 4_000,
            community_bps: 6_000,
        };
        let over_cap = VotePolicy {
            judge_bps: 3_999,
            community_bps: 6_001,
        };

        assert_eq!(at_cap.validate(RegistrationGate::Approved), Ok(()));
        assert_eq!(
            over_cap.validate(RegistrationGate::Approved),
            Err(Error::VoteSplitInvalid)
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
    fn a_hackathon_cannot_hand_the_whole_score_to_the_crowd() {
        let community_led = VotePolicy {
            judge_bps: 0,
            community_bps: 10_000,
        };

        assert_eq!(
            community_led.validate(RegistrationGate::Approved),
            Err(Error::VoteSplitInvalid)
        );
    }
}
