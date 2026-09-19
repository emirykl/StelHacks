use soroban_sdk::{contracttype, Symbol, Vec};

use crate::constitution::scoring::Track;
use crate::errors::Error;

/// One step in the chain that separates two projects on the same score.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TieBreakRule {
    /// The higher judge score wins. Useful when the community share is what
    /// pulled the two level.
    JudgeScore,
    /// The higher score on one named criterion wins, for example the technical
    /// one. The criterion has to exist in every track, since a rule that cannot
    /// be applied in some track leaves that track without a tie break.
    Criterion(Symbol),
    /// The higher community score wins.
    CommunityScore,
    /// The project submitted first wins. This is the only rule guaranteed to
    /// separate any two projects, which is why a chain has to end with it.
    SubmissionOrder,
}

/// Rejects a tie break chain that cannot always produce an order.
///
/// The chain has to end in [`TieBreakRule::SubmissionOrder`]. Every other rule
/// can come out level a second time, and a ranking that can stop mid comparison
/// has no defined winner, which is exactly the situation the product exists to
/// remove. Ending on submission order means the chain always terminates, and
/// the proof page can name the step that decided it.
pub fn validate_tie_break(
    rules: &Vec<TieBreakRule>,
    tracks: &Vec<Track>,
    community_vote_enabled: bool,
) -> Result<(), Error> {
    if rules.is_empty() {
        return Err(Error::TieBreakInvalid);
    }

    let last = rules.len() - 1;

    for (index, rule) in rules.iter().enumerate() {
        let is_last = index as u32 == last;

        if matches!(rule, TieBreakRule::SubmissionOrder) != is_last {
            return Err(Error::TieBreakInvalid);
        }

        for other in rules.iter().skip(index + 1) {
            if other == rule {
                return Err(Error::TieBreakInvalid);
            }
        }

        match &rule {
            TieBreakRule::Criterion(id) => {
                for track in tracks.iter() {
                    if track.weight_of(id).is_none() {
                        return Err(Error::TieBreakInvalid);
                    }
                }
            }
            TieBreakRule::CommunityScore => {
                if !community_vote_enabled {
                    return Err(Error::TieBreakInvalid);
                }
            }
            TieBreakRule::JudgeScore | TieBreakRule::SubmissionOrder => {}
        }
    }

    Ok(())
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::constitution::scoring::Criterion;
    use soroban_sdk::{symbol_short, vec, Env};

    fn tracks(env: &Env) -> Vec<Track> {
        let criteria = vec![
            env,
            Criterion {
                id: symbol_short!("technical"),
                weight_bps: 6_000,
            },
            Criterion {
                id: symbol_short!("novelty"),
                weight_bps: 4_000,
            },
        ];

        vec![
            env,
            Track {
                id: symbol_short!("payments"),
                criteria: criteria.clone(),
                no_award_allowed: false,
            },
            Track {
                id: symbol_short!("defi"),
                criteria,
                no_award_allowed: false,
            },
        ]
    }

    #[test]
    fn a_chain_ending_in_submission_order_is_accepted() {
        let env = Env::default();
        let rules = vec![
            &env,
            TieBreakRule::JudgeScore,
            TieBreakRule::Criterion(symbol_short!("technical")),
            TieBreakRule::CommunityScore,
            TieBreakRule::SubmissionOrder,
        ];

        assert_eq!(validate_tie_break(&rules, &tracks(&env), true), Ok(()));
    }

    #[test]
    fn the_shortest_workable_chain_is_submission_order_alone() {
        let env = Env::default();
        let rules = vec![&env, TieBreakRule::SubmissionOrder];

        assert_eq!(validate_tie_break(&rules, &tracks(&env), false), Ok(()));
    }

    #[test]
    fn a_chain_that_can_end_level_is_rejected() {
        let env = Env::default();
        let rules = vec![&env, TieBreakRule::JudgeScore];

        assert_eq!(
            validate_tie_break(&rules, &tracks(&env), false),
            Err(Error::TieBreakInvalid)
        );
    }

    #[test]
    fn submission_order_cannot_sit_in_the_middle() {
        let env = Env::default();
        let rules = vec![
            &env,
            TieBreakRule::SubmissionOrder,
            TieBreakRule::JudgeScore,
        ];

        assert_eq!(
            validate_tie_break(&rules, &tracks(&env), false),
            Err(Error::TieBreakInvalid)
        );
    }

    #[test]
    fn an_empty_chain_is_rejected() {
        let env = Env::default();
        let rules: Vec<TieBreakRule> = vec![&env];

        assert_eq!(
            validate_tie_break(&rules, &tracks(&env), false),
            Err(Error::TieBreakInvalid)
        );
    }

    #[test]
    fn a_repeated_rule_is_rejected() {
        let env = Env::default();
        let rules = vec![
            &env,
            TieBreakRule::JudgeScore,
            TieBreakRule::JudgeScore,
            TieBreakRule::SubmissionOrder,
        ];

        assert_eq!(
            validate_tie_break(&rules, &tracks(&env), false),
            Err(Error::TieBreakInvalid)
        );
    }

    #[test]
    fn a_criterion_missing_from_one_track_is_rejected() {
        let env = Env::default();
        let mut tracks = tracks(&env);
        tracks.set(
            1,
            Track {
                id: symbol_short!("defi"),
                criteria: vec![
                    &env,
                    Criterion {
                        id: symbol_short!("impact"),
                        weight_bps: 10_000,
                    },
                ],
                no_award_allowed: false,
            },
        );

        let rules = vec![
            &env,
            TieBreakRule::Criterion(symbol_short!("technical")),
            TieBreakRule::SubmissionOrder,
        ];

        assert_eq!(
            validate_tie_break(&rules, &tracks, false),
            Err(Error::TieBreakInvalid)
        );
    }

    #[test]
    fn a_community_step_needs_a_community_vote() {
        let env = Env::default();
        let rules = vec![
            &env,
            TieBreakRule::CommunityScore,
            TieBreakRule::SubmissionOrder,
        ];

        assert_eq!(validate_tie_break(&rules, &tracks(&env), true), Ok(()));
        assert_eq!(
            validate_tie_break(&rules, &tracks(&env), false),
            Err(Error::TieBreakInvalid)
        );
    }
}
