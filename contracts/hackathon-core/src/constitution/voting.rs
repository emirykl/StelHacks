use soroban_sdk::contracttype;

use crate::errors::Error;

/// The judge and community shares are expressed in basis points and always add
/// up to this total.
pub const VOTE_SPLIT_TOTAL_BPS: u32 = 10_000;

/// What one wallet gets to place when nobody said otherwise.
//
// Ten points across at most three projects. Ten because it divides the way
// people already think about a shortlist — five and five, or six three one —
// without asking anybody to reason in percentages, and three because a voter
// who may back the whole field is not ranking it.
pub const DEFAULT_VOTE_POWER: u32 = 10;

/// How many projects one ballot may name when nobody said otherwise.
pub const DEFAULT_MAX_CHOICES: u32 = 3;

/// The most one wallet may be given to place.
//
// Not a matter of taste. Every point placed is added into a per project
// running total and into the top total the community score divides by, and a
// ceiling here is what keeps those additions inside a `u32` no matter how many
// people vote.
pub const MAX_VOTE_POWER: u32 = 1_000;

/// How the final score is split between the judges and the crowd, and what one
/// wallet gets to do with its share.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct VotePolicy {
    /// The judges' share of the final score, in basis points.
    pub judge_bps: u32,
    /// The community's share of the final score, in basis points.
    pub community_bps: u32,
    /// How many points one wallet has to place, all of which it must spend.
    //
    // Frozen with everything else that decides an outcome. An organizer who
    // could raise it mid week would be handing more influence to whoever had
    // not voted yet, and one who could lower it would be shrinking ballots
    // already cast.
    pub power: u32,
    /// The most projects one ballot may be spread across.
    //
    // A ceiling rather than a quota: a voter backing one project puts
    // everything on it, and this is what stops a ballot from being spread so
    // thin that it says nothing while still counting everywhere.
    pub max_choices: u32,
}

impl VotePolicy {
    /// A hackathon decided entirely by its judges.
    pub fn judges_only() -> VotePolicy {
        VotePolicy {
            judge_bps: VOTE_SPLIT_TOTAL_BPS,
            community_bps: 0,
            power: 0,
            max_choices: 0,
        }
    }

    /// A hackathon decided entirely by the crowd. Judges still score for the
    /// written feedback and still hold their say over disqualifications, but
    /// their scorecards do not move the ranking.
    pub fn community_only() -> VotePolicy {
        VotePolicy {
            judge_bps: 0,
            community_bps: VOTE_SPLIT_TOTAL_BPS,
            power: DEFAULT_VOTE_POWER,
            max_choices: DEFAULT_MAX_CHOICES,
        }
    }

    /// Whether there is a community vote to run at all.
    pub fn community_vote_enabled(&self) -> bool {
        self.community_bps > 0
    }

    /// Whether the judges' scorecards carry any weight in the final ranking.
    //
    // This is what releases the per project judge quorum. Requiring three
    // valid scorecards before a result can be finalized protects the ranking,
    // but when the scorecards contribute nothing to that ranking the same
    // requirement would only strand a hackathon that is otherwise complete.
    pub fn judge_score_counts(&self) -> bool {
        self.judge_bps > 0
    }

