use soroban_sdk::{contracttype, Address, Symbol, Vec};

use crate::constitution::{Track, MAX_CRITERION_SCORE, WEIGHT_TOTAL_BPS};
use crate::errors::Error;

/// The largest a weighted score can be: full marks on every criterion.
//
// Scores are kept at this scale rather than divided down to a percentage. The
// division would happen twice, once here and once when averaging across
// judges, and each one would quietly drop a fraction of a point. On a close
// result that lost fraction is the difference between first and second, so the
// contract carries the full precision and only the interface rounds.
pub const MAX_WEIGHTED_SCORE: u32 = MAX_CRITERION_SCORE * WEIGHT_TOTAL_BPS;

/// A project's revealed scorecards, kept as a running count and sum.
//
// The average is the arithmetic mean of the valid scorecards, and holding the
// pair means computing it never requires loading every scorecard a project
// received. The sum is widened to sixty four bits so a project with hundreds
// of judges cannot overflow it.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct ScoreTally {
    pub count: u32,
    pub total: u64,
}

impl ScoreTally {
    /// The mean weighted score, at [`MAX_WEIGHTED_SCORE`] scale.
    //
    // A project nobody scored has no average rather than an average of zero.
    // Treating it as zero would quietly rank an unjudged project below a badly
    // judged one, which is a different claim from the one the data supports.
    pub fn average(&self) -> Option<u32> {
        if self.count == 0 {
            return None;
        }

        Some((self.total / self.count as u64) as u32)
    }
}

/// One criterion's revealed scores for one project, as a count and a sum.
//
// Kept alongside the weighted totals because the tie break chain can be asked
// to separate two projects on a single criterion, and the weighted total has
// already blended the criteria together by then.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct CriterionTally {
    pub count: u32,
    /// Sum of the raw zero to a hundred scores.
    pub total: u64,
}

impl CriterionTally {
    /// The mean raw score, or `None` when nobody scored it.
    pub fn average(&self) -> Option<u32> {
        if self.count == 0 {
            return None;
        }

        Some((self.total / self.count as u64) as u32)
    }
}

/// What one judge gave one criterion.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CriterionScore {
    pub criterion: Symbol,
    /// Zero to a hundred, inclusive.
    pub score: u32,
}

/// One judge's verdict on one project.
//
// In the easy mode this is signed off chain and only its digest reaches the
// chain before the reveal. In the strict mode the judge commits to it
// themselves. Either way the shape is the same, so the scoring maths has one
// implementation rather than two that can disagree.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Scorecard {
    pub judge: Address,
    /// The team whose project this scores.
    pub team: u32,
    /// One entry per criterion in the track's rubric.
    pub scores: Vec<CriterionScore>,
}

impl Scorecard {
    /// The weighted total, at [`MAX_WEIGHTED_SCORE`] scale.
    //
    // The rubric drives the loop rather than the scorecard, which is what
    // makes a missing criterion an error instead of a silent zero. A judge who
    // skipped the criterion a project was strongest on would otherwise cost
    // that project the weight of it without anyone noticing.
    pub fn weighted_total(&self, track: &Track) -> Result<u32, Error> {
        self.validate(track)?;

        let mut total: u32 = 0;
        for criterion in track.criteria.iter() {
            let given = self
                .score_for(&criterion.id)
                .ok_or(Error::ScorecardInvalid)?;

            total = total
                .checked_add(given * criterion.weight_bps)
                .ok_or(Error::ScorecardInvalid)?;
        }

        Ok(total)
    }

    /// What this scorecard gave one criterion.
    pub fn score_for(&self, criterion_id: &Symbol) -> Option<u32> {
        self.scores
            .iter()
            .find(|entry| &entry.criterion == criterion_id)
            .map(|entry| entry.score)
    }

