//! The state machine, stated as an invariant rather than as a sequence.
//!
//! Every other test drives the hackathon forward through the phases it is
//! supposed to visit. These push sideways instead: they take a hackathon
//! sitting in one stage and try every call that belongs to a different one.
//! The product's guarantees are all of the form "this cannot happen before
//! that", so a stage that quietly accepted the next stage's work would undo
//! most of them at once.

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{symbol_short, Address, BytesN, String};

use crate::errors::Error;
use crate::phase::Phase;
use crate::test::Fixture;

fn digest(fixture: &Fixture) -> BytesN<32> {
    BytesN::from_array(&fixture.env, &[2u8; 32])
}

/// A stage only ends when its own condition is met, and the next one is the
/// only place it can go. Together those two facts are what stop a caller
/// choosing a phase rather than reaching it.
#[test]
fn the_lifecycle_never_skips_a_stage() {
    let fixture = Fixture::funded_and_open();
    let schedule = fixture.client.state().schedule;

    assert_eq!(fixture.client.phase(), Phase::Open);

    fixture
        .env
        .ledger()
        .set_timestamp(schedule.submission_closes_at + 1);
    assert_eq!(fixture.client.advance_phase(), Phase::Screening);

    fixture
        .env
        .ledger()
        .set_timestamp(schedule.screening_closes_at + 1);
    assert_eq!(fixture.client.advance_phase(), Phase::Judging);

    fixture
        .env
        .ledger()
        .set_timestamp(schedule.judging_closes_at + 1);
    assert_eq!(fixture.client.advance_phase(), Phase::Reveal);

    // The reveal ends on an action, not on the clock, so the same call that
    // carried the last three stages stops working here no matter how far the
    // ledger timestamp is pushed.
    fixture.env.ledger().set_timestamp(u64::MAX);
    assert_eq!(
        fixture.client.try_advance_phase().err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(fixture.client.phase(), Phase::Reveal);
}

/// A stage waiting on somebody doing the work cannot be ended by waiting. If
/// the clock could close the reveal, a hackathon would reach finalization with
/// scorecards still sealed and rank a field nobody had scored.
#[test]
fn a_stage_that_ends_on_an_action_is_never_ended_by_the_clock() {
    for fixture in [Fixture::created(), Fixture::locked()] {
        fixture.env.ledger().set_timestamp(u64::MAX);

        assert_eq!(
            fixture.client.try_advance_phase().err(),
            Some(Ok(Error::WrongPhase))
        );
    }
}

/// The mirror of the rule above. A stage that ends on the clock cannot be cut
/// short, so nobody closes a window teams are still working in.
#[test]
fn a_stage_that_ends_on_the_clock_is_never_ended_early() {
    let fixture = Fixture::funded_and_open();
    let closes_at = fixture.client.state().schedule.submission_closes_at;

    fixture.env.ledger().set_timestamp(closes_at - 1);

    assert_eq!(
        fixture.client.try_advance_phase().err(),
        Some(Ok(Error::DeadlineNotReached))
    );
    assert_eq!(fixture.client.phase(), Phase::Open);
}

/// Funding is the gate the whole prize guarantee rests on, so nothing that
/// belongs to a running hackathon may happen while the money is still arriving.
#[test]
fn a_hackathon_still_being_funded_accepts_no_part_of_the_event() {
    let fixture = Fixture::locked();
    let stranger = Address::generate(&fixture.env);
    let reason = digest(&fixture);

    assert_eq!(fixture.client.phase(), Phase::Funding);

    assert_eq!(
        fixture.client.try_apply(&stranger).err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(
        fixture.client.try_create_team(&stranger).err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(
        fixture.client.try_invalidate_submission(&1, &reason).err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(
        fixture.client.try_finalize_results().err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(
        fixture.client.try_open_settlement().err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(
        fixture
            .client
            .try_settle_prize(&symbol_short!("payments"), &1)
            .err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(
        fixture.client.try_complete().err(),
        Some(Ok(Error::WrongPhase))
    );
}

/// A running hackathon is not a finished one. Nothing downstream of the reveal
/// may reach into a stage where scorecards are still being collected.
#[test]
fn a_running_hackathon_accepts_nothing_from_the_end_of_the_event() {
    let fixture = Fixture::funded_and_open();
    let reason = digest(&fixture);

    assert_eq!(fixture.client.phase(), Phase::Open);

    assert_eq!(
        fixture.client.try_finalize_results().err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(
        fixture.client.try_open_settlement().err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(
        fixture
            .client
            .try_sweep_unclaimed(&symbol_short!("payments"), &1)
            .err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(
        fixture.client.try_complete().err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(
        fixture
            .client
            .try_open_no_award(&symbol_short!("defi"), &reason)
            .err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(
        fixture.client.try_pause_settlement(&reason).err(),
        Some(Ok(Error::WrongPhase))
    );
}

/// Screening runs before any scorecard exists, and the submission window is
/// shut by then. Letting a project arrive or change afterwards would mean the
/// entry a judge scores is not the entry that was pinned.
#[test]
fn a_closed_submission_window_never_reopens_through_a_later_stage() {
    let fixture = Fixture::funded_and_open();
    let schedule = fixture.client.state().schedule;
    let env = fixture.env.clone();

    env.ledger()
        .set_timestamp(schedule.registration_opens_at + 3_600);

    let captain = Address::generate(&env);
    fixture.client.apply(&captain);
    let organizer = fixture.organizer.clone();
    fixture.client.approve_application(&organizer, &captain);
    let team = fixture.client.create_team(&captain);

    env.ledger()
        .set_timestamp(schedule.submission_closes_at + 1);
    fixture.client.advance_phase();

    assert_eq!(fixture.client.phase(), Phase::Screening);
    assert_eq!(
        fixture
            .client
            .try_submit_project(
                &captain,
                &team,
                &symbol_short!("payments"),
                &digest(&fixture),
                &String::from_str(&env, "ipfs://late"),
            )
            .err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(
        fixture.client.try_apply(&Address::generate(&env)).err(),
        Some(Ok(Error::WrongPhase))
    );
}

/// A hackathon that has come to rest stays there. Cancelled is a terminal
/// stage, and a terminal stage that could still be acted on would mean the
/// vault could be emptied a second time.
#[test]
fn a_stopped_hackathon_moves_no_further_in_any_direction() {
    let fixture = Fixture::created();
    let reason = digest(&fixture);
    fixture.client.cancel(&reason);

    assert_eq!(fixture.client.phase(), Phase::Cancelled);

    fixture.env.ledger().set_timestamp(u64::MAX);

    assert_eq!(
        fixture.client.try_advance_phase().err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(
        fixture.client.try_cancel(&reason).err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(
        fixture.client.try_lock_rules().err(),
        Some(Ok(Error::RulesAlreadyLocked))
    );
    assert_eq!(
        fixture.client.try_finalize_results().err(),
        Some(Ok(Error::WrongPhase))
    );
    assert_eq!(
        fixture.client.try_complete().err(),
        Some(Ok(Error::WrongPhase))
    );
}

/// The rules are frozen by the phase rather than by a flag, so every stage past
/// the draft gives the same answer and there is only ever one truth about
/// whether a hackathon is locked.
#[test]
fn no_stage_after_the_draft_lets_the_rules_move_again() {
    let running = Fixture::funded_and_open();
    let constitution = running.client.constitution();

    assert_eq!(
        running.client.try_configure(&constitution).err(),
        Some(Ok(Error::RulesAlreadyLocked))
    );
    assert_eq!(
        running.client.try_lock_rules().err(),
        Some(Ok(Error::RulesAlreadyLocked))
    );
}
