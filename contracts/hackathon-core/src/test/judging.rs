//! Judging, starting with the one honest way out of scoring a project.

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{symbol_short, Address, BytesN, String};

use crate::errors::Error;
use crate::phase::Phase;
use crate::test::Fixture;

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
        Some(Ok(Error::AlreadyRecused))
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
