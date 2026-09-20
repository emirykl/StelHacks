use soroban_sdk::{contracttype, Vec};

use crate::constitution::VotePolicy;
use crate::errors::Error;

/// One project a voter backed, and how much of their ballot went to it.
//
// A wallet used to have a vote and now has an amount to place, which is the
// difference between asking somebody which project is best and asking them
// what they thought of the field. Both are defensible; the second is the one
// the rules can express, and a hackathon that wants the first locks a power of
// one and a single choice.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct VoteChoice {
    pub team: u32,
    /// Whole points, never zero: a choice worth nothing is not a choice, and
    /// allowing it would let a ballot name a project without backing it.
    pub weight: u32,
}

/// Checks a ballot against the rules that were frozen before anybody voted.
//
// Every condition here is one the voter's own wallet could have checked before
// sealing, and the page does check them. It is repeated because the page is
// not what decides: a ballot arrives at this contract as a digest under a root
// published by the collection service, and neither of those two can tell a
// well formed ballot from a malformed one. The only place that can is here,
// after the proof has shown what the voter actually sealed.
pub fn validate_ballot(choices: &Vec<VoteChoice>, policy: &VotePolicy) -> Result<(), Error> {
    if choices.is_empty() || choices.len() > policy.max_choices {
        return Err(Error::BallotMalformed);
    }

    let mut spent = 0u32;
    let mut highest = 0u32;

    for choice in choices.iter() {
        /* Ascending, which also settles repeats. The order is not a
        presentation detail: the leaf is hashed over this sequence, so a ballot
        spelled two ways would be two different digests, and a voter could seal
        one spelling and reveal the other. Teams are numbered from one, so a
        first entry of zero is refused by the same comparison. */
        if choice.team <= highest {
            return Err(Error::BallotMalformed);
        }

        if choice.weight == 0 {
            return Err(Error::BallotMalformed);
        }

        highest = choice.team;
        spent = spent
            .checked_add(choice.weight)
            .ok_or(Error::BallotMalformed)?;
    }

    /* Spent to the last point rather than up to the limit. Two ballots that
    place different totals are two different amounts of influence, and nothing
    in the rules says what a half used ballot is worth against a full one, so
    the contract refuses to be the place that decides it. */
    if spent != policy.power {
        return Err(Error::BallotMalformed);
    }

    Ok(())
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{vec, Env};

    /// Ten points across at most three projects, the shape the product ships.
    fn policy() -> VotePolicy {
        VotePolicy {
            judge_bps: 7_000,
            community_bps: 3_000,
            power: 10,
            max_choices: 3,
        }
    }

    fn choice(team: u32, weight: u32) -> VoteChoice {
        VoteChoice { team, weight }
    }

    #[test]
    fn a_ballot_spending_every_point_across_three_projects_is_accepted() {
        let env = Env::default();
        let spread = vec![&env, choice(1, 5), choice(2, 3), choice(4, 2)];

        assert_eq!(validate_ballot(&spread, &policy()), Ok(()));
    }

    #[test]
    fn everything_on_one_project_is_a_ballot_too() {
        let env = Env::default();
        let all_in = vec![&env, choice(2, 10)];

        assert_eq!(validate_ballot(&all_in, &policy()), Ok(()));
    }

    #[test]
    fn a_ballot_naming_nobody_is_refused() {
        let env = Env::default();
        let empty: Vec<VoteChoice> = vec![&env];

        assert_eq!(
            validate_ballot(&empty, &policy()),
            Err(Error::BallotMalformed)
        );
    }

    #[test]
    fn a_ballot_spread_wider_than_the_rules_allow_is_refused() {
        let env = Env::default();
        let four = vec![&env, choice(1, 3), choice(2, 3), choice(3, 2), choice(4, 2)];

        assert_eq!(
            validate_ballot(&four, &policy()),
            Err(Error::BallotMalformed)
        );
    }

    /// Both directions of the same mistake: a ballot is worth what the rules
    /// say it is worth, no more and no less.
    #[test]
    fn a_ballot_that_does_not_spend_exactly_its_power_is_refused() {
        let env = Env::default();
        let short = vec![&env, choice(1, 4), choice(2, 2)];
        let over = vec![&env, choice(1, 8), choice(2, 8)];

        assert_eq!(
            validate_ballot(&short, &policy()),
            Err(Error::BallotMalformed)
        );
        assert_eq!(
            validate_ballot(&over, &policy()),
            Err(Error::BallotMalformed)
        );
    }

    /// Without this a voter could name one project twice and have their ballot
    /// read as two backers rather than one.
    #[test]
    fn the_same_project_cannot_be_named_twice() {
        let env = Env::default();
        let doubled = vec![&env, choice(2, 5), choice(2, 5)];

        assert_eq!(
            validate_ballot(&doubled, &policy()),
            Err(Error::BallotMalformed)
        );
    }

    /// The order is part of what was hashed, so the contract has to insist on
    /// the one spelling rather than sort what it is given.
    #[test]
    fn choices_out_of_order_are_refused_rather_than_sorted() {
        let env = Env::default();
        let backwards = vec![&env, choice(3, 5), choice(1, 5)];

        assert_eq!(
            validate_ballot(&backwards, &policy()),
            Err(Error::BallotMalformed)
        );
    }

    #[test]
    fn a_choice_worth_nothing_is_refused() {
        let env = Env::default();
        let hollow = vec![&env, choice(1, 10), choice(2, 0)];

        assert_eq!(
            validate_ballot(&hollow, &policy()),
            Err(Error::BallotMalformed)
        );
    }

    /// A team numbered zero does not exist, and the ascending check is what
    /// catches it, so this pins the behaviour to the rule rather than to luck.
    #[test]
    fn a_ballot_naming_team_zero_is_refused() {
        let env = Env::default();
        let nonexistent = vec![&env, choice(0, 10)];

        assert_eq!(
            validate_ballot(&nonexistent, &policy()),
            Err(Error::BallotMalformed)
        );
    }

    #[test]
    fn weights_that_would_overflow_the_total_are_refused() {
        let env = Env::default();
        let absurd = vec![&env, choice(1, u32::MAX), choice(2, u32::MAX)];

        assert_eq!(
            validate_ballot(&absurd, &policy()),
            Err(Error::BallotMalformed)
        );
    }
}
