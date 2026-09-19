use core::cmp::Ordering;

use soroban_sdk::{contracttype, BytesN, Symbol, Vec};

use crate::constitution::{TieBreakRule, VotePolicy, VOTE_SPLIT_TOTAL_BPS};
use crate::scorecard::{CriterionScore, MAX_WEIGHTED_SCORE};

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

/// A track's move to award nothing, and how far along it is.
///
/// The five conditions the product attaches to this power are all here rather
/// than in a policy document: the track was marked before the rules locked, the
/// reason is recorded, the judges have to sign, the appeal window has to run
/// out, and only then does the money move. Every one of them is a line in
/// `resolve_no_award`, which is what makes this discretion rather than a
/// loophole.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NoAwardCase {
    /// When the organizer opened it, which is where the appeal window counts
    /// from.
    pub opened_at: u64,
    /// Digest of the written reason.
    pub reason: BytesN<32>,
    /// How many judges have signed.
    pub approvals: u32,
    /// Whether it has been settled one way or the other.
    pub resolved: bool,
}

/// One project's place in its track, and why it sits there.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Placement {
    pub team: u32,
    /// One based, counting down from the winner.
    pub rank: u32,
    pub final_score: u32,
    pub judge_average: u32,
    pub community: u32,
    /// How this project was separated from the one placed directly above it.
    /// The winner has nothing above them, so theirs reads as the score.
    pub decided_by: DecidedBy,
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

/// One project as the ranking sees it.
///
/// Everything the tie break chain can ask about is gathered here first, so the
/// comparison is a pure function of its inputs. That matters more than it
/// sounds: a ranking that reaches into storage while it sorts is a ranking
/// nobody can reproduce off chain, and reproducing it is the entire promise.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Candidate {
    pub team: u32,
    pub final_score: u32,
    /// The judges' mean, or zero when there were none.
    pub judge_average: u32,
    pub community: u32,
    /// When the project first arrived, which is the last resort separator.
    pub submitted_at: u64,
    /// Means for the criteria the tie break chain names, and no others.
    pub criterion_averages: Vec<CriterionScore>,
}

impl Candidate {
    fn criterion_average(&self, id: &Symbol) -> u32 {
        self.criterion_averages
            .iter()
            .find(|entry| &entry.criterion == id)
            .map(|entry| entry.score)
            .unwrap_or(0)
    }
}

