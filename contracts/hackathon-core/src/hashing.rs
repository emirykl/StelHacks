use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{Address, Bytes, BytesN, Env};

use crate::constitution::Constitution;
use crate::merkle;
use crate::scorecard::Scorecard;
use crate::submission::SubmissionMetadata;

/// Domain separators.
///
/// Every digest in this system is taken over a tagged payload, so a value that
/// happens to serialize identically in two different roles can never produce
/// the same digest. Without this, a carefully shaped submission could in
/// principle carry the digest of a constitution, and a client comparing hashes
/// would have no way to tell which one it was looking at.
const CONSTITUTION_DOMAIN: &[u8] = b"stelhacks.v1.constitution";
const SUBMISSION_DOMAIN: &[u8] = b"stelhacks.v1.submission";
const SCORECARD_DOMAIN: &[u8] = b"stelhacks.v1.scorecard";
const BALLOT_DOMAIN: &[u8] = b"stelhacks.v1.ballot";

/// The digest that locks the rules of a hackathon.
///
/// The payload is the domain tag followed by the XDR encoding of the
/// constitution. XDR is used rather than a hand rolled byte layout because it
/// is canonical, it already covers every nested type, and both the contract and
/// a JavaScript client reach it through the same specification rather than
/// through two hand written serializers that will eventually disagree.
///
/// A participant can rebuild the constitution from the public page, encode it,
/// hash it, and compare against the value stored on chain. If the two differ,
/// the competition being run is not the one that was announced.
pub fn hash_constitution(env: &Env, constitution: &Constitution) -> BytesN<32> {
    digest(env, CONSTITUTION_DOMAIN, constitution.clone().to_xdr(env))
}

/// The digest that pins a project at the submission deadline.
///
/// Only this value goes on chain. The description, the links and the logo stay
/// off chain, and anyone can fetch them later, hash them the same way, and see
/// that the project a judge scored is the project that was submitted.
pub fn hash_submission_metadata(env: &Env, metadata: &SubmissionMetadata) -> BytesN<32> {
    digest(env, SUBMISSION_DOMAIN, metadata.clone().to_xdr(env))
}

/// The leaf a scorecard occupies in the sealed tree.
///
/// The judge's address is part of the payload, so one judge cannot have their
/// scorecard counted as another's, and the team is part of it so a scorecard
/// cannot be moved between projects after the fact.
pub fn scorecard_leaf(env: &Env, scorecard: &Scorecard) -> BytesN<32> {
    merkle::leaf(
        env,
        &tagged(env, SCORECARD_DOMAIN, scorecard.clone().to_xdr(env)),
    )
}

/// The leaf a community ballot occupies.
///
/// A ballot is only ever a voter and the project they chose, so the payload is
/// exactly that pair. Nothing about the voter's identity is hidden here: the
/// tally is sealed until the reveal, and after it every ballot is open for
/// anyone to recount.
pub fn ballot_leaf(env: &Env, voter: &Address, team: u32) -> BytesN<32> {
    let mut payload = Bytes::from_slice(env, BALLOT_DOMAIN);
    payload.append(&voter.clone().to_xdr(env));
    payload.extend_from_array(&team.to_be_bytes());

    merkle::leaf(env, &payload)
}

fn tagged(env: &Env, domain: &[u8], body: Bytes) -> Bytes {
    let mut payload = Bytes::from_slice(env, domain);
    payload.append(&body);

    payload
}

