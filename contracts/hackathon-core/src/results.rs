use soroban_sdk::contracttype;

use crate::constitution::{VotePolicy, VOTE_SPLIT_TOTAL_BPS};
use crate::scorecard::MAX_WEIGHTED_SCORE;

/// The community's share of a project, at [`MAX_WEIGHTED_SCORE`] scale.
///
/// The project the crowd liked most scores full marks and the rest are placed
/// relative to it, which is what the PRD's formula says: a hundred times this
/// project's votes over the highest count anyone reached.
///
/// A hackathon where nobody voted has no top count, and every project scores
/// zero on the community component rather than the contract dividing by zero
/// and taking the whole result down with it. The transparency page marks that
/// case rather than hiding it.
pub fn community_score(votes: u32, top_votes: u32) -> u32 {
    if top_votes == 0 {
        return 0;
    }

    ((votes as u64 * MAX_WEIGHTED_SCORE as u64) / top_votes as u64) as u32
}

/// A project's final score, at [`MAX_WEIGHTED_SCORE`] scale.
///
/// Both components arrive on the same scale, so the split is a plain weighted
/// average. A project with no valid scorecards contributes nothing from the
/// judge side rather than a zero, because those are different claims: one says
/// the judges thought little of it, the other says the judges never saw it.
pub fn final_score(vote: &VotePolicy, judge_average: Option<u32>, community: u32) -> u32 {
    let judge = judge_average.unwrap_or(0) as u64;

    let weighted = judge * vote.judge_bps as u64 + community as u64 * vote.community_bps as u64;

    (weighted / VOTE_SPLIT_TOTAL_BPS as u64) as u32
}

/// Which step of the tie break chain decided a placing.
///
/// Recorded alongside the ranking so the proof page can name it. A participant
/// asking why they came fourth deserves to read the actual reason rather than
/// be told the contract worked it out.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum DecidedBy {
    /// The final scores differed; no tie break was needed.
    Score = 0,
    /// Separated on the judges' average.
    JudgeScore = 1,
    /// Separated on one named criterion.
    Criterion = 2,
    /// Separated on the community vote.
    CommunityScore = 3,
    /// Separated by which project was entered first.
    SubmissionOrder = 4,
}

#[cfg(test)]
mod test {
    use super::*;

    fn split(judge_bps: u32, community_bps: u32) -> VotePolicy {
        VotePolicy {
            judge_bps,
            community_bps,
        }
    }

    #[test]
    fn the_most_voted_project_scores_full_marks() {
        assert_eq!(community_score(40, 40), MAX_WEIGHTED_SCORE);
    }

    #[test]
    fn the_rest_are_placed_relative_to_it() {
        assert_eq!(community_score(20, 40), MAX_WEIGHTED_SCORE / 2);
        assert_eq!(community_score(10, 40), MAX_WEIGHTED_SCORE / 4);
        assert_eq!(community_score(0, 40), 0);
    }

    /// A hackathon nobody voted in must not take the whole result down with a
    /// division by zero.
    #[test]
    fn a_vote_nobody_cast_scores_zero_rather_than_failing() {
        assert_eq!(community_score(0, 0), 0);
    }

    #[test]
    fn a_judges_only_hackathon_scores_on_the_judges_alone() {
        let policy = split(VOTE_SPLIT_TOTAL_BPS, 0);

        assert_eq!(final_score(&policy, Some(720_000), 0), 720_000);
        assert_eq!(
            final_score(&policy, Some(720_000), MAX_WEIGHTED_SCORE),
            720_000,
            "the community component carries no weight here"
        );
    }

    #[test]
    fn an_eighty_twenty_split_blends_both_sides() {
        let policy = split(8_000, 2_000);

        // Eighty percent of 700,000 plus twenty percent of 1,000,000.
        let expected = (700_000u64 * 8_000 + 1_000_000u64 * 2_000) / 10_000;

        assert_eq!(
            final_score(&policy, Some(700_000), 1_000_000),
            expected as u32
        );
    }

    #[test]
    fn a_crowd_led_hackathon_scores_on_the_crowd_alone() {
        let policy = split(0, VOTE_SPLIT_TOTAL_BPS);

        assert_eq!(final_score(&policy, Some(900_000), 400_000), 400_000);
    }

    /// A project the judges never saw and a project the judges disliked are
    /// different claims, but the final score can only carry one number, so the
    /// absence contributes nothing rather than dragging the total down further.
    #[test]
    fn a_project_with_no_scorecards_contributes_nothing_from_the_judges() {
        let policy = split(8_000, 2_000);

        let expected = MAX_WEIGHTED_SCORE as u64 * 2_000 / 10_000;

        assert_eq!(
            final_score(&policy, None, MAX_WEIGHTED_SCORE),
            expected as u32
        );
    }

    #[test]
    fn full_marks_everywhere_reach_the_ceiling() {
        let policy = split(8_000, 2_000);

        assert_eq!(
            final_score(&policy, Some(MAX_WEIGHTED_SCORE), MAX_WEIGHTED_SCORE),
            MAX_WEIGHTED_SCORE
        );
    }

    #[test]
    fn the_arithmetic_holds_at_the_top_of_the_range() {
        let policy = split(5_000, 5_000);

        // Nothing here may overflow on the way through.
        assert_eq!(
            final_score(&policy, Some(MAX_WEIGHTED_SCORE), MAX_WEIGHTED_SCORE),
            MAX_WEIGHTED_SCORE
        );
        assert_eq!(community_score(u32::MAX, u32::MAX), MAX_WEIGHTED_SCORE);
    }
}
