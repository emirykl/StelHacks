//! The paths where somebody exercises judgement after the rules are locked.
//!
//! Every one of them is a place the product could quietly become the thing it
//! set out to replace, so each is bounded by something announced beforehand and
//! each leaves a reason behind.

use soroban_sdk::testutils::Ledger;
use soroban_sdk::BytesN;

use crate::constitution::Deadline;
use crate::errors::Error;
use crate::fixtures::{DAY, HOUR};
use crate::test::Fixture;

/// A running hackathon with the clock set before any deadline has passed.
fn running() -> Fixture {
    let fixture = Fixture::funded_and_open();
    fixture.env.ledger().set_timestamp(1_006 * DAY);

    fixture
}

fn reason(fixture: &Fixture) -> BytesN<32> {
    BytesN::from_array(&fixture.env, &[5u8; 32])
}

#[test]
fn an_organizer_can_give_a_deadline_more_time() {
    let fixture = running();
    let moved_to = fixture.client.state().schedule.submission_closes_at + HOUR;

    fixture
        .client
        .extend_deadline(&Deadline::Submission, &moved_to, &reason(&fixture));

    assert_eq!(
        fixture.client.state().schedule.submission_closes_at,
        moved_to
    );

    let usage = fixture.client.extension_usage(&Deadline::Submission);
    assert_eq!(usage.times, 1);
    assert_eq!(usage.seconds_added, HOUR);
}

/// The reason the effective schedule lives outside the constitution at all. If
/// an extension rewrote the locked rules, a legitimate hour granted after an
/// outage would break the digest and look exactly like tampering.
#[test]
fn the_announced_schedule_stays_where_the_rules_froze_it() {
    let fixture = running();
    let announced = fixture.client.constitution().schedule;
    let hash = fixture.client.constitution_hash();

    fixture.client.extend_deadline(
        &Deadline::Submission,
        &(announced.submission_closes_at + HOUR),
        &reason(&fixture),
    );

    assert_eq!(fixture.client.constitution().schedule, announced);
    assert_eq!(fixture.client.constitution_hash(), hash);
    assert_ne!(fixture.client.state().schedule, announced);
}

/// An extension only ever adds time. Pulling a deadline in would cut short a
/// window teams are already working against, which is the one direction nobody
/// can plan for.
#[test]
fn a_deadline_cannot_be_pulled_in() {
    let fixture = running();
    let earlier = fixture.client.state().schedule.submission_closes_at - HOUR;

    assert_eq!(
        fixture
            .client
            .try_extend_deadline(&Deadline::Submission, &earlier, &reason(&fixture))
            .err(),
        Some(Ok(Error::DeadlineCannotShorten))
    );
}

/// Reopening a closed window would let an organizer read what arrived and only
/// then decide whether the teams that missed it deserve another chance.
#[test]
fn a_deadline_that_has_passed_cannot_be_reopened() {
    let fixture = running();
    let closes_at = fixture.client.state().schedule.submission_closes_at;
    fixture.env.ledger().set_timestamp(closes_at);

    assert_eq!(
        fixture
            .client
            .try_extend_deadline(
                &Deadline::Submission,
                &(closes_at + HOUR),
                &reason(&fixture)
            )
            .err(),
        Some(Ok(Error::DeadlinePassed))
    );
}

/// The allowance is published before the lock, so a participant knows up front
/// how far a window can slip. It stops meaning that the moment the contract
/// lets the organizer spend more than they announced.
#[test]
fn the_allowance_runs_out_where_the_rules_said_it_would() {
    let fixture = running();
    let closes_at = fixture.client.state().schedule.submission_closes_at;
    let reason = reason(&fixture);

    // The sample rules announce two moves per deadline.
    fixture
        .client
        .extend_deadline(&Deadline::Submission, &(closes_at + HOUR), &reason);
    fixture
        .client
        .extend_deadline(&Deadline::Submission, &(closes_at + 2 * HOUR), &reason);

    assert_eq!(
        fixture
            .client
            .try_extend_deadline(&Deadline::Submission, &(closes_at + 3 * HOUR), &reason)
            .err(),
        Some(Ok(Error::ExtensionLimitReached))
    );

    let usage = fixture.client.extension_usage(&Deadline::Submission);
    assert_eq!(usage.times, 2);
    assert_eq!(usage.seconds_added, 2 * HOUR);
}

/// The check that matters most. Pushing submission past screening leaves a
/// schedule that cannot run, and it is the shape a well meant extension takes
/// when the organizer only looks at the deadline they are moving.
#[test]
fn an_extension_that_overruns_the_next_deadline_is_refused() {
    let fixture = running();
    let schedule = fixture.client.state().schedule;

    assert_eq!(
        fixture
            .client
            .try_extend_deadline(
                &Deadline::Submission,
                &schedule.screening_closes_at,
                &reason(&fixture)
            )
            .err(),
        Some(Ok(Error::ScheduleInvalid))
    );

    assert_eq!(
        fixture.client.state().schedule,
        schedule,
        "a refused extension leaves the schedule exactly where it was"
    );
}

/// Budgets are declared per deadline, so a slipping submission window must not
/// be able to eat the room the judges were promised.
#[test]
fn each_deadline_carries_its_own_allowance() {
    let fixture = running();
    let schedule = fixture.client.state().schedule;
    let reason = reason(&fixture);

    fixture.client.extend_deadline(
        &Deadline::Registration,
        &(schedule.registration_closes_at + HOUR),
        &reason,
    );
    fixture.client.extend_deadline(
        &Deadline::Registration,
        &(schedule.registration_closes_at + 2 * HOUR),
        &reason,
    );

    assert_eq!(
        fixture
            .client
            .try_extend_deadline(
                &Deadline::Registration,
                &(schedule.registration_closes_at + 3 * HOUR),
                &reason
            )
            .err(),
        Some(Ok(Error::ExtensionLimitReached))
    );

    fixture.client.extend_deadline(
        &Deadline::Submission,
        &(schedule.submission_closes_at + HOUR),
        &reason,
    );

    assert_eq!(
        fixture.client.extension_usage(&Deadline::Submission).times,
        1
    );
}

/// Before the lock the schedule is simply edited, and spending an allowance
/// against rules nobody has been shown yet would cost the organizer room they
/// might need once the event is real.
#[test]
fn a_deadline_cannot_be_moved_while_the_rules_are_still_a_draft() {
    let fixture = Fixture::created();
    let moved_to = fixture.client.state().schedule.submission_closes_at + HOUR;

    assert_eq!(
        fixture
            .client
            .try_extend_deadline(&Deadline::Submission, &moved_to, &reason(&fixture))
            .err(),
        Some(Ok(Error::RulesNotLocked))
    );
}
