//! Getting into a hackathon, and forming a team once you are in.

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{Address, BytesN};

use crate::errors::Error;
use crate::phase::Phase;
use crate::roster::ApplicationStatus;
use crate::test::Fixture;

/// An open hackathon with the clock sitting inside the registration window.
fn open() -> Fixture {
    let fixture = Fixture::funded_and_open();
    let opens_at = fixture.client.state().schedule.registration_opens_at;
    fixture.env.ledger().set_timestamp(opens_at + 3_600);

    fixture
}

fn applicant(fixture: &Fixture) -> Address {
    let who = Address::generate(&fixture.env);
    fixture.client.apply(&who);

    who
}

fn approved(fixture: &Fixture) -> Address {
    let who = applicant(fixture);
    let organizer = fixture.organizer.clone();
    fixture.client.approve_application(&organizer, &who);

    who
}

fn reason(fixture: &Fixture) -> BytesN<32> {
    BytesN::from_array(&fixture.env, &[9u8; 32])
}

#[test]
fn a_published_hackathon_is_open_for_applications() {
    let fixture = open();
    let who = applicant(&fixture);

    assert_eq!(fixture.client.phase(), Phase::Open);
    assert_eq!(
        fixture.client.registration(&who).status,
        ApplicationStatus::Pending
    );
}

#[test]
fn nobody_can_apply_twice() {
    let fixture = open();
    let who = applicant(&fixture);

    assert_eq!(
        fixture.client.try_apply(&who).err(),
        Some(Ok(Error::ApplicationAlreadyExists))
    );
}

#[test]
fn applications_close_with_the_registration_deadline() {
    let fixture = open();
    let closes_at = fixture.client.state().schedule.registration_closes_at;
    fixture.env.ledger().set_timestamp(closes_at + 1);

    let latecomer = Address::generate(&fixture.env);

    assert_eq!(
        fixture.client.try_apply(&latecomer).err(),
        Some(Ok(Error::DeadlinePassed))
    );
}

#[test]
fn an_approval_lets_someone_in() {
    let fixture = open();
    let who = approved(&fixture);

    assert_eq!(
        fixture.client.registration(&who).status,
        ApplicationStatus::Approved
    );
    assert!(fixture.client.may_vote(&who));
}

/// A refusal that leaves no trace would be the quiet back door beside the
/// disqualification process, so the reason is stored with the decision.
#[test]
fn a_refusal_is_recorded_with_the_reason_that_was_given() {
    let fixture = open();
    let who = applicant(&fixture);
    let organizer = fixture.organizer.clone();

    fixture
        .client
        .reject_application(&organizer, &who, &reason(&fixture));

    let registration = fixture.client.registration(&who);
    assert_eq!(registration.status, ApplicationStatus::Rejected);
    assert_eq!(registration.reason, reason(&fixture));
    assert!(!fixture.client.may_vote(&who));
}

#[test]
fn a_decision_cannot_be_revisited() {
    let fixture = open();
    let who = approved(&fixture);
    let organizer = fixture.organizer.clone();

    assert_eq!(
        fixture
            .client
            .try_reject_application(&organizer, &who, &reason(&fixture))
            .err(),
        Some(Ok(Error::ApplicationAlreadyDecided))
    );
}

/// The queue is exactly the work one person cannot clear alone, so a
/// collaborator can decide as well as the organizer.
#[test]
fn a_collaborator_can_work_through_the_queue() {
    let fixture = open();
    let helper = Address::generate(&fixture.env);
    fixture.client.add_collaborator(&helper);

    let who = applicant(&fixture);
    fixture.client.approve_application(&helper, &who);

    assert!(fixture.client.registration(&who).status == ApplicationStatus::Approved);
}

#[test]
fn a_stranger_cannot_decide_who_takes_part() {
    let fixture = open();
    let who = applicant(&fixture);
    let stranger = Address::generate(&fixture.env);

    assert_eq!(
        fixture
            .client
            .try_approve_application(&stranger, &who)
            .err(),
        Some(Ok(Error::NotOnOrganizingTeam))
    );
}

