//! The community vote: ten points a wallet, spread across at most three
//! projects, sealed alongside the scorecards and opened with them.

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{symbol_short, vec, Address, BytesN, Env, String, Vec};

use crate::ballot::VoteChoice;
use crate::constitution::JudgingMode;
use crate::errors::Error;
use crate::hashing::ballot_leaf;
use crate::merkle;
use crate::test::Fixture;

/// Three teams entered, a handful of approved voters, sitting in the judging
/// window with the community vote open. The third project was ruled out during
/// screening, so a ballot can be pointed at something that is no longer in the
/// running.
struct Voting {
    fixture: Fixture,
    first: u32,
    second: u32,
    ruled_out: u32,
    voters: Vec<Address>,
    /// Applied in time, but left in the queue until after the deadline.
    late: Address,
}

impl Voting {
    fn new() -> Voting {
        let fixture = Fixture::funded_and_open();
        let schedule = fixture.client.state().schedule;
        fixture
            .env
            .ledger()
            .set_timestamp(schedule.registration_opens_at + 3_600);

        let first = Self::enter(&fixture, 1);
        let second = Self::enter(&fixture, 2);
        let ruled_out = Self::enter(&fixture, 3);

        let mut voters = Vec::new(&fixture.env);
        for _ in 0..3 {
            voters.push_back(Self::approve(&fixture));
        }

        // Applies while registration is open; nobody gets round to them until
        // the deadline has gone by.
        let late = Address::generate(&fixture.env);
        fixture.client.apply(&late);

        fixture
            .env
            .ledger()
            .set_timestamp(schedule.submission_closes_at + 1);
        fixture.client.advance_phase();

        let reason = BytesN::from_array(&fixture.env, &[9u8; 32]);
        fixture.client.invalidate_submission(&ruled_out, &reason);

        fixture
            .env
            .ledger()
            .set_timestamp(schedule.screening_closes_at + 1);
        fixture.client.advance_phase();

        Voting {
            fixture,
            first,
            second,
            ruled_out,
            voters,
            late,
        }
    }

    /// An approved participant with a team and an entry.
    fn enter(fixture: &Fixture, digest: u8) -> u32 {
        let captain = Self::approve(fixture);
        let team = fixture.client.create_team(&captain);

        fixture.client.submit_project(
            &captain,
            &team,
            &symbol_short!("payments"),
            &BytesN::from_array(&fixture.env, &[digest; 32]),
            &String::from_str(&fixture.env, "ipfs://cid"),
        );

        team
    }

    fn approve(fixture: &Fixture) -> Address {
        let who = Address::generate(&fixture.env);
        fixture.client.apply(&who);
        let organizer = fixture.organizer.clone();
        fixture.client.approve_application(&organizer, &who);

        who
    }

    fn sealer(&self) -> Address {
        match self.fixture.client.constitution().judging_mode {
            JudgingMode::Easy(sealer) => sealer,
            JudgingMode::Strict => panic!("the sample hackathon runs the easy mode"),
        }
    }

    /// Seals two ballots and moves into the reveal, returning their proofs.
    fn seal(&self, ballots: &[(Address, Vec<VoteChoice>); 2]) -> Vec<Vec<BytesN<32>>> {
        let env = &self.fixture.env;

        let left = ballot_leaf(env, &ballots[0].0, &ballots[0].1);
        let right = ballot_leaf(env, &ballots[1].0, &ballots[1].1);
        let root = merkle::node(env, &left, &right);

        let schedule = self.fixture.client.state().schedule;
        env.ledger()
            .set_timestamp(schedule.community_vote_closes_at);

        let _ = self.sealer();
        self.fixture.client.publish_ballot_root(&root);

        env.ledger().set_timestamp(schedule.judging_closes_at + 1);
        self.fixture.client.advance_phase();

        vec![env, vec![env, right], vec![env, left]]
    }

    fn voter(&self, index: u32) -> Address {
        self.voters.get(index).unwrap()
    }
}

/// A ballot, written the way the rules require it: ascending by team, every
/// point spent.
fn ballot(env: &Env, picks: &[(u32, u32)]) -> Vec<VoteChoice> {
    let mut choices = Vec::new(env);

    for (team, weight) in picks {
        choices.push_back(VoteChoice {
            team: *team,
            weight: *weight,
        });
    }

    choices
}

#[test]
fn a_ballot_spread_across_two_projects_gives_each_what_it_was_given() {
    let voting = Voting::new();
    let spread = ballot(
        &voting.fixture.env,
        &[(voting.first, 7), (voting.second, 3)],
    );
    let ballots = [
        (voting.voter(0), spread.clone()),
        (
            voting.voter(1),
            ballot(&voting.fixture.env, &[(voting.second, 10)]),
        ),
    ];
    let proofs = voting.seal(&ballots);

    voting.fixture.env.set_auths(&[]);
    voting
        .fixture
        .client
        .reveal_ballot(&ballots[0].0, &ballots[0].1, &proofs.get(0).unwrap());

    assert_eq!(voting.fixture.client.vote_weight(&voting.first), 7);
    assert_eq!(voting.fixture.client.vote_weight(&voting.second), 3);
    assert!(voting.fixture.client.has_voted(&ballots[0].0));
}