/// Orders two projects, and names the step that separated them.
///
/// [`Ordering::Greater`] means `a` places above `b`. The chain is walked in the
/// order the constitution locked, and because that chain always ends in
/// submission order, this never returns `Equal` for two different projects.
pub fn compare(a: &Candidate, b: &Candidate, chain: &Vec<TieBreakRule>) -> (Ordering, DecidedBy) {
    if a.final_score != b.final_score {
        return (a.final_score.cmp(&b.final_score), DecidedBy::Score);
    }

    for rule in chain.iter() {
        let (ordering, decided_by) = match &rule {
            TieBreakRule::JudgeScore => {
                (a.judge_average.cmp(&b.judge_average), DecidedBy::JudgeScore)
            }
            TieBreakRule::Criterion(id) => (
                a.criterion_average(id).cmp(&b.criterion_average(id)),
                DecidedBy::Criterion,
            ),
            TieBreakRule::CommunityScore => {
                (a.community.cmp(&b.community), DecidedBy::CommunityScore)
            }
            // The project entered first places above, so the earlier timestamp
            // is the better one and the comparison is reversed. Two entries can
            // land in the same ledger and share a timestamp, so the team
            // identifier settles it after that: it is unique, it counts up in
            // the order teams were founded, and it is what makes this step
            // guaranteed to separate any two projects rather than merely
            // usually.
            TieBreakRule::SubmissionOrder => (
                b.submitted_at
                    .cmp(&a.submitted_at)
                    .then_with(|| b.team.cmp(&a.team)),
                DecidedBy::SubmissionOrder,
            ),
        };

        if ordering != Ordering::Equal {
            return (ordering, decided_by);
        }
    }

    (Ordering::Equal, DecidedBy::Score)
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{symbol_short, vec, Env};

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

    fn candidate(env: &Env, team: u32, final_score: u32) -> Candidate {
        Candidate {
            team,
            final_score,
            judge_average: 0,
            community: 0,
            submitted_at: 1_000,
            criterion_averages: vec![env],
        }
    }

    fn chain(env: &Env) -> Vec<TieBreakRule> {
        vec![
            env,
            TieBreakRule::JudgeScore,
            TieBreakRule::Criterion(symbol_short!("technical")),
            TieBreakRule::CommunityScore,
            TieBreakRule::SubmissionOrder,
        ]
    }

    #[test]
    fn a_higher_final_score_places_above_without_any_tie_break() {
        let env = Env::default();
        let ahead = candidate(&env, 1, 800_000);
        let behind = candidate(&env, 2, 700_000);

        assert_eq!(
            compare(&ahead, &behind, &chain(&env)),
            (Ordering::Greater, DecidedBy::Score)
        );
        assert_eq!(
            compare(&behind, &ahead, &chain(&env)),
            (Ordering::Less, DecidedBy::Score)
        );
    }

    #[test]
    fn a_tie_falls_to_the_judges_average_first() {
        let env = Env::default();
        let mut ahead = candidate(&env, 1, 700_000);
        let mut behind = candidate(&env, 2, 700_000);
        ahead.judge_average = 720_000;
        behind.judge_average = 690_000;

        assert_eq!(
            compare(&ahead, &behind, &chain(&env)),
            (Ordering::Greater, DecidedBy::JudgeScore)
        );
    }

    #[test]
    fn a_tie_that_survives_the_judges_falls_to_the_named_criterion() {
        let env = Env::default();
        let mut ahead = candidate(&env, 1, 700_000);
        let mut behind = candidate(&env, 2, 700_000);

        ahead.criterion_averages = vec![
            &env,
            CriterionScore {
                criterion: symbol_short!("technical"),
                score: 90,
            },
        ];
        behind.criterion_averages = vec![
            &env,
            CriterionScore {
                criterion: symbol_short!("technical"),
                score: 70,
            },
        ];

        assert_eq!(
            compare(&ahead, &behind, &chain(&env)),
            (Ordering::Greater, DecidedBy::Criterion)
        );
    }

    #[test]
    fn a_tie_that_survives_that_falls_to_the_community() {
        let env = Env::default();
        let mut ahead = candidate(&env, 1, 700_000);
        let mut behind = candidate(&env, 2, 700_000);
        ahead.community = 900_000;
        behind.community = 400_000;

        assert_eq!(
            compare(&ahead, &behind, &chain(&env)),
            (Ordering::Greater, DecidedBy::CommunityScore)
        );
    }

    /// The last resort, and the reason the chain can never end undecided: the
    /// project entered first places above.
    #[test]
    fn everything_else_being_equal_the_earlier_entry_places_above() {
        let env = Env::default();
        let mut early = candidate(&env, 1, 700_000);
        let mut late = candidate(&env, 2, 700_000);
        early.submitted_at = 1_000;
        late.submitted_at = 2_000;

        assert_eq!(
            compare(&early, &late, &chain(&env)),
            (Ordering::Greater, DecidedBy::SubmissionOrder)
        );
        assert_eq!(
            compare(&late, &early, &chain(&env)),
            (Ordering::Less, DecidedBy::SubmissionOrder)
        );
    }

    #[test]
    fn a_chain_step_that_ties_hands_over_to_the_next_one() {
        let env = Env::default();
        let mut ahead = candidate(&env, 1, 700_000);
        let mut behind = candidate(&env, 2, 700_000);

        // Level on the judges, level on the criterion, separated by the crowd.
        ahead.judge_average = 700_000;
        behind.judge_average = 700_000;
        ahead.community = 500_000;
        behind.community = 100_000;

        assert_eq!(
            compare(&ahead, &behind, &chain(&env)),
            (Ordering::Greater, DecidedBy::CommunityScore)
        );
    }

    /// A shorter chain still terminates, because submission order is always its
    /// last step and no two projects share a submission time and a team.
    #[test]
    fn the_shortest_chain_still_separates_everything() {
        let env = Env::default();
        let short = vec![&env, TieBreakRule::SubmissionOrder];

        let mut early = candidate(&env, 1, 700_000);
        let mut late = candidate(&env, 2, 700_000);
        early.submitted_at = 10;
        late.submitted_at = 20;

        assert_eq!(
            compare(&early, &late, &short),
            (Ordering::Greater, DecidedBy::SubmissionOrder)
        );
    }

    #[test]
    fn a_criterion_nobody_scored_reads_as_zero_on_both_sides() {
        let env = Env::default();
        let mut ahead = candidate(&env, 1, 700_000);
        let mut behind = candidate(&env, 2, 700_000);
        ahead.submitted_at = 10;
        behind.submitted_at = 20;

        let only_criterion = vec![
            &env,
            TieBreakRule::Criterion(symbol_short!("ghost")),
            TieBreakRule::SubmissionOrder,
        ];

        // Both read zero, so the chain moves on rather than stalling.
        assert_eq!(
            compare(&ahead, &behind, &only_criterion),
            (Ordering::Greater, DecidedBy::SubmissionOrder)
        );
    }

    /// Two entries can land in the same ledger. Without the identifier behind
    /// the timestamp the chain would run out with the two still level, and the
    /// contract would have no defined winner, which is the one outcome the
    /// product exists to remove.
    #[test]
    fn two_projects_entered_in_the_same_second_are_still_separated() {
        let env = Env::default();
        let first = candidate(&env, 1, 700_000);
        let second = candidate(&env, 2, 700_000);

        assert_eq!(first.submitted_at, second.submitted_at);
        assert_eq!(
            compare(&first, &second, &chain(&env)),
            (Ordering::Greater, DecidedBy::SubmissionOrder),
            "the team founded first places above"
        );
    }

    /// Whatever the inputs, two different projects never come out level.
    #[test]
    fn the_chain_never_leaves_two_projects_undecided() {
        let env = Env::default();
        let first = candidate(&env, 1, 700_000);
        let second = candidate(&env, 2, 700_000);

        for rules in [chain(&env), vec![&env, TieBreakRule::SubmissionOrder]] {
            assert_ne!(compare(&first, &second, &rules).0, Ordering::Equal);
        }
    }
}
