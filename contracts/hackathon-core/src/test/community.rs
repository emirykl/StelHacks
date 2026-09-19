//! The community vote: sealed alongside the scorecards, opened with them, and
//! guarded by the three gates that stop a vote being bought.

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{symbol_short, vec, Address, BytesN, String, Vec};

use crate::constitution::JudgingMode;
use crate::errors::Error;
use crate::hashing::ballot_leaf;
use crate::merkle;
use crate::test::Fixture;

/// Two teams entered, a handful of approved voters, sitting in the judging
/// window with the community vote open.
struct Voting {
    fixture: Fixture,
    first: u32,
    second: u32,
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
        fixture
            .env
            .ledger()
            .set_timestamp(schedule.screening_closes_at + 1);
        fixture.client.advance_phase();

        Voting {
            fixture,
            first,
            second,
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
    fn seal(&self, ballots: &[(Address, u32); 2]) -> Vec<Vec<BytesN<32>>> {
        let env = &self.fixture.env;

        let left = ballot_leaf(env, &ballots[0].0, ballots[0].1);
        let right = ballot_leaf(env, &ballots[1].0, ballots[1].1);
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

#[test]
fn a_sealed_ballot_is_counted_when_it_is_opened() {
    let voting = Voting::new();
    let ballots = [
        (voting.voter(0), voting.first),
        (voting.voter(1), voting.second),
    ];
    let proofs = voting.seal(&ballots);

    voting.fixture.env.set_auths(&[]);
    let votes =
        voting
            .fixture
            .client
            .reveal_ballot(&ballots[0].0, &ballots[0].1, &proofs.get(0).unwrap());

    assert_eq!(votes, 1);
    assert_eq!(voting.fixture.client.vote_count(&voting.first), 1);
    assert!(voting.fixture.client.has_voted(&ballots[0].0));
}

#[test]
fn the_top_count_follows_whichever_project_is_ahead() {
    let voting = Voting::new();
    let ballots = [
        (voting.voter(0), voting.first),
        (voting.voter(1), voting.first),
    ];
    let proofs = voting.seal(&ballots);

    for index in 0..2u32 {
        voting.fixture.client.reveal_ballot(
            &ballots[index as usize].0,
            &ballots[index as usize].1,
            &proofs.get(index).unwrap(),
        );
    }

    assert_eq!(voting.fixture.client.vote_count(&voting.first), 2);
    assert_eq!(voting.fixture.client.vote_count(&voting.second), 0);
    assert_eq!(voting.fixture.client.top_vote_count(), 2);
}

/// One wallet, one vote.
#[test]
fn the_same_wallet_cannot_be_counted_twice() {
    let voting = Voting::new();
    let ballots = [
        (voting.voter(0), voting.first),
        (voting.voter(0), voting.second),
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

/// Nobody votes for themselves, and a captain is on their own team.
#[test]
fn a_ballot_for_your_own_project_is_refused() {
    let voting = Voting::new();
    let captain = voting.fixture.client.team_by_id(&voting.first).captain;

    let ballots = [
        (captain.clone(), voting.first),
        (voting.voter(0), voting.second),
    ];
    let proofs = voting.seal(&ballots);

    assert_eq!(
        voting
            .fixture
            .client
            .try_reveal_ballot(&captain, &voting.first, &proofs.get(0).unwrap())
            .err(),
        Some(Ok(Error::SelfVoteRejected))
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
        (late.clone(), voting.first),
        (voting.voter(0), voting.second),
    ];
    let proofs = voting.seal(&ballots);

    assert_eq!(
        voting
            .fixture
            .client
            .try_reveal_ballot(&late, &voting.first, &proofs.get(0).unwrap())
            .err(),
        Some(Ok(Error::VoterNotEligible)),
        "but they do not vote"
    );
}

#[test]
fn a_ballot_that_was_never_sealed_is_refused() {
    let voting = Voting::new();
    let ballots = [
        (voting.voter(0), voting.first),
        (voting.voter(1), voting.second),
    ];
    let proofs = voting.seal(&ballots);

    assert_eq!(
        voting
            .fixture
            .client
            .try_reveal_ballot(&voting.voter(2), &voting.first, &proofs.get(0).unwrap())
            .err(),
        Some(Ok(Error::ProofDoesNotMatchRoot))
    );
}

/// Moving a sealed ballot to a different project changes its leaf.
#[test]
fn a_ballot_redirected_after_sealing_is_refused() {
    let voting = Voting::new();
    let ballots = [
        (voting.voter(0), voting.first),
        (voting.voter(1), voting.second),
    ];
    let proofs = voting.seal(&ballots);

    assert_eq!(
        voting
            .fixture
            .client
            .try_reveal_ballot(&ballots[0].0, &voting.second, &proofs.get(0).unwrap())
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
        Some(Ok(Error::BallotRootAlreadyPublished))
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