    /// Rejects a scorecard the rubric cannot read.
    //
    // Every criterion has to appear exactly once and stay in range. An entry
    // naming a criterion the rubric does not have is refused rather than
    // ignored, because it means the judge scored against a different rubric
    // from the one that will be used to count them.
    pub fn validate(&self, track: &Track) -> Result<(), Error> {
        if self.scores.len() != track.criteria.len() {
            return Err(Error::ScorecardInvalid);
        }

        for (index, entry) in self.scores.iter().enumerate() {
            if entry.score > MAX_CRITERION_SCORE {
                return Err(Error::ScorecardInvalid);
            }

            if track.weight_of(&entry.criterion).is_none() {
                return Err(Error::ConstitutionInvalid);
            }

            for other in self.scores.iter().skip(index + 1) {
                if other.criterion == entry.criterion {
                    return Err(Error::ScorecardInvalid);
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::constitution::Criterion;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{symbol_short, vec, Env};

    fn track(env: &Env) -> Track {
        Track {
            id: symbol_short!("payments"),
            criteria: vec![
                env,
                Criterion {
                    id: symbol_short!("technical"),
                    weight_bps: 6_000,
                },
                Criterion {
                    id: symbol_short!("novelty"),
                    weight_bps: 4_000,
                },
            ],
            no_award_allowed: false,
        }
    }

    fn scorecard(env: &Env, technical: u32, novelty: u32) -> Scorecard {
        Scorecard {
            judge: Address::generate(env),
            team: 1,
            scores: vec![
                env,
                CriterionScore {
                    criterion: symbol_short!("technical"),
                    score: technical,
                },
                CriterionScore {
                    criterion: symbol_short!("novelty"),
                    score: novelty,
                },
            ],
        }
    }

    #[test]
    fn a_weighted_total_follows_the_rubric() {
        let env = Env::default();

        // 80 at sixty percent plus 60 at forty percent is 72 out of 100.
        let total = scorecard(&env, 80, 60)
            .weighted_total(&track(&env))
            .unwrap();

        assert_eq!(total, 80 * 6_000 + 60 * 4_000);
        assert_eq!(total, 720_000);
    }

    #[test]
    fn full_marks_reach_the_ceiling_and_nothing_reaches_the_floor() {
        let env = Env::default();

        assert_eq!(
            scorecard(&env, 100, 100)
                .weighted_total(&track(&env))
                .unwrap(),
            MAX_WEIGHTED_SCORE
        );
        assert_eq!(
            scorecard(&env, 0, 0).weighted_total(&track(&env)).unwrap(),
            0
        );
    }

    /// Keeping the full precision is the point. Dividing to a percentage here
    /// would turn these two into the same number.
    #[test]
    fn two_scorecards_a_hair_apart_stay_apart() {
        let env = Env::default();
        let track = track(&env);

        let higher = scorecard(&env, 80, 61).weighted_total(&track).unwrap();
        let lower = scorecard(&env, 80, 60).weighted_total(&track).unwrap();

        assert!(higher > lower);
        assert_eq!(higher - lower, 4_000);
    }

    #[test]
    fn a_score_above_a_hundred_is_refused() {
        let env = Env::default();

        assert_eq!(
            scorecard(&env, 101, 50).weighted_total(&track(&env)).err(),
            Some(Error::ScorecardInvalid)
        );
    }

    /// A skipped criterion would cost the project its full weight in silence.
    #[test]
    fn a_scorecard_missing_a_criterion_is_refused() {
        let env = Env::default();
        let mut card = scorecard(&env, 80, 60);
        card.scores.remove(1);

        assert_eq!(
            card.weighted_total(&track(&env)).err(),
            Some(Error::ScorecardInvalid)
        );
    }

    #[test]
    fn a_scorecard_scoring_the_same_criterion_twice_is_refused() {
        let env = Env::default();
        let mut card = scorecard(&env, 80, 60);
        card.scores.set(
            1,
            CriterionScore {
                criterion: symbol_short!("technical"),
                score: 90,
            },
        );

        assert_eq!(
            card.weighted_total(&track(&env)).err(),
            Some(Error::ScorecardInvalid)
        );
    }

    /// A criterion the rubric does not have means the judge worked from a
    /// different rubric than the one that will count them.
    #[test]
    fn a_scorecard_naming_an_unknown_criterion_is_refused() {
        let env = Env::default();
        let mut card = scorecard(&env, 80, 60);
        card.scores.set(
            1,
            CriterionScore {
                criterion: symbol_short!("ghost"),
                score: 90,
            },
        );

        assert_eq!(
            card.weighted_total(&track(&env)).err(),
            Some(Error::ConstitutionInvalid)
        );
    }

    #[test]
    fn a_single_criterion_rubric_passes_the_score_straight_through() {
        let env = Env::default();
        let track = Track {
            id: symbol_short!("solo"),
            criteria: vec![
                &env,
                Criterion {
                    id: symbol_short!("technical"),
                    weight_bps: WEIGHT_TOTAL_BPS,
                },
            ],
            no_award_allowed: false,
        };

        let card = Scorecard {
            judge: Address::generate(&env),
            team: 1,
            scores: vec![
                &env,
                CriterionScore {
                    criterion: symbol_short!("technical"),
                    score: 73,
                },
            ],
        };

        assert_eq!(card.weighted_total(&track).unwrap(), 73 * WEIGHT_TOTAL_BPS);
    }
}
