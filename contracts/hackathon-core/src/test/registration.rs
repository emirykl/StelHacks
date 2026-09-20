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

/// The same, for a hackathon whose rules let everybody in.
fn open_to_all() -> Fixture {
    let fixture = Fixture::funded_and_open_to_all();
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
        Some(Ok(Error::ApplicationNotPending))
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

/// An open event is the one an organizer cannot express by working faster.
///
/// Every application under the reviewed policy costs a signature that decides
/// nothing when the answer was always yes, and a hundred of them is a hundred
/// chances to leave somebody waiting on a queue that was never meant to hold
/// anyone. Announced before the lock, so nobody is admitted under rules that
/// changed after they applied.
#[test]
fn an_open_hackathon_admits_everybody_the_moment_they_apply() {
    let fixture = open_to_all();
    let who = applicant(&fixture);

    assert_eq!(
        fixture.client.registration(&who).status,
        ApplicationStatus::Approved
    );
    assert!(fixture.client.may_vote(&who));
}

/// The admission has to be a decision and not just a status, because
/// everything downstream reads the moment it was made: the electorate is fixed
/// at the registration deadline and asks when somebody was approved, not
/// whether the rules would have approved them.
#[test]
fn an_open_admission_is_dated_the_moment_it_arrived() {
    let fixture = open_to_all();
    let who = applicant(&fixture);
    let registration = fixture.client.registration(&who);

    assert_eq!(registration.decided_at, registration.applied_at);
}

/// Open means open. Somebody who is already in cannot be reviewed afterwards,
/// which is the same refusal a second decision has always met and matters more
/// here: an organizer who could reject an admitted entrant would have the
/// reviewed policy back without having announced it.
#[test]
fn nobody_can_be_turned_away_from_an_open_hackathon_afterwards() {
    let fixture = open_to_all();
    let who = applicant(&fixture);
    let organizer = fixture.organizer.clone();

    assert_eq!(
        fixture
            .client
            .try_reject_application(&organizer, &who, &reason(&fixture))
            .err(),
        Some(Ok(Error::ApplicationNotPending))
    );
    assert_eq!(
        fixture
            .client
            .try_approve_application(&organizer, &who)
            .err(),
        Some(Ok(Error::ApplicationNotPending))
    );
}

/// The deadline still fixes who can be in the electorate. An open policy
/// decides who gets in, not when applications stop.
#[test]
fn an_open_hackathon_still_closes_when_registration_does() {
    let fixture = open_to_all();
    let closes_at = fixture.client.state().schedule.registration_closes_at;
    fixture.env.ledger().set_timestamp(closes_at + 1);

    let latecomer = Address::generate(&fixture.env);

    assert_eq!(
        fixture.client.try_apply(&latecomer).err(),
        Some(Ok(Error::DeadlinePassed))
    );
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
        Some(Ok(Error::ApplicationNotPending))
    );
}

/// Clearing a queue in one signature, which is the whole reason the batch
/// exists: forty wallet prompts is not a slow afternoon, it is a queue nobody
/// finishes.
mod in_a_batch {
    use super::*;

    use soroban_sdk::{vec, Vec};

    /// Three applicants, waiting.
    fn queue(fixture: &Fixture) -> Vec<Address> {
        vec![
            &fixture.env,
            applicant(fixture),
            applicant(fixture),
            applicant(fixture),
        ]
    }

    /// Every one of them gets in, and each gets their own row rather than a
    /// shared one. A batch is a signature over several decisions, not one
    /// decision about several people.
    #[test]
    fn approving_a_queue_admits_every_name_in_it() {
        let fixture = open();
        let organizer = fixture.organizer.clone();
        let waiting = queue(&fixture);

        assert_eq!(fixture.client.approve_applications(&organizer, &waiting), 3);

        for who in waiting.iter() {
            let row = fixture.client.registration(&who);

            assert!(row.status == ApplicationStatus::Approved);
            assert_eq!(row.decided_at, fixture.env.ledger().timestamp());
        }
    }

