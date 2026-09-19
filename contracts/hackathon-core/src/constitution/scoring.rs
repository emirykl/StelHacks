use soroban_sdk::{contracttype, Symbol, Vec};

use crate::errors::Error;

/// Criterion weights are expressed in basis points and must add up to this
/// total within a track, so a weighted score never needs a rounding policy
/// that differs between the contract and a client recomputing it.
pub const WEIGHT_TOTAL_BPS: u32 = 10_000;

/// The inclusive upper bound of a single criterion score. Judges work on a
/// plain 0 to 100 scale because anything cleverer stops being readable for the
/// participant who wants to know why they placed fourth.
pub const MAX_CRITERION_SCORE: u32 = 100;

/// One line of the rubric a judge fills in.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Criterion {
    /// Stable identifier, for example `technical` or `stellar_use`.
    pub id: Symbol,
    /// Share of the track score, in basis points.
    pub weight_bps: u32,
}

/// A competition track with its own rubric and prize line.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Track {
    /// Stable identifier, for example `payments`.
    pub id: Symbol,
    /// The rubric, whose weights add up to [`WEIGHT_TOTAL_BPS`].
    pub criteria: Vec<Criterion>,
    /// Whether the organizer declared, before the lock, that this track may end
    /// without awarding its prize. A track without this flag can never be left
    /// unpaid later.
    pub no_award_allowed: bool,
}

impl Track {
    /// Rejects a rubric that cannot produce a well defined score.
    ///
    /// A track needs at least one criterion, every criterion needs a non zero
    /// weight, no identifier may repeat, and the weights must add up exactly.
    pub fn validate(&self) -> Result<(), Error> {
        if self.criteria.is_empty() {
            return Err(Error::CriteriaMissing);
        }

        let mut total: u32 = 0;
        for (index, criterion) in self.criteria.iter().enumerate() {
            if criterion.weight_bps == 0 {
                return Err(Error::CriteriaWeightsInvalid);
            }

            total = total
                .checked_add(criterion.weight_bps)
                .ok_or(Error::CriteriaWeightsInvalid)?;

            for other in self.criteria.iter().skip(index + 1) {
                if other.id == criterion.id {
                    return Err(Error::CriteriaWeightsInvalid);
                }
            }
        }

        if total != WEIGHT_TOTAL_BPS {
            return Err(Error::CriteriaWeightsInvalid);
        }

        Ok(())
    }

    /// The weight of a criterion, or `None` when the rubric does not contain it.
    pub fn weight_of(&self, criterion_id: &Symbol) -> Option<u32> {
        self.criteria
            .iter()
            .find(|criterion| &criterion.id == criterion_id)
            .map(|criterion| criterion.weight_bps)
    }
}

/// One payable position, for example second place in the payments track.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrizeTier {
    /// The track this position belongs to.
    pub track: Symbol,
    /// One based rank within the track.
    pub rank: u32,
    /// Amount in the smallest unit of the prize asset.
    pub amount: i128,
}

/// Rejects a prize table that cannot be paid out unambiguously.
///
/// Every position needs a rank starting at one, a positive amount, and no
/// repeated rank inside a track.
pub fn validate_prize_tiers(tiers: &Vec<PrizeTier>) -> Result<(), Error> {
    if tiers.is_empty() {
        return Err(Error::PrizeTiersInvalid);
    }

    for (index, tier) in tiers.iter().enumerate() {
        if tier.rank == 0 || tier.amount <= 0 {
            return Err(Error::PrizeTiersInvalid);
        }

        for other in tiers.iter().skip(index + 1) {
            if other.track == tier.track && other.rank == tier.rank {
                return Err(Error::PrizeTiersInvalid);
            }
        }
    }

    Ok(())
}

