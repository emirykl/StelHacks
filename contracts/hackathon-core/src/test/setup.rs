use soroban_sdk::testutils::{Address as _, Events};
use soroban_sdk::Address;

use crate::constitution::{PrizeTier, CONSTITUTION_VERSION};
use crate::errors::Error;
use crate::fixtures::sample_constitution;
use crate::hashing::hash_constitution;
use crate::phase::Phase;
use crate::test::Fixture;

#[test]
fn a_created_hackathon_starts_as_a_draft_owned_by_its_organizer() {
    let fixture = Fixture::created();

    assert_eq!(fixture.client.phase(), Phase::Draft);
    assert_eq!(fixture.client.team().organizer, fixture.organizer);
    assert_eq!(fixture.client.team().collaborators.len(), 0);
}

#[test]
fn a_hackathon_cannot_be_created_twice_in_one_contract() {
    let fixture = Fixture::created();
    let constitution = sample_constitution(&fixture.env);

    assert_eq!(
        fixture
            .client
            .try_create(&fixture.organizer, &constitution)
            .err(),
        Some(Ok(Error::AlreadyInitialized))
    );
}

/// Rules are checked when they are written rather than when they are locked, so
/// an organizer finds the problem while they are still editing.
#[test]
fn rules_that_cannot_run_are_refused_at_creation() {
    let fixture = Fixture::empty();
    let mut constitution = sample_constitution(&fixture.env);
    constitution.judge_quorum = 99;

    assert_eq!(
        fixture
            .client
            .try_create(&fixture.organizer, &constitution)
            .err(),
        Some(Ok(Error::ConstitutionInvalid))
    );
}

#[test]
fn the_draft_can_be_reconfigured_and_the_effective_schedule_follows() {
    let fixture = Fixture::created();

    let mut constitution = sample_constitution(&fixture.env);
    constitution.schedule.submission_closes_at += 3_600;
    fixture.client.configure(&constitution);

    assert_eq!(
        fixture.client.state().schedule.submission_closes_at,
        constitution.schedule.submission_closes_at
    );
    assert_eq!(fixture.client.constitution(), constitution);
}

#[test]
fn a_reconfiguration_that_breaks_the_rules_is_refused() {
    let fixture = Fixture::created();

    let mut constitution = sample_constitution(&fixture.env);
    constitution.vote.community_bps = 9_999;

    assert_eq!(
        fixture.client.try_configure(&constitution).err(),
        Some(Ok(Error::ConstitutionInvalid))
    );
}

#[test]
fn locking_moves_the_hackathon_on_and_returns_the_digest() {
    let fixture = Fixture::created();

    let hash = fixture.client.lock_rules();

    assert_eq!(fixture.client.phase(), Phase::Funding);
    assert_eq!(fixture.client.constitution_hash(), hash);
}

/// The promise the whole product rests on. Once the rules are locked there is
/// no path back into them, and the organizer holding every other power in the
/// system does not change that.
#[test]
fn locked_rules_cannot_be_changed_by_anyone_including_the_organizer() {
    let fixture = Fixture::locked();

    let mut constitution = sample_constitution(&fixture.env);
    let track = constitution.prize_tiers.get(0).unwrap().track;
    constitution.prize_tiers.set(
        0,
        PrizeTier {
            track,
            rank: 1,
            amount: 1,
        },
    );

    assert_eq!(
        fixture.client.try_configure(&constitution).err(),
        Some(Ok(Error::RulesAlreadyLocked))
    );
    assert_eq!(
        fixture.client.try_lock_rules().err(),
        Some(Ok(Error::RulesAlreadyLocked))
    );
}

/// A participant who recomputes the digest from the published rules has to
/// arrive at the value stored on chain, or the comparison proves nothing.
#[test]
fn the_stored_digest_is_the_digest_of_the_stored_rules() {
    let fixture = Fixture::created();
    let hash = fixture.client.lock_rules();

    let stored = fixture.client.constitution();

    assert_eq!(hash_constitution(&fixture.env, &stored), hash);
}

