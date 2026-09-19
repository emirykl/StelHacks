//! Judging, starting with the one honest way out of scoring a project.

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{symbol_short, Address, BytesN, String};

use crate::constitution::JudgingMode;
use crate::errors::Error;
use crate::hashing::scorecard_leaf;
use crate::merkle;
use crate::phase::Phase;
use crate::scorecard::{CriterionScore, Scorecard};
use crate::test::Fixture;
use soroban_sdk::{vec, Vec};

/// A hackathon in its judging window, with one project entered.
struct Judging {
    fixture: Fixture,
    team: u32,
}

impl Judging {
    fn new() -> Judging {
        let fixture = Fixture::funded_and_open();
        let schedule = fixture.client.state().schedule;
        fixture
            .env
            .ledger()
            .set_timestamp(schedule.registration_opens_at + 3_600);

        let captain = Address::generate(&fixture.env);
        fixture.client.apply(&captain);
        let organizer = fixture.organizer.clone();
        fixture.client.approve_application(&organizer, &captain);

        let team = fixture.client.create_team(&captain);
        fixture.client.submit_project(
            &captain,
            &team,
            &symbol_short!("payments"),
            &BytesN::from_array(&fixture.env, &[1u8; 32]),
            &String::from_str(&fixture.env, "ipfs://cid"),
        );

        // Close submissions, then screening, landing in the judging window.
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

        Judging { fixture, team }
    }

    /// The address the constitution named as the sealer.
    fn sealer(&self) -> Address {
        match self.fixture.client.constitution().judging_mode {
            JudgingMode::Easy(sealer) => sealer,
            JudgingMode::Strict => panic!("the sample hackathon runs the easy mode"),
        }
    }