/// The registration deadline is the snapshot that fixes the electorate. An
/// organizer clearing a backlog afterwards is fine; waving through a hundred
/// friends on the morning of the vote is not.
#[test]
fn someone_approved_after_the_deadline_takes_part_but_does_not_vote() {
    let fixture = open();
    let who = applicant(&fixture);

    let closes_at = fixture.client.state().schedule.registration_closes_at;
    fixture.env.ledger().set_timestamp(closes_at + 1);

    let organizer = fixture.organizer.clone();
    fixture.client.approve_application(&organizer, &who);

    assert_eq!(
        fixture.client.registration(&who).status,
        ApplicationStatus::Approved
    );
    assert!(!fixture.client.may_vote(&who));
}

#[test]
fn an_approved_participant_can_found_a_team() {
    let fixture = open();
    let captain = approved(&fixture);

    let id = fixture.client.create_team(&captain);
    let team = fixture.client.team_by_id(&id);

    assert_eq!(id, 1);
    assert_eq!(team.captain, captain);
    assert_eq!(team.members.len(), 1);
    assert_eq!(fixture.client.team_count(), 1);
}

#[test]
fn somebody_who_was_never_approved_cannot_found_a_team() {
    let fixture = open();
    let pending = applicant(&fixture);

    assert_eq!(
        fixture.client.try_create_team(&pending).err(),
        Some(Ok(Error::NotApproved))
    );
}

#[test]
fn a_team_grows_up_to_the_size_the_organizer_announced() {
    let fixture = open();
    let captain = approved(&fixture);
    let id = fixture.client.create_team(&captain);

    for _ in 0..3 {
        let member = approved(&fixture);
        fixture.client.add_member(&id, &member);
    }

    assert_eq!(fixture.client.team_by_id(&id).members.len(), 4);

    let extra = approved(&fixture);
    assert_eq!(
        fixture.client.try_add_member(&id, &extra).err(),
        Some(Ok(Error::TeamIsFull))
    );
}

/// The sample hackathon runs one team per person, so a second team closes the
/// door on the first.
#[test]
fn one_person_cannot_sit_on_two_teams_when_the_rules_forbid_it() {
    let fixture = open();
    let captain = approved(&fixture);
    fixture.client.create_team(&captain);

    assert_eq!(
        fixture.client.try_create_team(&captain).err(),
        Some(Ok(Error::AlreadyOnAnotherTeam))
    );

    let other_captain = approved(&fixture);
    let other = fixture.client.create_team(&other_captain);

    assert_eq!(
        fixture.client.try_add_member(&other, &captain).err(),
        Some(Ok(Error::AlreadyOnAnotherTeam))
    );
}

#[test]
fn membership_lists_every_team_a_person_belongs_to() {
    let fixture = open();
    let captain = approved(&fixture);
    let id = fixture.client.create_team(&captain);

    assert_eq!(fixture.client.membership(&captain).len(), 1);
    assert_eq!(fixture.client.membership(&captain).get(0), Some(id));

    let outsider = Address::generate(&fixture.env);
    assert_eq!(fixture.client.membership(&outsider).len(), 0);
}

#[test]
fn a_team_that_does_not_exist_cannot_be_joined() {
    let fixture = open();
    let member = approved(&fixture);

    assert_eq!(
        fixture.client.try_add_member(&99, &member).err(),
        Some(Ok(Error::TeamNotFound))
    );
}

#[test]
fn nothing_can_be_applied_for_before_the_hackathon_opens() {
    let fixture = Fixture::locked_with_asset();
    let who = Address::generate(&fixture.env);

    assert_eq!(
        fixture.client.try_apply(&who).err(),
        Some(Ok(Error::WrongPhase))
    );
}
