//! Attacks, each one aimed at a specific promise the product makes.
//!
//! Every other test in the suite runs with authorization mocked, which is right
//! for testing behaviour and wrong for testing authority: under
//! `mock_all_auths` a signature is never actually demanded, so deleting a
//! `require_auth` line would leave the entire suite green. These tests drop the
//! mock, which is the only way the signature checks are exercised at all.
//!
//! The shape is the same throughout. Authorization is cleared, the attacker
//! makes the call, and the transaction dies before it reaches any of the
//! contract's own rules. That ordering matters: the checks are written so the
//! signature is demanded first, which is why a hackathon still in funding is
//! enough to prove the point for a call that would only ever run at settlement.

use soroban_sdk::testutils::Address as _;
use soroban_sdk::{symbol_short, Address, BytesN, String};

use crate::constitution::Deadline;
use crate::test::Fixture;

/// A locked hackathon with every signature revoked.
///
/// Nothing after this line is authorized, so any call that demands a signature
/// dies where it stands.
fn under_attack() -> Fixture {
    let fixture = Fixture::locked();
    fixture.env.set_auths(&[]);

    fixture
}

fn digest(fixture: &Fixture) -> BytesN<32> {
    BytesN::from_array(&fixture.env, &[6u8; 32])
}

/// The lock is the one irreversible step of the setup path. Freezing somebody
/// else's rules would end their ability to fix them, permanently.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_freeze_rules_they_do_not_own() {
    let fixture = Fixture::created();
    fixture.env.set_auths(&[]);

    fixture.client.lock_rules();
}

/// A draft nobody signs for is a draft anybody could rewrite between the
/// organizer reading it and locking it.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_rewrite_a_draft_they_do_not_own() {
    let fixture = Fixture::created();
    let constitution = fixture.client.constitution();

    fixture.env.set_auths(&[]);
    fixture.client.configure(&constitution);
}

/// Binding the vault is what ties a hackathon to real money. An unsigned bind
/// would let anyone point an event at a pool they control and publish a prize
/// that was never committed.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_point_a_hackathon_at_a_pool_of_their_own() {
    let fixture = under_attack();
    let pool = Address::generate(&fixture.env);

    fixture.client.bind_vault(&pool);
}

/// The organizing team decides who reviews applications. Adding yourself to it
/// without a signature would be the whole access control model gone.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_add_themselves_to_the_organizing_team() {
    let fixture = under_attack();
    let intruder = Address::generate(&fixture.env);

    fixture.client.add_collaborator(&intruder);
}

/// Screening removes a competitor from the running. It is the cheapest attack
/// in the product if it is not signed for.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_rule_a_competitor_out_of_the_running() {
    let fixture = under_attack();

    fixture.client.invalidate_submission(&1, &digest(&fixture));
}

/// Time is the resource every team plans around. Moving a deadline without a
/// signature would let anyone shorten or stretch somebody else's weekend.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_move_a_deadline_they_did_not_announce() {
    let fixture = under_attack();
    let closes_at = fixture.client.state().schedule.submission_closes_at;

    fixture.client.extend_deadline(
        &Deadline::Submission,
        &(closes_at + 3_600),
        &digest(&fixture),
    );
}

/// Opening a case is a public accusation against a named team, and the page
/// carries it whether or not it ever succeeds.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_accuse_a_team_without_signing_for_it() {
    let fixture = under_attack();

    fixture.client.open_disqualification(&1, &digest(&fixture));
}

/// The judge threshold is the only thing standing between an organizer and the
/// power to remove whoever they like. A signature that costs nothing to produce
/// is not a threshold.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_forge_a_judges_signature_on_a_removal() {
    let fixture = under_attack();
    let judge = fixture.client.constitution().judges.get(0).unwrap().judge;

    fixture.client.approve_disqualification(&judge, &1);
}

/// The same threshold, guarding the decision to stop the event and send the
/// pool back to the organizer.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_forge_a_judges_signature_on_a_cancellation() {
    let fixture = under_attack();
    let judge = fixture.client.constitution().judges.get(0).unwrap().judge;

    fixture.client.approve_cancellation(&judge);
}

/// Sealing is the moment the scorecards stop being changeable. Whoever
/// publishes the root decides which set of scorecards the event ran on.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_but_the_sealer_can_close_the_judging_window() {
    let fixture = under_attack();

    fixture.client.publish_score_root(&digest(&fixture));
}

/// A hold stops every winner's money at once, which makes it the most
/// disruptive single call in the contract.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_freeze_everybodys_prize_money() {
    let fixture = under_attack();

    fixture.client.pause_settlement(&digest(&fixture));
}

/// Withholding a track's prize sends the money back to the organizer, so an
/// unsigned call here is a direct route from a prize pool to one address.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_withhold_a_track_prize_without_signing_for_it() {
    let fixture = under_attack();

    fixture
        .client
        .open_no_award(&symbol_short!("defi"), &digest(&fixture));
}

/// Cancelling in funding empties the vault back to the organizer in one call.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_call_off_a_hackathon_and_empty_its_vault() {
    let fixture = under_attack();

    fixture.client.cancel(&digest(&fixture));
}

/// Applying in somebody else's name would let an attacker fill the electorate
/// with wallets whose owners never asked to take part.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_sign_somebody_else_up() {
    let fixture = Fixture::funded_and_open();
    let victim = Address::generate(&fixture.env);

    fixture.env.set_auths(&[]);
    fixture.client.apply(&victim);
}

/// Entering a project is what pins a team's work. An unsigned entry would let
/// anyone overwrite a team's submission with their own.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_enter_a_project_on_a_teams_behalf() {
    let fixture = Fixture::funded_and_open();
    let stranger = Address::generate(&fixture.env);

    fixture.env.set_auths(&[]);
    fixture.client.submit_project(
        &stranger,
        &1,
        &symbol_short!("payments"),
        &digest(&fixture),
        &String::from_str(&fixture.env, "ipfs://theirs"),
    );
}

/// Approving an application decides who is in the electorate, so the reviewer
/// has to be the reviewer rather than merely claim to be.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_wave_an_applicant_through_without_signing() {
    let fixture = Fixture::funded_and_open();
    let organizer = fixture.organizer.clone();
    let applicant = Address::generate(&fixture.env);

    fixture.env.set_auths(&[]);
    fixture.client.approve_application(&organizer, &applicant);
}

/// Stepping away from a project is a judge's own declaration about their own
/// conflict. Made by anyone else, it becomes a way to thin out a bench.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_step_a_judge_away_from_a_project() {
    let fixture = under_attack();
    let judge = fixture.client.constitution().judges.get(0).unwrap().judge;

    fixture.client.recuse(&judge, &1);
}