#[test]
fn the_top_total_follows_whichever_project_is_ahead() {
    let voting = Voting::new();
    let ballots = [
        (
            voting.voter(0),
            ballot(
                &voting.fixture.env,
                &[(voting.first, 6), (voting.second, 4)],
            ),
        ),
        (
            voting.voter(1),
            ballot(&voting.fixture.env, &[(voting.second, 10)]),
        ),
    ];
    let proofs = voting.seal(&ballots);

    voting
        .fixture
        .client
        .reveal_ballot(&ballots[0].0, &ballots[0].1, &proofs.get(0).unwrap());
    assert_eq!(voting.fixture.client.top_vote_weight(), 6);

    voting
        .fixture
        .client
        .reveal_ballot(&ballots[1].0, &ballots[1].1, &proofs.get(1).unwrap());

    assert_eq!(voting.fixture.client.vote_weight(&voting.second), 14);
    assert_eq!(voting.fixture.client.top_vote_weight(), 14);
}

/// One wallet, one ballot, however it was spread.
#[test]
fn the_same_wallet_cannot_be_counted_twice() {
    let voting = Voting::new();
    let ballots = [
        (
            voting.voter(0),
            ballot(&voting.fixture.env, &[(voting.first, 10)]),
        ),
        (
            voting.voter(0),
            ballot(&voting.fixture.env, &[(voting.second, 10)]),
        ),
    ];
    let proofs = voting.seal(&ballots);

    voting
        .fixture
        .client
        .reveal_ballot(&ballots[0].0, &ballots[0].1, &proofs.get(0).unwrap());

    assert_eq!(
        voting
            .fixture
            .client
            .try_reveal_ballot(&ballots[1].0, &ballots[1].1, &proofs.get(1).unwrap())
            .err(),
        Some(Ok(Error::BallotAlreadyCounted))
    );
}

/// Backing your own project is allowed, and deliberately so. What the contract
/// will not do is hide it: the ballot is in the event stream whole, so a team
/// voting for itself is something a reader can see and weigh.
#[test]
fn a_voter_may_back_their_own_project() {
    let voting = Voting::new();
    let captain = voting.fixture.client.team_by_id(&voting.first).captain;

    let ballots = [
        (
            captain.clone(),
            ballot(&voting.fixture.env, &[(voting.first, 10)]),
        ),
        (
            voting.voter(0),
            ballot(&voting.fixture.env, &[(voting.second, 10)]),
        ),
    ];
    let proofs = voting.seal(&ballots);

    voting
        .fixture
        .client
        .reveal_ballot(&captain, &ballots[0].1, &proofs.get(0).unwrap());

    assert_eq!(voting.fixture.client.vote_weight(&voting.first), 10);
}

/// A ballot has to spend what the rules hand out. Anything else would be two
/// voters holding different amounts of influence over the same result.
#[test]
fn a_ballot_that_does_not_spend_its_whole_power_is_refused() {
    let voting = Voting::new();
    let ballots = [
        (
            voting.voter(0),
            ballot(&voting.fixture.env, &[(voting.first, 4)]),
        ),
        (
            voting.voter(1),
            ballot(&voting.fixture.env, &[(voting.second, 10)]),
        ),
    ];
    let proofs = voting.seal(&ballots);

    assert_eq!(
        voting
            .fixture
            .client
            .try_reveal_ballot(&ballots[0].0, &ballots[0].1, &proofs.get(0).unwrap())
            .err(),
        Some(Ok(Error::BallotMalformed))
    );
}

/// The rules cap the spread at three, and the cap is enforced where it counts
/// rather than only on the page that collected the ballot.
#[test]
fn a_ballot_spread_wider_than_the_rules_allow_is_refused() {
    let voting = Voting::new();
    let wide = ballot(
        &voting.fixture.env,
        &[
            (voting.first, 3),
            (voting.second, 3),
            (voting.ruled_out, 2),
            (voting.ruled_out + 1, 2),
        ],
    );
    let ballots = [
        (voting.voter(0), wide),
        (
            voting.voter(1),
            ballot(&voting.fixture.env, &[(voting.second, 10)]),
        ),
    ];
    let proofs = voting.seal(&ballots);

    assert_eq!(
        voting
            .fixture
            .client
            .try_reveal_ballot(&ballots[0].0, &ballots[0].1, &proofs.get(0).unwrap())
            .err(),
        Some(Ok(Error::BallotMalformed))
    );
}