    /// Rejects a split that does not add up.
    //
    // The share itself has no ceiling. A hackathon may be decided entirely by
    // its judges, entirely by its crowd, or anywhere in between, because every
    // hackathon admits its participants by application and the crowd casting
    // those ballots was let in one approval at a time.
    pub fn validate(&self) -> Result<(), Error> {
        let total = self
            .judge_bps
            .checked_add(self.community_bps)
            .ok_or(Error::ConstitutionInvalid)?;

        if total != VOTE_SPLIT_TOTAL_BPS {
            return Err(Error::ConstitutionInvalid);
        }

        /* A vote nobody casts describes nothing, so it has to say nothing. The
        alternative is a document carrying a ballot size for an event with no
        ballots, which reads to anybody checking it as a community vote that was
        configured and then quietly switched off. */
        if !self.community_vote_enabled() {
            if self.power != 0 || self.max_choices != 0 {
                return Err(Error::ConstitutionInvalid);
            }

            return Ok(());
        }

        // Fewer points than projects would mean a spread nobody could actually
        // cast, since every choice has to carry at least one point.
        if self.max_choices == 0 || self.power < self.max_choices {
            return Err(Error::ConstitutionInvalid);
        }

        if self.power > MAX_VOTE_POWER {
            return Err(Error::ConstitutionInvalid);
        }

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;

    /// A split that runs a community vote of the default size.
    fn split(judge_bps: u32, community_bps: u32) -> VotePolicy {
        VotePolicy {
            judge_bps,
            community_bps,
            power: DEFAULT_VOTE_POWER,
            max_choices: DEFAULT_MAX_CHOICES,
        }
    }

    #[test]
    fn a_judges_only_hackathon_needs_no_vote_window() {
        let policy = VotePolicy::judges_only();

        assert_eq!(policy.validate(), Ok(()));
        assert!(!policy.community_vote_enabled());
    }

    #[test]
    fn a_mixed_split_opens_the_community_vote() {
        let policy = split(8_000, 2_000);

        assert_eq!(policy.validate(), Ok(()));
        assert!(policy.community_vote_enabled());
    }

    #[test]
    fn the_community_share_has_no_ceiling() {
        assert_eq!(split(1_000, 9_000).validate(), Ok(()));
        assert_eq!(VotePolicy::community_only().validate(), Ok(()));
    }

    #[test]
    fn a_split_that_does_not_add_up_is_rejected() {
        assert_eq!(
            split(8_000, 1_000).validate(),
            Err(Error::ConstitutionInvalid)
        );
        assert_eq!(
            split(8_000, 3_000).validate(),
            Err(Error::ConstitutionInvalid)
        );
    }

    #[test]
    fn a_split_that_overflows_is_rejected() {
        assert_eq!(
            split(u32::MAX, 1).validate(),
            Err(Error::ConstitutionInvalid)
        );
    }

    #[test]
    fn the_judge_quorum_only_binds_while_scorecards_carry_weight() {
        assert!(VotePolicy::judges_only().judge_score_counts());
        assert!(split(1_000, 9_000).judge_score_counts());
        assert!(!VotePolicy::community_only().judge_score_counts());
    }

    /// One point on one project is the plain "pick a winner" vote, and the
    /// rules have to be able to say it as easily as they say a spread.
    #[test]
    fn a_single_point_on_a_single_project_is_a_valid_shape() {
        let mut one_each = split(5_000, 5_000);
        one_each.power = 1;
        one_each.max_choices = 1;

        assert_eq!(one_each.validate(), Ok(()));
    }

    #[test]
    fn a_ballot_with_fewer_points_than_projects_is_rejected() {
        let mut thin = split(5_000, 5_000);
        thin.power = 2;
        thin.max_choices = 3;

        assert_eq!(thin.validate(), Err(Error::ConstitutionInvalid));
    }

    #[test]
    fn a_community_vote_that_places_nothing_is_rejected() {
        let mut powerless = split(5_000, 5_000);
        powerless.power = 0;
        powerless.max_choices = 0;

        assert_eq!(powerless.validate(), Err(Error::ConstitutionInvalid));
    }

    /// The ceiling is what keeps every running total inside a `u32`, so a
    /// document asking for more than it is refused rather than rounded down.
    #[test]
    fn a_ballot_larger_than_the_ceiling_is_rejected() {
        let mut huge = split(5_000, 5_000);
        huge.power = MAX_VOTE_POWER + 1;
        huge.max_choices = 3;

        assert_eq!(huge.validate(), Err(Error::ConstitutionInvalid));
    }

    /// A document that sets a ballot size for a vote it never runs is a
    /// document somebody will read as having a community vote.
    #[test]
    fn a_judges_only_split_carrying_a_ballot_size_is_rejected() {
        let mut contradictory = VotePolicy::judges_only();
        contradictory.power = DEFAULT_VOTE_POWER;
        contradictory.max_choices = DEFAULT_MAX_CHOICES;

        assert_eq!(contradictory.validate(), Err(Error::ConstitutionInvalid));
    }
}
