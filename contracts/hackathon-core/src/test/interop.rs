//! The handshake between this contract and the TypeScript SDK.
//!
//! Both sides serialize and hash the same values, and the product's central
//! claim rests on them agreeing: a participant rebuilds the constitution from
//! the public page, hashes it in the browser, and compares against what the
//! chain stored. Two implementations that drifted apart would break that
//! quietly, because each one would keep passing its own tests.
//!
//! So the agreement is written down instead. The files under `fixtures/` are
//! the referee. This module proves the contract still produces them; the SDK's
//! own suite proves TypeScript reaches the same values from the same inputs.
//! Neither side can move without the other noticing, because moving means
//! changing a file both of them read.
//!
//! If a change here is deliberate, regenerate the fixtures and expect the
//! TypeScript suite to fail until it is updated to match. That failure is the
//! system working.

extern crate std;

use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{symbol_short, Address, Bytes, Env};
use std::string::String as StdString;

use crate::fixtures::{
    canonical_ballot, canonical_constitution, canonical_scorecard, sample_metadata, CANONICAL_VOTER,
};
use crate::hashing::{ballot_leaf, hash_constitution, hash_submission_metadata, scorecard_leaf};
use crate::merkle;

/// Fixture contents are trimmed, because a file ending in a newline is the
/// normal thing for a text file to do and neither language should care.
macro_rules! fixture {
    ($name:literal) => {
        include_str!(concat!("../../../../fixtures/", $name)).trim()
    };
}

fn hex(bytes: &[u8]) -> StdString {
    use std::fmt::Write;

    bytes.iter().fold(StdString::new(), |mut out, byte| {
        let _ = write!(out, "{byte:02x}");
        out
    })
}

fn hex_of(bytes: &Bytes) -> StdString {
    hex(&bytes.iter().collect::<std::vec::Vec<u8>>())
}

/// The bytes, before any hashing.
///
/// Checked separately from the digest because the two failures mean different
/// things. A digest that moved while the bytes did not would mean the hashing
/// changed; bytes that moved mean the type itself did, and that is the change
/// that silently invalidates every constitution already locked on chain.
#[test]
fn the_canonical_constitution_serializes_to_the_bytes_both_languages_expect() {
    let env = Env::default();
    let constitution = canonical_constitution(&env);

    assert_eq!(
        hex_of(&constitution.to_xdr(&env)),
        fixture!("constitution.xdr.hex")
    );
}

#[test]
fn the_canonical_constitution_hashes_to_the_digest_both_languages_expect() {
    let env = Env::default();
    let constitution = canonical_constitution(&env);

    assert_eq!(
        hex(&hash_constitution(&env, &constitution).to_array()),
        fixture!("constitution.sha256")
    );
}

#[test]
fn the_canonical_submission_serializes_and_hashes_as_both_languages_expect() {
    let env = Env::default();
    let metadata = sample_metadata(&env, symbol_short!("payments"));

    assert_eq!(
        hex_of(&metadata.clone().to_xdr(&env)),
        fixture!("submission.xdr.hex")
    );
    assert_eq!(
        hex(&hash_submission_metadata(&env, &metadata).to_array()),
        fixture!("submission.sha256")
    );
}

/// The leaf a judge checks their own inclusion proof against. If this moved,
/// every judge holding a receipt from before the change would find their proof
/// no longer verified, with nothing to tell them why.
#[test]
fn the_canonical_scorecard_reaches_the_leaf_both_languages_expect() {
    let env = Env::default();

    assert_eq!(
        hex(&scorecard_leaf(&env, &canonical_scorecard(&env)).to_array()),
        fixture!("scorecard-leaf.sha256")
    );
}

#[test]
fn the_canonical_ballot_reaches_the_leaf_both_languages_expect() {
    let env = Env::default();
    let voter = Address::from_str(&env, CANONICAL_VOTER);

    assert_eq!(
        hex(&ballot_leaf(&env, &voter, &canonical_ballot(&env)).to_array()),
        fixture!("ballot-leaf.sha256")
    );
}