fn digest(env: &Env, domain: &[u8], body: Bytes) -> BytesN<32> {
    let mut payload = Bytes::from_slice(env, domain);
    payload.append(&body);

    env.crypto().sha256(&payload).into()
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::constitution::{
        JudgingMode, ProjectVisibility, TieBreakRule, VotePolicy, CONSTITUTION_VERSION,
    };
    use crate::fixtures::{sample_constitution, sample_metadata, HOUR};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{symbol_short, vec, Address, String};

    #[test]
    fn the_same_constitution_always_hashes_the_same() {
        let env = Env::default();
        let constitution = sample_constitution(&env);

        let first = hash_constitution(&env, &constitution);
        let second = hash_constitution(&env, &constitution.clone());

        assert_eq!(first, second);
    }

    #[test]
    fn the_same_submission_always_hashes_the_same() {
        let env = Env::default();
        let metadata = sample_metadata(&env, symbol_short!("payments"));

        assert_eq!(
            hash_submission_metadata(&env, &metadata),
            hash_submission_metadata(&env, &metadata.clone())
        );
    }

    #[test]
    fn a_constitution_and_a_submission_never_share_a_digest() {
        let env = Env::default();
        let constitution = sample_constitution(&env);
        let metadata = sample_metadata(&env, symbol_short!("payments"));

        assert_ne!(
            hash_constitution(&env, &constitution).to_array(),
            hash_submission_metadata(&env, &metadata).to_array()
        );
    }

    /// The test that earns its keep. Every field of the constitution decides
    /// something, so every field has to move the digest. A field that does not
    /// is a field an organizer could quietly change after the lock while the
    /// published hash still matched.
    #[test]
    fn every_field_of_the_constitution_moves_the_digest() {
        let env = Env::default();
        let base = sample_constitution(&env);
        let original = hash_constitution(&env, &base);

        let mut changed = base.clone();
        changed.version = CONSTITUTION_VERSION + 1;
        assert_ne!(hash_constitution(&env, &changed), original, "version");

        let mut changed = base.clone();
        changed.metadata_hash = BytesN::from_array(&env, &[9u8; 32]);
        assert_ne!(hash_constitution(&env, &changed), original, "metadata_hash");

        let mut changed = base.clone();
        changed.prize_asset = Address::generate(&env);
        assert_ne!(hash_constitution(&env, &changed), original, "prize_asset");

        let mut changed = base.clone();
        let mut track = changed.tracks.get(0).unwrap();
        track.no_award_allowed = true;
        changed.tracks.set(0, track);
        assert_ne!(hash_constitution(&env, &changed), original, "tracks");

        let mut changed = base.clone();
        let mut assignment = changed.judges.get(0).unwrap();
        assignment.judge = Address::generate(&env);
        changed.judges.set(0, assignment);
        assert_ne!(hash_constitution(&env, &changed), original, "judges");

        let mut changed = base.clone();
        changed.judge_quorum = 2;
        assert_ne!(hash_constitution(&env, &changed), original, "judge_quorum");

        let mut changed = base.clone();
        changed.judging_mode = JudgingMode::Strict;
        assert_ne!(hash_constitution(&env, &changed), original, "judging_mode");

        let mut changed = base.clone();
        changed.vote = VotePolicy::judges_only();
        assert_ne!(hash_constitution(&env, &changed), original, "vote");

        let mut changed = base.clone();
        changed.visibility = ProjectVisibility::Participants;
        assert_ne!(hash_constitution(&env, &changed), original, "visibility");

        let mut changed = base.clone();
        changed.submission_requirements.live_url_required = true;
        assert_ne!(
            hash_constitution(&env, &changed),
            original,
            "submission_requirements"
        );

        let mut changed = base.clone();
        let mut tier = changed.prize_tiers.get(0).unwrap();
        tier.amount = 6_000;
        changed.prize_tiers.set(0, tier);
        assert_ne!(hash_constitution(&env, &changed), original, "prize_tiers");

        let mut changed = base.clone();
        changed.tie_break = vec![&env, TieBreakRule::SubmissionOrder];
        assert_ne!(hash_constitution(&env, &changed), original, "tie_break");

        let mut changed = base.clone();
        changed.discretion.appeal_window = 24 * HOUR;
        assert_ne!(hash_constitution(&env, &changed), original, "discretion");

        let mut changed = base.clone();
        changed.schedule.submission_closes_at += HOUR;
        assert_ne!(hash_constitution(&env, &changed), original, "schedule");

        let mut changed = base;
        changed.extensions.max_extensions_per_deadline = 3;
        assert_ne!(hash_constitution(&env, &changed), original, "extensions");
    }

    /// The same guarantee for a submission. A team that could edit a repository
    /// link without moving the digest would be pinning nothing.
    #[test]
    fn every_field_of_a_submission_moves_the_digest() {
        let env = Env::default();
        let base = sample_metadata(&env, symbol_short!("payments"));
        let original = hash_submission_metadata(&env, &base);

        let mut changed = base.clone();
        changed.name = String::from_str(&env, "Lumen Split v2");
        assert_ne!(hash_submission_metadata(&env, &changed), original, "name");

        let mut changed = base.clone();
        changed.summary = String::from_str(&env, "Something else");
        assert_ne!(
            hash_submission_metadata(&env, &changed),
            original,
            "summary"
        );

        let mut changed = base.clone();
        changed.description = String::from_str(&env, "Rewritten after the deadline");
        assert_ne!(
            hash_submission_metadata(&env, &changed),
            original,
            "description"
        );

        let mut changed = base.clone();
        changed.logo_uri = String::from_str(&env, "https://cdn.example.com/other.png");
        assert_ne!(
            hash_submission_metadata(&env, &changed),
            original,
            "logo_uri"
        );

        let mut changed = base.clone();
        changed.repository_url = String::from_str(&env, "https://github.com/example/other");
        assert_ne!(
            hash_submission_metadata(&env, &changed),
            original,
            "repository_url"
        );

        let mut changed = base.clone();
        changed.demo_video_url = String::from_str(&env, "https://youtu.be/other");
        assert_ne!(
            hash_submission_metadata(&env, &changed),
            original,
            "demo_video_url"
        );

        let mut changed = base.clone();
        changed.live_url = String::from_str(&env, "https://other.example.com");
        assert_ne!(
            hash_submission_metadata(&env, &changed),
            original,
            "live_url"
        );

        let mut changed = base;
        changed.track = symbol_short!("defi");
        assert_ne!(hash_submission_metadata(&env, &changed), original, "track");
    }

    /// Two submissions differing only by which field holds a value must not
    /// collide, which is what catches a serializer that concatenates fields
    /// without recording where each one ends.
    #[test]
    fn moving_a_value_between_fields_changes_the_digest() {
        let env = Env::default();
        let mut first = sample_metadata(&env, symbol_short!("payments"));
        first.summary = String::from_str(&env, "ab");
        first.description = String::from_str(&env, "c");

        let mut second = first.clone();
        second.summary = String::from_str(&env, "a");
        second.description = String::from_str(&env, "bc");

        assert_ne!(
            hash_submission_metadata(&env, &first),
            hash_submission_metadata(&env, &second)
        );
    }
}