/// The total the vault has to hold before the hackathon may be published.
pub fn total_prize_amount(tiers: &Vec<PrizeTier>) -> Result<i128, Error> {
    let mut total: i128 = 0;
    for tier in tiers.iter() {
        total = total
            .checked_add(tier.amount)
            .ok_or(Error::PrizeTiersInvalid)?;
    }

    Ok(total)
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{symbol_short, vec, Env};

    fn criterion(id: Symbol, weight_bps: u32) -> Criterion {
        Criterion { id, weight_bps }
    }

    fn track(criteria: Vec<Criterion>) -> Track {
        Track {
            id: symbol_short!("payments"),
            criteria,
            no_award_allowed: false,
        }
    }

    #[test]
    fn a_rubric_whose_weights_add_up_is_accepted() {
        let env = Env::default();
        let track = track(vec![
            &env,
            criterion(symbol_short!("technical"), 3_000),
            criterion(symbol_short!("novelty"), 2_500),
            criterion(symbol_short!("ux"), 1_500),
            criterion(symbol_short!("stellar"), 2_000),
            criterion(symbol_short!("impact"), 1_000),
        ]);

        assert_eq!(track.validate(), Ok(()));
        assert_eq!(track.weight_of(&symbol_short!("ux")), Some(1_500));
        assert_eq!(track.weight_of(&symbol_short!("missing")), None);
    }

    #[test]
    fn a_rubric_that_does_not_add_up_is_rejected() {
        let env = Env::default();
        let track = track(vec![
            &env,
            criterion(symbol_short!("technical"), 3_000),
            criterion(symbol_short!("novelty"), 3_000),
        ]);

        assert_eq!(track.validate(), Err(Error::CriteriaWeightsInvalid));
    }

    #[test]
    fn a_zero_weight_criterion_is_rejected() {
        let env = Env::default();
        let track = track(vec![
            &env,
            criterion(symbol_short!("technical"), 10_000),
            criterion(symbol_short!("novelty"), 0),
        ]);

        assert_eq!(track.validate(), Err(Error::CriteriaWeightsInvalid));
    }

    #[test]
    fn a_repeated_criterion_is_rejected() {
        let env = Env::default();
        let track = track(vec![
            &env,
            criterion(symbol_short!("technical"), 5_000),
            criterion(symbol_short!("technical"), 5_000),
        ]);

        assert_eq!(track.validate(), Err(Error::CriteriaWeightsInvalid));
    }

    #[test]
    fn an_empty_rubric_is_rejected() {
        let env = Env::default();
        let track = track(vec![&env]);

        assert_eq!(track.validate(), Err(Error::CriteriaMissing));
    }

    #[test]
    fn a_prize_table_with_distinct_ranks_per_track_is_accepted() {
        let env = Env::default();
        let tiers = vec![
            &env,
            PrizeTier {
                track: symbol_short!("payments"),
                rank: 1,
                amount: 5_000,
            },
            PrizeTier {
                track: symbol_short!("payments"),
                rank: 2,
                amount: 3_000,
            },
            PrizeTier {
                track: symbol_short!("defi"),
                rank: 1,
                amount: 2_000,
            },
        ];

        assert_eq!(validate_prize_tiers(&tiers), Ok(()));
        assert_eq!(total_prize_amount(&tiers), Ok(10_000));
    }

    #[test]
    fn a_repeated_rank_within_a_track_is_rejected() {
        let env = Env::default();
        let tiers = vec![
            &env,
            PrizeTier {
                track: symbol_short!("payments"),
                rank: 1,
                amount: 5_000,
            },
            PrizeTier {
                track: symbol_short!("payments"),
                rank: 1,
                amount: 3_000,
            },
        ];

        assert_eq!(validate_prize_tiers(&tiers), Err(Error::PrizeTiersInvalid));
    }

    #[test]
    fn the_same_rank_in_two_tracks_is_fine() {
        let env = Env::default();
        let tiers = vec![
            &env,
            PrizeTier {
                track: symbol_short!("payments"),
                rank: 1,
                amount: 5_000,
            },
            PrizeTier {
                track: symbol_short!("defi"),
                rank: 1,
                amount: 5_000,
            },
        ];

        assert_eq!(validate_prize_tiers(&tiers), Ok(()));
    }

    #[test]
    fn a_position_worth_nothing_is_rejected() {
        let env = Env::default();
        let tiers = vec![
            &env,
            PrizeTier {
                track: symbol_short!("payments"),
                rank: 1,
                amount: 0,
            },
        ];

        assert_eq!(validate_prize_tiers(&tiers), Err(Error::PrizeTiersInvalid));
    }

    #[test]
    fn a_rank_of_zero_is_rejected() {
        let env = Env::default();
        let tiers = vec![
            &env,
            PrizeTier {
                track: symbol_short!("payments"),
                rank: 0,
                amount: 1_000,
            },
        ];

        assert_eq!(validate_prize_tiers(&tiers), Err(Error::PrizeTiersInvalid));
    }

    #[test]
    fn an_empty_prize_table_is_rejected() {
        let env = Env::default();
        let tiers: Vec<PrizeTier> = vec![&env];

        assert_eq!(validate_prize_tiers(&tiers), Err(Error::PrizeTiersInvalid));
    }
}