/// One node over the two leaves above, which pins the pair ordering and the
/// node tag as well as the leaves themselves. A client that sorted the pair the
/// other way, or left the tag off, would land somewhere else.
#[test]
fn the_two_leaves_combine_into_the_root_both_languages_expect() {
    let env = Env::default();
    let voter = Address::from_str(&env, CANONICAL_VOTER);

    let scorecard = scorecard_leaf(&env, &canonical_scorecard(&env));
    let ballot = ballot_leaf(&env, &voter, &canonical_ballot(&env));

    assert_eq!(
        hex(&merkle::node(&env, &scorecard, &ballot).to_array()),
        fixture!("merkle-root.sha256")
    );
    assert_eq!(
        merkle::node(&env, &scorecard, &ballot),
        merkle::node(&env, &ballot, &scorecard),
        "the pair is sorted before hashing, so a proof carries no direction bits"
    );
}

/// One real event, captured whole.
///
/// The indexer rebuilds every derived row from this stream and from nothing
/// else, so the SDK has to be able to read an event exactly as the chain
/// emitted it. Committing a real one means the decoder is measured against
/// what the contract actually publishes rather than against a shape somebody
/// wrote down in TypeScript and believed.
#[test]
fn a_published_event_matches_the_bytes_the_sdk_decodes() {
    use crate::test::Fixture;
    use soroban_sdk::testutils::{Events, Ledger};
    use soroban_sdk::xdr::{Limits, WriteXdr};
    use soroban_sdk::{BytesN, String as SorobanString};

    let fixture = Fixture::funded_and_open();
    let schedule = fixture.client.state().schedule;
    let env = fixture.env.clone();

    env.ledger()
        .set_timestamp(schedule.registration_opens_at + 3_600);

    let captain = Address::from_str(&env, CANONICAL_VOTER);
    fixture.client.apply(&captain);
    let organizer = fixture.organizer.clone();
    fixture.client.approve_application(&organizer, &captain);
    let team = fixture.client.create_team(&captain);

    fixture.client.submit_project(
        &captain,
        &team,
        &symbol_short!("payments"),
        &BytesN::from_array(&env, &[3u8; 32]),
        &SorobanString::from_str(&env, "ipfs://cid"),
    );

    let captured = env.events().all();
    let event = captured.events().last().unwrap();

    assert_eq!(
        hex(&event.to_xdr(Limits::none()).unwrap()),
        fixture!("event-project-submitted.hex")
    );
}

/// Builds the two team scenario the ranking fixture describes.
fn ranked_scenario() -> (crate::test::Fixture, std::vec::Vec<u32>) {
    use crate::hashing::scorecard_leaf;
    use crate::scorecard::{CriterionScore, Scorecard};
    use crate::test::Fixture;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{vec, BytesN, String as SorobanString, Vec};

    let fixture = Fixture::funded_and_open();
    let env = fixture.env.clone();
    let schedule = fixture.client.state().schedule;

    env.ledger()
        .set_timestamp(schedule.registration_opens_at + 3_600);

    let mut teams = std::vec::Vec::new();
    for digest in 1u8..=2 {
        let captain = Address::generate(&env);
        fixture.client.apply(&captain);
        let organizer = fixture.organizer.clone();
        fixture.client.approve_application(&organizer, &captain);

        let team = fixture.client.create_team(&captain);
        fixture.client.submit_project(
            &captain,
            &team,
            &symbol_short!("payments"),
            &BytesN::from_array(&env, &[digest; 32]),
            &SorobanString::from_str(&env, "ipfs://cid"),
        );
        teams.push(team);
    }

    env.ledger()
        .set_timestamp(schedule.submission_closes_at + 1);
    fixture.client.advance_phase();
    env.ledger().set_timestamp(schedule.screening_closes_at + 1);
    fixture.client.advance_phase();

    // The first team scores better with every judge, so the ranking is decided
    // on score alone and the tie break never runs.
    let mut cards = Vec::new(&env);
    for index in 0..3u32 {
        let judge = fixture
            .client
            .constitution()
            .judges
            .get(index)
            .unwrap()
            .judge;

        for (position, &team) in teams.iter().enumerate() {
            let base = if position == 0 { 90 } else { 40 };
            cards.push_back(Scorecard {
                judge: judge.clone(),
                team,
                scores: vec![
                    &env,
                    CriterionScore {
                        criterion: symbol_short!("technical"),
                        score: base,
                    },
                    CriterionScore {
                        criterion: symbol_short!("novelty"),
                        score: base - 10,
                    },
                ],
            });
        }
    }

    let mut leaves = Vec::new(&env);
    for index in 0..cards.len() {
        leaves.push_back(scorecard_leaf(&env, &cards.get(index).unwrap()));
    }

    let (root, proofs) = build_tree(&env, &leaves);

    env.ledger().set_timestamp(schedule.judging_closes_at);
    fixture.client.publish_score_root(&root);

    env.ledger().set_timestamp(schedule.judging_closes_at + 1);
    fixture.client.advance_phase();

    for index in 0..cards.len() {
        fixture
            .client
            .reveal_score(&cards.get(index).unwrap(), &proofs.get(index).unwrap());
    }

    fixture.client.finalize_results();

    (fixture, teams)
}

