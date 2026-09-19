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
    canonical_constitution, canonical_scorecard, sample_metadata, CANONICAL_VOTER,
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
        hex(&ballot_leaf(&env, &voter, 2).to_array()),
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
    let ballot = ballot_leaf(&env, &voter, 2);

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