/// The voter chose while that project was still standing. Dropping the points
/// that went to it is the narrowest thing the contract can do; voiding the
/// whole ballot would let one disqualification delete the rest of somebody's
/// vote.
#[test]
fn points_placed_on_a_project_that_was_ruled_out_fall_away_and_the_rest_stand() {
    let voting = Voting::new();
    let mixed = ballot(
        &voting.fixture.env,
        &[(voting.first, 4), (voting.ruled_out, 6)],
    );
    let ballots = [
        (voting.voter(0), mixed),
        (
            voting.voter(1),
            ballot(&voting.fixture.env, &[(voting.second, 10)]),
        ),
    ];
    let proofs = voting.seal(&ballots);

    voting
        .fixture
        .client
        .reveal_ballot(&ballots[0].0, &ballots[0].1, &proofs.get(0).unwrap());

    assert_eq!(voting.fixture.client.vote_weight(&voting.first), 4);
    assert_eq!(voting.fixture.client.vote_weight(&voting.ruled_out), 0);
    assert!(
        voting.fixture.client.has_voted(&ballots[0].0),
        "the wallet has spent its ballot either way"
    );
}

/// The electorate is fixed at the registration deadline. Clearing a backlog
/// afterwards is legitimate and lets the person take part; what it must not do
/// is hand them a vote, or an organizer could admit an electorate once they
/// already knew what it would decide.
#[test]
fn a_ballot_from_somebody_approved_too_late_is_refused() {
    let voting = Voting::new();
    let organizer = voting.fixture.organizer.clone();
    let late = voting.late.clone();

    // The clock is already past the registration deadline by now.
    voting.fixture.client.approve_application(&organizer, &late);
    assert!(
        voting.fixture.client.registration(&late).is_approved(),
        "they do take part"
    );

    let ballots = [
        (
            late.clone(),
            ballot(&voting.fixture.env, &[(voting.first, 10)]),
        ),
        (
            voting.voter(0),
            ballot(&voting.fixture.env, &[(voting.second, 10)]),
        ),
    ];
    let proofs = voting.seal(&ballots);

    assert_eq!(
        voting
            .fixture
            .client
            .try_reveal_ballot(&late, &ballots[0].1, &proofs.get(0).unwrap())
            .err(),
        Some(Ok(Error::VoterNotEligible)),
        "but they do not vote"
    );
}

#[test]
fn a_ballot_that_was_never_sealed_is_refused() {
    let voting = Voting::new();
    let ballots = [
        (
            voting.voter(0),
            ballot(&voting.fixture.env, &[(voting.first, 10)]),
        ),
        (
            voting.voter(1),
            ballot(&voting.fixture.env, &[(voting.second, 10)]),
        ),
    ];
    let proofs = voting.seal(&ballots);

    assert_eq!(
        voting
            .fixture
            .client
            .try_reveal_ballot(&voting.voter(2), &ballots[0].1, &proofs.get(0).unwrap())
            .err(),
        Some(Ok(Error::ProofDoesNotMatchRoot))
    );
}

/// Moving a point from one project to another changes the whole leaf, which is
/// the property that makes sealing the ballot rather than each choice worth
/// the extra bytes.
#[test]
fn a_ballot_reweighted_after_sealing_is_refused() {
    let voting = Voting::new();
    let ballots = [
        (
            voting.voter(0),
            ballot(
                &voting.fixture.env,
                &[(voting.first, 7), (voting.second, 3)],
            ),
        ),
        (
            voting.voter(1),
            ballot(&voting.fixture.env, &[(voting.second, 10)]),
        ),
    ];
    let proofs = voting.seal(&ballots);

    let moved = ballot(
        &voting.fixture.env,
        &[(voting.first, 3), (voting.second, 7)],
    );

    assert_eq!(
        voting
            .fixture
            .client
            .try_reveal_ballot(&ballots[0].0, &moved, &proofs.get(0).unwrap())
            .err(),
        Some(Ok(Error::ProofDoesNotMatchRoot))
    );
}

#[test]
fn the_ballots_can_only_be_sealed_once() {
    let voting = Voting::new();
    let root = BytesN::from_array(&voting.fixture.env, &[5u8; 32]);

    let schedule = voting.fixture.client.state().schedule;
    voting
        .fixture
        .env
        .ledger()
        .set_timestamp(schedule.community_vote_closes_at);

    voting.fixture.client.publish_ballot_root(&root);

    assert_eq!(
        voting.fixture.client.try_publish_ballot_root(&root).err(),
        Some(Ok(Error::RootAlreadyPublished))
    );
}

/// Sealing early would cut the vote short while people are still casting.
#[test]
fn the_ballots_cannot_be_sealed_before_the_vote_closes() {
    let voting = Voting::new();
    let root = BytesN::from_array(&voting.fixture.env, &[5u8; 32]);

    assert_eq!(
        voting.fixture.client.try_publish_ballot_root(&root).err(),
        Some(Ok(Error::DeadlineNotReached))
    );
}