/// A tree over any number of leaves, with a proof for each one.
fn build_tree(
    env: &Env,
    leaves: &soroban_sdk::Vec<soroban_sdk::BytesN<32>>,
) -> (
    soroban_sdk::BytesN<32>,
    soroban_sdk::Vec<soroban_sdk::Vec<soroban_sdk::BytesN<32>>>,
) {
    use soroban_sdk::Vec;

    let count = leaves.len();
    let mut proofs = Vec::new(env);
    let mut positions = Vec::new(env);
    for index in 0..count {
        proofs.push_back(Vec::new(env));
        positions.push_back(index);
    }

    let mut level = leaves.clone();

    while level.len() > 1 {
        for leaf in 0..count {
            let position = positions.get(leaf).unwrap();
            let sibling = if position.is_multiple_of(2) {
                if position + 1 < level.len() {
                    Some(position + 1)
                } else {
                    None
                }
            } else {
                Some(position - 1)
            };

            if let Some(sibling) = sibling {
                let mut proof = proofs.get(leaf).unwrap();
                proof.push_back(level.get(sibling).unwrap());
                proofs.set(leaf, proof);
            }

            positions.set(leaf, position / 2);
        }

        let mut next = Vec::new(env);
        let mut at = 0;
        while at < level.len() {
            if at + 1 < level.len() {
                next.push_back(merkle::node(
                    env,
                    &level.get(at).unwrap(),
                    &level.get(at + 1).unwrap(),
                ));
            } else {
                next.push_back(level.get(at).unwrap());
            }
            at += 2;
        }

        level = next;
    }

    (level.get(0).unwrap(), proofs)
}

/// Writes the ranking scenario as the shared fixture describes it.
fn symbol_text(env: &Env, symbol: &soroban_sdk::Symbol) -> StdString {
    use soroban_sdk::TryFromVal;

    let scval = soroban_sdk::xdr::ScVal::try_from_val(env, symbol).unwrap();
    match scval {
        soroban_sdk::xdr::ScVal::Symbol(text) => StdString::from_utf8(text.0.to_vec()).unwrap(),
        _ => unreachable!("a symbol converts to a symbol"),
    }
}

fn ranking_report(fixture: &crate::test::Fixture, teams: &[u32]) -> StdString {
    use std::fmt::Write;

    let mut out = StdString::new();
    let _ = writeln!(out, "top_weight={}", fixture.client.top_vote_weight());

    for &team in teams {
        let submission = fixture.client.submission(&team);
        let tally = fixture.client.score_tally(&team);
        let _ = writeln!(
            out,
            "project team={} track={} submitted_at={} valid={} score_count={} score_total={} weight={}",
            team,
            symbol_text(&fixture.env, &submission.track),
            submission.submitted_at,
            u32::from(submission.is_valid()),
            tally.count,
            tally.total,
            fixture.client.vote_weight(&team),
        );
    }

    for placement in fixture.client.ranking(&symbol_short!("payments")).iter() {
        let _ = writeln!(
            out,
            "placement rank={} team={} final_score={} judge_average={} community={} decided_by={}",
            placement.rank,
            placement.team,
            placement.final_score,
            placement.judge_average,
            placement.community,
            placement.decided_by as u32,
        );
    }

    out
}

/// One finished ranking, inputs and outcome together.
///
/// The SDK's central claim is that a participant can recompute the result from
/// public data rather than take the contract's word for it. That claim is only
/// worth anything if somebody checks, so the check is committed: everything the
/// ranking was derived from is written down beside what it derived, and both
/// languages are measured against the file rather than against each other.
#[test]
fn a_finished_ranking_matches_what_the_sdk_recomputes() {
    let (fixture, teams) = ranked_scenario();

    assert_eq!(
        ranking_report(&fixture, &teams).trim(),
        fixture!("ranking.txt")
    );
}