#[test]
fn the_digest_is_missing_until_the_rules_are_locked() {
    let fixture = Fixture::created();

    assert_eq!(
        fixture.client.try_constitution_hash().err(),
        Some(Ok(Error::NotFound))
    );
}

#[test]
fn collaborators_can_be_added_and_removed() {
    let fixture = Fixture::created();
    let helper = Address::generate(&fixture.env);

    fixture.client.add_collaborator(&helper);
    assert!(fixture.client.team().can_review_applications(&helper));

    fixture.client.remove_collaborator(&helper);
    assert!(!fixture.client.team().can_review_applications(&helper));
}

/// The collaborator list is the one part of the setup that stays open after the
/// lock, because an organizer buried in applications cannot wait for a new
/// hackathon to get help.
#[test]
fn collaborators_can_still_be_added_after_the_rules_are_locked() {
    let fixture = Fixture::locked();
    let helper = Address::generate(&fixture.env);

    fixture.client.add_collaborator(&helper);

    assert!(fixture.client.team().can_review_applications(&helper));
}

#[test]
fn the_same_collaborator_cannot_be_added_twice() {
    let fixture = Fixture::created();
    let helper = Address::generate(&fixture.env);
    fixture.client.add_collaborator(&helper);

    assert_eq!(
        fixture.client.try_add_collaborator(&helper).err(),
        Some(Ok(Error::CollaboratorInvalid))
    );
}

#[test]
fn removing_someone_who_was_never_a_collaborator_is_refused() {
    let fixture = Fixture::created();
    let stranger = Address::generate(&fixture.env);

    assert_eq!(
        fixture.client.try_remove_collaborator(&stranger).err(),
        Some(Ok(Error::CollaboratorInvalid))
    );
}

/// The indexer rebuilds everything from the event stream, so a step that leaves
/// no event is a step the proof page can never show. The test environment keeps
/// only the most recent invocation's events, so each step is checked as it
/// happens rather than counted at the end.
#[test]
fn every_step_of_the_setup_path_leaves_an_event() {
    let fixture = Fixture::empty();
    let constitution = sample_constitution(&fixture.env);
    let helper = Address::generate(&fixture.env);

    fixture.client.create(&fixture.organizer, &constitution);
    assert_eq!(events_emitted(&fixture), 1, "create");

    fixture.client.configure(&constitution);
    assert_eq!(events_emitted(&fixture), 1, "configure");

    fixture.client.add_collaborator(&helper);
    assert_eq!(events_emitted(&fixture), 1, "add_collaborator");

    fixture.client.remove_collaborator(&helper);
    assert_eq!(events_emitted(&fixture), 1, "remove_collaborator");

    fixture.client.lock_rules();
    assert_eq!(events_emitted(&fixture), 1, "lock_rules");
}

/// Events this contract emitted during the most recent invocation.
fn events_emitted(fixture: &Fixture) -> usize {
    fixture
        .env
        .events()
        .all()
        .filter_by_contract(&fixture.client.address)
        .events()
        .len()
}

/// A read only call changes nothing, so it announces nothing.
#[test]
fn reading_the_hackathon_emits_nothing() {
    let fixture = Fixture::locked();

    fixture.client.state();

    assert_eq!(events_emitted(&fixture), 0);
}

/// A constitution can only have one shape per wasm, so the version field is a
/// label rather than a choice. Nothing checked it, and a caller that stamped the
/// wrong number produced a document that froze, ran, and was then dropped by
/// every reader that believed the label.
#[test]
fn a_constitution_labelled_with_the_wrong_shape_is_refused() {
    let fixture = Fixture::empty();
    let mut constitution = sample_constitution(&fixture.env);

    constitution.version = CONSTITUTION_VERSION - 1;

    assert_eq!(
        fixture
            .client
            .try_create(&fixture.organizer, &constitution)
            .err(),
        Some(Ok(Error::ConstitutionInvalid))
    );
}