    /// One written reason for the batch, recorded against each of them. It is
    /// what a reviewer turning thirty people away actually has: a rule they
    /// all fell outside of.
    #[test]
    fn refusing_a_queue_records_the_one_reason_against_each_of_them() {
        let fixture = open();
        let organizer = fixture.organizer.clone();
        let waiting = queue(&fixture);

        assert_eq!(
            fixture
                .client
                .reject_applications(&organizer, &waiting, &reason(&fixture)),
            3
        );

        for who in waiting.iter() {
            let row = fixture.client.registration(&who);

            assert!(row.status == ApplicationStatus::Rejected);
            assert_eq!(row.reason, reason(&fixture));
        }
    }

    /// One applicant's situation is that applicant's. A queue read into a
    /// browser a minute ago is a queue somebody may have been decided in
    /// since, and that is not a fact about the other thirty nine: taking them
    /// all down over it would mean the bigger the queue, the likelier that
    /// clearing it does nothing at all.
    #[test]
    fn a_name_already_decided_is_passed_over_and_the_rest_go_through() {
        let fixture = open();
        let organizer = fixture.organizer.clone();
        let waiting = queue(&fixture);

        let first = waiting.get_unchecked(0);
        fixture
            .client
            .reject_application(&organizer, &first, &reason(&fixture));

        assert_eq!(
            fixture.client.approve_applications(&organizer, &waiting),
            2,
            "the two that were still there to decide"
        );

        // The refusal already on the record stands. A batch approval is not a
        // way to overturn a decision somebody has already taken.
        assert!(fixture.client.registration(&first).status == ApplicationStatus::Rejected);

        for who in waiting.iter().skip(1) {
            assert!(fixture.client.registration(&who).status == ApplicationStatus::Approved);
        }
    }

    /// A name nobody has an application for is a name there was no decision to
    /// make about, and it costs the rest of the list nothing.
    #[test]
    fn a_name_that_never_applied_is_passed_over_too() {
        let fixture = open();
        let organizer = fixture.organizer.clone();
        let who = applicant(&fixture);
        let stranger = Address::generate(&fixture.env);

        assert_eq!(
            fixture
                .client
                .approve_applications(&organizer, &vec![&fixture.env, stranger, who.clone()]),
            1
        );

        assert!(fixture.client.registration(&who).status == ApplicationStatus::Approved);
    }

    /// The same name twice is one decision, not one decision and one failure.
    /// Nobody assembling a selection in a browser should have to guarantee it
    /// holds no duplicates.
    #[test]
    fn the_same_name_twice_is_decided_once() {
        let fixture = open();
        let organizer = fixture.organizer.clone();
        let who = applicant(&fixture);

        assert_eq!(
            fixture
                .client
                .approve_applications(&organizer, &vec![&fixture.env, who.clone(), who.clone()]),
            1
        );

        assert!(fixture.client.registration(&who).status == ApplicationStatus::Approved);
    }

    /// The batch is not a way around who may decide. Passing over a name the
    /// reviewer cannot decide is one thing; passing over the reviewer is
    /// another, and this gate is the same function the singular calls use.
    #[test]
    fn a_stranger_cannot_clear_somebody_elses_queue() {
        let fixture = open();
        let stranger = Address::generate(&fixture.env);
        let waiting = queue(&fixture);

        assert_eq!(
            fixture
                .client
                .try_approve_applications(&stranger, &waiting)
                .err(),
            Some(Ok(Error::NotAuthorized))
        );
    }

    /// Asking for no decisions decides nothing, and says so. A reviewer who
    /// pressed the button with an empty selection has wasted a fee, not
    /// corrupted a roster.
    #[test]
    fn an_empty_batch_changes_nothing() {
        let fixture = open();
        let organizer = fixture.organizer.clone();
        let who = applicant(&fixture);

        assert_eq!(
            fixture
                .client
                .approve_applications(&organizer, &Vec::new(&fixture.env)),
            0
        );

        assert!(fixture.client.registration(&who).status == ApplicationStatus::Pending);
    }
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
        Some(Ok(Error::NotAuthorized))
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
        Some(Ok(Error::TeamJoinRejected))
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
        Some(Ok(Error::TeamJoinRejected))
    );

    let other_captain = approved(&fixture);
    let other = fixture.client.create_team(&other_captain);

    assert_eq!(
        fixture.client.try_add_member(&other, &captain).err(),
        Some(Ok(Error::TeamJoinRejected))
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
        Some(Ok(Error::NotFound))
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