    /// A full scorecard from one judge.
    fn scorecard(&self, judge: &Address, technical: u32, novelty: u32) -> Scorecard {
        Scorecard {
            judge: judge.clone(),
            team: self.team,
            scores: vec![
                &self.fixture.env,
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

    /// Seals two scorecards and moves the hackathon into the reveal, returning
    /// the cards alongside their proofs.
    fn seal(&self, cards: &[Scorecard]) -> Vec<Vec<BytesN<32>>> {
        let env = &self.fixture.env;

        let mut leaves = Vec::new(env);
        for card in cards {
            leaves.push_back(scorecard_leaf(env, card));
        }

        // Two leaves make a tree one level deep, so each proof is the other
        // leaf. Keeping the tree this small keeps the test about the contract
        // rather than about tree building.
        assert_eq!(leaves.len(), 2, "this helper builds a two leaf tree");
        let root = merkle::node(env, &leaves.get(0).unwrap(), &leaves.get(1).unwrap());

        let closes_at = self.fixture.client.state().schedule.judging_closes_at;
        env.ledger().set_timestamp(closes_at);

        let sealer = self.sealer();
        self.fixture.client.publish_score_root(&root);
        let _ = sealer;

        env.ledger().set_timestamp(closes_at + 1);
        self.fixture.client.advance_phase();

        vec![
            env,
            vec![env, leaves.get(1).unwrap()],
            vec![env, leaves.get(0).unwrap()],
        ]
    }

    fn judge(&self, index: u32) -> Address {
        self.fixture
            .client
            .constitution()
            .judges
            .get(index)
            .unwrap()
            .judge
    }
}

#[test]
fn a_hackathon_reaches_judging_with_every_judge_available() {
    let judging = Judging::new();

    assert_eq!(judging.fixture.client.phase(), Phase::Judging);
    assert_eq!(judging.fixture.client.available_judges(&judging.team), 3);
}

#[test]
fn a_judge_can_step_away_from_a_project() {
    let judging = Judging::new();
    let judge = judging.judge(0);

    judging.fixture.client.recuse(&judge, &judging.team);

    assert!(judging.fixture.client.is_recused(&judge, &judging.team));
    assert_eq!(judging.fixture.client.available_judges(&judging.team), 2);
}

#[test]
fn stepping_away_twice_is_refused() {
    let judging = Judging::new();
    let judge = judging.judge(0);
    judging.fixture.client.recuse(&judge, &judging.team);

    assert_eq!(
        judging
            .fixture
            .client
            .try_recuse(&judge, &judging.team)
            .err(),
        Some(Ok(Error::JudgeRecused))
    );
    assert_eq!(judging.fixture.client.available_judges(&judging.team), 2);
}

#[test]
fn somebody_who_is_not_a_judge_here_cannot_step_away() {
    let judging = Judging::new();
    let stranger = Address::generate(&judging.fixture.env);

    assert_eq!(
        judging
            .fixture
            .client
            .try_recuse(&stranger, &judging.team)
            .err(),
        Some(Ok(Error::NotJudge))
    );
}

/// A judge who could step away after seeing where a project stood would be
/// choosing which results to touch, so the door closes with the window.
#[test]
fn nobody_can_step_away_once_the_judging_window_has_closed() {
    let judging = Judging::new();
    let judge = judging.judge(0);

    let closes_at = judging.fixture.client.state().schedule.judging_closes_at;
    judging.fixture.env.ledger().set_timestamp(closes_at + 1);

    assert_eq!(
        judging
            .fixture
            .client
            .try_recuse(&judge, &judging.team)
            .err(),
        Some(Ok(Error::DeadlinePassed))
    );
}

#[test]
fn stepping_away_from_one_project_leaves_the_others_alone() {
    let judging = Judging::new();
    let judge = judging.judge(0);

    judging.fixture.client.recuse(&judge, &judging.team);

    assert!(!judging.fixture.client.is_recused(&judge, &99));
}

#[test]
fn each_judge_is_counted_once_as_they_step_away() {
    let judging = Judging::new();

    judging
        .fixture
        .client
        .recuse(&judging.judge(0), &judging.team);
    assert_eq!(judging.fixture.client.available_judges(&judging.team), 2);

    judging
        .fixture
        .client
        .recuse(&judging.judge(1), &judging.team);
    assert_eq!(judging.fixture.client.available_judges(&judging.team), 1);

    judging
        .fixture
        .client
        .recuse(&judging.judge(2), &judging.team);
    assert_eq!(judging.fixture.client.available_judges(&judging.team), 0);
}

#[test]
fn the_sealer_closes_the_window_with_one_digest() {
    let judging = Judging::new();
    let cards = [
        judging.scorecard(&judging.judge(0), 80, 60),
        judging.scorecard(&judging.judge(1), 70, 90),
    ];

    judging.seal(&cards);

    assert_eq!(judging.fixture.client.phase(), Phase::Reveal);
    assert!(judging.fixture.client.try_score_root().is_ok());
}

/// The reveal needs no signature. The proof is the authorization, which is what
/// lets a participant open every scorecard themselves rather than waiting for
/// somebody to publish them.
#[test]
fn anyone_can_open_a_sealed_scorecard_with_its_proof() {
    let judging = Judging::new();
    let cards = [
        judging.scorecard(&judging.judge(0), 80, 60),
        judging.scorecard(&judging.judge(1), 70, 90),
    ];
    let proofs = judging.seal(&cards);

    judging.fixture.env.set_auths(&[]);
    let weighted = judging
        .fixture
        .client
        .reveal_score(&cards[0], &proofs.get(0).unwrap());

    assert_eq!(weighted, 80 * 6_000 + 60 * 4_000);
    assert_eq!(
        judging
            .fixture
            .client
            .score(&judging.team, &judging.judge(0)),
        weighted
    );
}

#[test]
fn the_tally_averages_every_scorecard_that_was_opened() {
    let judging = Judging::new();
    let cards = [
        judging.scorecard(&judging.judge(0), 80, 60),
        judging.scorecard(&judging.judge(1), 70, 90),
    ];
    let proofs = judging.seal(&cards);

    for index in 0..2u32 {
        judging
            .fixture
            .client
            .reveal_score(&cards[index as usize], &proofs.get(index).unwrap());
    }

    let tally = judging.fixture.client.score_tally(&judging.team);
    let first = 80 * 6_000 + 60 * 4_000;
    let second = 70 * 6_000 + 90 * 4_000;

    assert_eq!(tally.count, 2);
    assert_eq!(tally.total, (first + second) as u64);
}

/// The check the whole sealed design rests on: a scorecard the sealer did not
/// commit to cannot be smuggled in at the reveal.
#[test]
fn a_scorecard_that_was_never_sealed_is_refused() {
    let judging = Judging::new();
    let cards = [
        judging.scorecard(&judging.judge(0), 80, 60),
        judging.scorecard(&judging.judge(1), 70, 90),
    ];
    let proofs = judging.seal(&cards);

    let forged = judging.scorecard(&judging.judge(2), 100, 100);

    assert_eq!(
        judging
            .fixture
            .client
            .try_reveal_score(&forged, &proofs.get(0).unwrap())
            .err(),
        Some(Ok(Error::ProofDoesNotMatchRoot))
    );
}

/// Editing a sealed scorecard changes its leaf, so the proof stops matching.
#[test]
fn a_scorecard_altered_after_sealing_is_refused() {
    let judging = Judging::new();
    let cards = [
        judging.scorecard(&judging.judge(0), 80, 60),
        judging.scorecard(&judging.judge(1), 70, 90),
    ];
    let proofs = judging.seal(&cards);

    let improved = judging.scorecard(&judging.judge(0), 100, 100);

    assert_eq!(
        judging
            .fixture
            .client
            .try_reveal_score(&improved, &proofs.get(0).unwrap())
            .err(),
        Some(Ok(Error::ProofDoesNotMatchRoot))
    );
}

#[test]
fn the_same_scorecard_cannot_be_opened_twice() {
    let judging = Judging::new();
    let cards = [
        judging.scorecard(&judging.judge(0), 80, 60),
        judging.scorecard(&judging.judge(1), 70, 90),
    ];
    let proofs = judging.seal(&cards);

    judging
        .fixture
        .client
        .reveal_score(&cards[0], &proofs.get(0).unwrap());

    assert_eq!(
        judging
            .fixture
            .client
            .try_reveal_score(&cards[0], &proofs.get(0).unwrap())
            .err(),
        Some(Ok(Error::ScorecardAlreadyRecorded))
    );
}

/// Without this the recusal would be cosmetic: the sealer could include a card
/// from a judge who publicly stepped away and it would still count.
#[test]
fn a_scorecard_from_a_judge_who_stepped_away_is_refused() {
    let judging = Judging::new();
    let judge = judging.judge(0);
    judging.fixture.client.recuse(&judge, &judging.team);

    let cards = [
        judging.scorecard(&judge, 80, 60),
        judging.scorecard(&judging.judge(1), 70, 90),
    ];
    let proofs = judging.seal(&cards);

    assert_eq!(
        judging
            .fixture
            .client
            .try_reveal_score(&cards[0], &proofs.get(0).unwrap())
            .err(),
        Some(Ok(Error::JudgeRecused))
    );
}

/// A second root would let the sealer replace the whole set after seeing what
/// the first one produced.
#[test]
fn the_scorecards_can_only_be_sealed_once() {
    let judging = Judging::new();
    let cards = [
        judging.scorecard(&judging.judge(0), 80, 60),
        judging.scorecard(&judging.judge(1), 70, 90),
    ];
    judging.seal(&cards);

    let another = BytesN::from_array(&judging.fixture.env, &[9u8; 32]);

    assert_eq!(
        judging
            .fixture
            .client
            .try_publish_score_root(&another)
            .err(),
        Some(Ok(Error::WrongPhase))
    );
}

/// Sealing early would cut the judging window short.
#[test]
fn the_scorecards_cannot_be_sealed_before_the_window_closes() {
    let judging = Judging::new();
    let root = BytesN::from_array(&judging.fixture.env, &[1u8; 32]);

    assert_eq!(
        judging.fixture.client.try_publish_score_root(&root).err(),
        Some(Ok(Error::DeadlineNotReached))
    );
}

#[test]
fn a_project_nobody_scored_has_no_average_rather_than_a_zero() {
    let judging = Judging::new();

    assert_eq!(judging.fixture.client.score_tally(&judging.team).count, 0);
}
