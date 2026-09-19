//! Entering a project, freezing it at the deadline, and the screening round.

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{symbol_short, Address, BytesN, String, Symbol};

use crate::errors::Error;
use crate::phase::Phase;
use crate::submission::SubmissionStatus;
use crate::test::Fixture;

/// An open hackathon with one approved captain holding a team.
struct Entered {
    fixture: Fixture,
    captain: Address,
    team: u32,
}

impl Entered {
    fn new() -> Entered {
        let fixture = Fixture::funded_and_open();
        let opens_at = fixture.client.state().schedule.registration_opens_at;
        fixture.env.ledger().set_timestamp(opens_at + 3_600);

        let captain = Address::generate(&fixture.env);
        fixture.client.apply(&captain);
        let organizer = fixture.organizer.clone();
        fixture.client.approve_application(&organizer, &captain);

        let team = fixture.client.create_team(&captain);

        Entered {
            fixture,
            captain,
            team,
        }
    }

    fn submit(&self, digest: u8) {
        self.fixture.client.submit_project(
            &self.captain,
            &self.team,
            &symbol_short!("payments"),
            &self.hash(digest),
            &String::from_str(&self.fixture.env, "ipfs://cid"),
        );
    }

    fn hash(&self, digest: u8) -> BytesN<32> {
        BytesN::from_array(&self.fixture.env, &[digest; 32])
    }

    /// Moves the clock past the submission deadline and closes the phase.
    fn close_submissions(&self) {
        let closes_at = self.fixture.client.state().schedule.submission_closes_at;
        self.fixture.env.ledger().set_timestamp(closes_at + 1);
        self.fixture.client.advance_phase();
    }
}

#[test]
fn a_team_can_enter_a_project() {
    let entered = Entered::new();
    entered.submit(1);

    let submission = entered.fixture.client.submission(&entered.team);

    assert_eq!(submission.team, entered.team);
    assert_eq!(submission.track, symbol_short!("payments"));
    assert_eq!(submission.metadata_hash, entered.hash(1));
    assert!(submission.is_valid());
}

#[test]
fn an_entry_can_be_revised_while_the_window_is_open() {
    let entered = Entered::new();
    entered.submit(1);

    let first = entered.fixture.client.submission(&entered.team);

    entered
        .fixture
        .env
        .ledger()
        .set_timestamp(first.submitted_at + 3_600);
    entered.submit(2);

    let revised = entered.fixture.client.submission(&entered.team);

    assert_eq!(revised.metadata_hash, entered.hash(2));
    assert_eq!(
        revised.submitted_at, first.submitted_at,
        "editing must not buy a better place in the tie break"
    );
    assert!(revised.updated_at > revised.submitted_at);
}

/// The lock the whole judging phase depends on. After the deadline the digest
/// cannot move, so the project a judge scores is the project that was entered.
#[test]
fn nothing_can_be_entered_or_changed_after_the_deadline() {
    let entered = Entered::new();
    entered.submit(1);

    let closes_at = entered.fixture.client.state().schedule.submission_closes_at;
    entered.fixture.env.ledger().set_timestamp(closes_at + 1);

    assert_eq!(
        entered
            .fixture
            .client
            .try_submit_project(
                &entered.captain,
                &entered.team,
                &symbol_short!("payments"),
                &entered.hash(9),
                &String::from_str(&entered.fixture.env, "ipfs://late"),
            )
            .err(),
        Some(Ok(Error::DeadlinePassed))
    );

    assert_eq!(
        entered
            .fixture
            .client
            .submission(&entered.team)
            .metadata_hash,
        entered.hash(1)
    );
}

#[test]
fn somebody_outside_the_team_cannot_enter_on_its_behalf() {
    let entered = Entered::new();
    let stranger = Address::generate(&entered.fixture.env);

    assert_eq!(
        entered
            .fixture
            .client
            .try_submit_project(
                &stranger,
                &entered.team,
                &symbol_short!("payments"),
                &entered.hash(1),
                &String::from_str(&entered.fixture.env, "ipfs://cid"),
            )
            .err(),
        Some(Ok(Error::NotTeamMember))
    );
}

#[test]
fn an_entry_has_to_name_a_track_that_exists() {
    let entered = Entered::new();

    assert_eq!(
        entered
            .fixture
            .client
            .try_submit_project(
                &entered.captain,
                &entered.team,
                &Symbol::new(&entered.fixture.env, "ghost"),
                &entered.hash(1),
                &String::from_str(&entered.fixture.env, "ipfs://cid"),
            )
            .err(),
        Some(Ok(Error::TrackNotFound))
    );
}

#[test]
fn screening_rules_an_entry_out_without_removing_it() {
    let entered = Entered::new();
    entered.submit(1);
    entered.close_submissions();

    assert_eq!(entered.fixture.client.phase(), Phase::Screening);

    let reason = entered.hash(7);
    entered
        .fixture
        .client
        .invalidate_submission(&entered.team, &reason);

    let submission = entered.fixture.client.submission(&entered.team);

    assert_eq!(submission.status, SubmissionStatus::Invalidated);
    assert_eq!(submission.reason, reason);
    assert_eq!(
        submission.metadata_hash,
        entered.hash(1),
        "the project keeps its page rather than disappearing"
    );
}

#[test]
fn an_entry_cannot_be_ruled_out_twice() {
    let entered = Entered::new();
    entered.submit(1);
    entered.close_submissions();

    let reason = entered.hash(7);
    entered
        .fixture
        .client
        .invalidate_submission(&entered.team, &reason);

    assert_eq!(
        entered
            .fixture
            .client
            .try_invalidate_submission(&entered.team, &reason)
            .err(),
        Some(Ok(Error::AlreadyInvalidated))
    );
}

/// Screening happens before any scorecard exists, so a judge's opinion can
/// never be the thing that shapes it.
#[test]
fn screening_cannot_run_while_projects_are_still_arriving() {
    let entered = Entered::new();
    entered.submit(1);

    assert_eq!(
        entered
            .fixture
            .client
            .try_invalidate_submission(&entered.team, &entered.hash(7))
            .err(),
        Some(Ok(Error::WrongPhase))
    );
}

#[test]
fn a_team_that_entered_nothing_has_no_submission_to_read() {
    let entered = Entered::new();

    assert_eq!(
        entered.fixture.client.try_submission(&entered.team).err(),
        Some(Ok(Error::SubmissionNotFound))
    );
}
