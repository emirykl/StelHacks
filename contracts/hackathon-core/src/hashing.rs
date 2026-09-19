use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{Bytes, BytesN, Env};

use crate::constitution::Constitution;
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

fn digest(env: &Env, domain: &[u8], body: Bytes) -> BytesN<32> {
    let mut payload = Bytes::from_slice(env, domain);
    payload.append(&body);

    env.crypto().sha256(&payload).into()
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::constitution::Criterion;
    use crate::constitution::{
        Constitution, DiscretionPolicy, ExtensionPolicy, JudgeAssignment, JudgingMode, PrizeTier,
        ProjectVisibility, RefundRoute, Schedule, SettlementMode, TieBreakRule, Track, VotePolicy,
        CONSTITUTION_VERSION,
    };
    use crate::submission::SubmissionRequirements;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{symbol_short, vec, Address, String, Symbol, Vec};

    const HOUR: u64 = 60 * 60;
    const DAY: u64 = 24 * HOUR;

    fn criteria(env: &Env) -> Vec<Criterion> {
        vec![
            env,
            Criterion {
                id: symbol_short!("technical"),
                weight_bps: 6_000,
            },
            Criterion {
                id: symbol_short!("novelty"),
                weight_bps: 4_000,
            },
        ]
    }

    fn constitution(env: &Env) -> Constitution {
        let payments = symbol_short!("payments");

        Constitution {
            version: CONSTITUTION_VERSION,
            metadata_hash: BytesN::from_array(env, &[7u8; 32]),
            prize_asset: Address::generate(env),
            tracks: vec![
                env,
                Track {
                    id: payments.clone(),
                    criteria: criteria(env),
                    no_award_allowed: false,
                },
            ],
            judges: vec![
                env,
                JudgeAssignment {
                    judge: Address::generate(env),
                    tracks: vec![env, payments.clone()],
                },
            ],
            judge_quorum: 1,
            judging_mode: JudgingMode::Easy,
            vote: VotePolicy {
                judge_bps: 8_000,
                community_bps: 2_000,
            },
            visibility: ProjectVisibility::Public,
            submission_requirements: SubmissionRequirements::code_and_video(),
            prize_tiers: vec![
                env,
                PrizeTier {
                    track: payments,
                    rank: 1,
                    amount: 5_000,
                },
            ],
            tie_break: vec![env, TieBreakRule::SubmissionOrder],
            discretion: DiscretionPolicy {
                disqualification_threshold: 1,
                appeal_window: 48 * HOUR,
                settlement: SettlementMode::SafetyWindow(24 * HOUR),
                prize_claim_period: 90 * DAY,
                unclaimed_refund: RefundRoute::Organizer,
                no_award_refund: RefundRoute::Organizer,
                cancellation_threshold: 1,
                cancellation_refund: RefundRoute::Depositors,
            },
            schedule: Schedule {
                registration_opens_at: 1_000 * DAY,
                registration_closes_at: 1_007 * DAY,
                submission_opens_at: 1_000 * DAY,
                submission_closes_at: 1_009 * DAY,
                screening_closes_at: 1_010 * DAY,
                judging_closes_at: 1_012 * DAY,
                community_vote_opens_at: 1_010 * DAY + 2 * HOUR,
                community_vote_closes_at: 1_011 * DAY,
            },
            extensions: ExtensionPolicy {
                max_extensions_per_deadline: 2,
                max_total_seconds_per_deadline: 2 * DAY,
            },
        }
    }

    fn metadata(env: &Env, track: Symbol) -> SubmissionMetadata {
        SubmissionMetadata {
            name: String::from_str(env, "Lumen Split"),
            summary: String::from_str(env, "Shared expenses settled in USDC"),
            description: String::from_str(env, "A longer write up of the project."),
            logo_uri: String::from_str(env, "https://cdn.example.com/lumen-split.png"),
            repository_url: String::from_str(env, "https://github.com/example/lumen-split"),
            demo_video_url: String::from_str(env, "https://youtu.be/example"),
            live_url: String::from_str(env, "https://lumen-split.example.com"),
            track,
        }
    }

    #[test]
    fn the_same_constitution_always_hashes_the_same() {
        let env = Env::default();
        let constitution = constitution(&env);

        let first = hash_constitution(&env, &constitution);
        let second = hash_constitution(&env, &constitution.clone());

        assert_eq!(first, second);
    }

    #[test]
    fn the_same_submission_always_hashes_the_same() {
        let env = Env::default();
        let metadata = metadata(&env, symbol_short!("payments"));

        assert_eq!(
            hash_submission_metadata(&env, &metadata),
            hash_submission_metadata(&env, &metadata.clone())
        );
    }

    #[test]
    fn a_constitution_and_a_submission_never_share_a_digest() {
        let env = Env::default();
        let constitution = constitution(&env);
        let metadata = metadata(&env, symbol_short!("payments"));

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
        let base = constitution(&env);
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
        changed.tie_break = vec![
            &env,
            TieBreakRule::JudgeScore,
            TieBreakRule::SubmissionOrder,
        ];
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
        let base = metadata(&env, symbol_short!("payments"));
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
        let mut first = metadata(&env, symbol_short!("payments"));
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
