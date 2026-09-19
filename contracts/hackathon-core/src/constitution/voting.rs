use soroban_sdk::contracttype;

use crate::errors::Error;

/// The judge and community shares are expressed in basis points and always add
/// up to this total.
pub const VOTE_SPLIT_TOTAL_BPS: u32 = 10_000;

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

    /// Rejects a split that does not add up.
    ///
    /// The share itself has no ceiling. A hackathon may be decided entirely by
    /// its judges, entirely by its crowd, or anywhere in between, because every
    /// hackathon admits its participants by application and the crowd casting
    /// those ballots was let in one approval at a time.
    pub fn validate(&self) -> Result<(), Error> {
        let total = self
            .judge_bps
            .checked_add(self.community_bps)
            .ok_or(Error::ConstitutionInvalid)?;

        if total != VOTE_SPLIT_TOTAL_BPS {
            return Err(Error::ConstitutionInvalid);
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

        assert_eq!(policy.validate(), Ok(()));
        assert!(!policy.community_vote_enabled());
    }

    #[test]
    fn a_mixed_split_opens_the_community_vote() {
        let policy = VotePolicy {
            judge_bps: 8_000,
            community_bps: 2_000,
        };

        assert_eq!(policy.validate(), Ok(()));
        assert!(policy.community_vote_enabled());
    }

    #[test]
    fn the_community_share_has_no_ceiling() {
        let crowd_led = VotePolicy {
            judge_bps: 1_000,
            community_bps: 9_000,
        };

        assert_eq!(crowd_led.validate(), Ok(()));
        assert_eq!(VotePolicy::community_only().validate(), Ok(()));
    }

    #[test]
    fn a_split_that_does_not_add_up_is_rejected() {
        let short = VotePolicy {
            judge_bps: 8_000,
            community_bps: 1_000,
        };
        let over = VotePolicy {
            judge_bps: 8_000,
            community_bps: 3_000,
        };

        assert_eq!(short.validate(), Err(Error::ConstitutionInvalid));
        assert_eq!(over.validate(), Err(Error::ConstitutionInvalid));
    }

    #[test]
    fn a_split_that_overflows_is_rejected() {
        let policy = VotePolicy {
            judge_bps: u32::MAX,
            community_bps: 1,
        };

        assert_eq!(policy.validate(), Err(Error::ConstitutionInvalid));
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
