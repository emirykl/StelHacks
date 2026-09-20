//! Tests that drive the contract through its generated client, the way a real
//! caller reaches it.
//!
//! These are kept apart from the unit tests beside each type. A unit test can
//! prove that a rule rejects the wrong input; only a test that registers the
//! contract can prove that the rule is actually reachable from outside, that
//! authorization is demanded, and that storage survives between calls. The
//! product's promises live at that level, so this is where they are checked.

mod adversarial;
mod community;
mod discretion;
mod funding;
mod interop;
mod judging;
mod lifecycle;
mod registration;
mod settlement;
mod setup;
mod sponsorship;
mod submission;

use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, BytesN, Env, Vec};

use crate::constitution::{Constitution, RegistrationPolicy};
use crate::contract::{HackathonCore, HackathonCoreClient};
use crate::fixtures::{sample_constitution, sample_constitution_paying};
use crate::merkle;

/// A registered contract with an organizer holding it, and authorization
/// mocked so a test can say what it is about rather than restating signatures.
pub struct Fixture {
    pub env: Env,
    pub client: HackathonCoreClient<'static>,
    pub organizer: Address,
}

impl Fixture {
    /// A contract that exists but holds no hackathon yet.
    pub fn empty() -> Fixture {
        let env = Env::default();
        env.mock_all_auths();

        let id = env.register(HackathonCore, ());
        let client = HackathonCoreClient::new(&env, &id);
        let organizer = Address::generate(&env);

        Fixture {
            env,
            client,
            organizer,
        }
    }

    /// A hackathon created and sitting in draft.
    pub fn created() -> Fixture {
        let fixture = Fixture::empty();
        let constitution = sample_constitution(&fixture.env);
        fixture.client.create(&fixture.organizer, &constitution);

        fixture
    }

    /// A hackathon whose rules are locked.
    pub fn locked() -> Fixture {
        let fixture = Fixture::created();
        fixture.client.lock_rules();

        fixture
    }

    /// A funded hackathon that has opened for applications.
    pub fn funded_and_open() -> Fixture {
        Fixture::funded_and_open_under(RegistrationPolicy::Reviewed)
    }

    /// The same, for a hackathon whose rules admit everybody on arrival.
    ///
    /// Taken as an argument rather than written as a second setup, because the
    /// two differ in one field and every other step of standing a hackathon up
    /// is the part a registration test is not about.
    pub fn funded_and_open_to_all() -> Fixture {
        Fixture::funded_and_open_under(RegistrationPolicy::Open)
    }

    fn funded_and_open_under(registration: RegistrationPolicy) -> Fixture {
        Fixture::funded_and_open_with(|constitution| constitution.registration = registration)
    }

    /// The same, with one edit made to the rules before they were locked.
    ///
    /// Taking a closure rather than growing an argument list per field. A test
    /// about sponsorship and a test about registration each need exactly one
    /// thing changed and everything else standing a hackathon up is the part
    /// neither of them is about.
    pub fn funded_and_open_with(edit: impl FnOnce(&mut Constitution)) -> Fixture {
        use prize_vault::{PrizeVault, PrizeVaultClient};
        use soroban_sdk::token::StellarAssetClient;

        let fixture = Fixture::locked_with_asset_with(edit);
        let asset = fixture.client.constitution().prize_asset;

        let vault_id = fixture.env.register(PrizeVault, ());
        let vault = PrizeVaultClient::new(&fixture.env, &vault_id);
        vault.create(&fixture.client.address, &asset);
        fixture.client.bind_vault(&vault.address);

        // Asked for rather than written out. The prize table adds up to ten
        // thousand and the pool has to cover the platform's cut on top of it,
        // so a literal here would be a second copy of arithmetic the
        // constitution already performs, and it would go stale the next time
        // either number moves.
        let sponsor = Address::generate(&fixture.env);
        let required = fixture.client.required_funding();
        StellarAssetClient::new(&fixture.env, &asset).mint(&sponsor, &required);
        vault.deposit(&sponsor, &required);

        fixture.client.publish();

        fixture
    }

    /// A locked hackathon whose prize asset is a token contract that exists, so
    /// a vault can be bound to it and money can actually move.
    pub fn locked_with_asset() -> Fixture {
        Fixture::locked_with_asset_with(|_| {})
    }

    fn locked_with_asset_with(edit: impl FnOnce(&mut Constitution)) -> Fixture {
        let fixture = Fixture::empty();

        let issuer = Address::generate(&fixture.env);
        let asset = fixture
            .env
            .register_stellar_asset_contract_v2(issuer)
            .address();

        let mut constitution = sample_constitution_paying(&fixture.env, asset);
        edit(&mut constitution);

        fixture.client.create(&fixture.organizer, &constitution);
        fixture.client.lock_rules();

        fixture
    }
}
/// A tree over any number of leaves, with a proof for each one.
///
/// A level with an odd count promotes its last node unchanged, which is what
/// the real collection service will do too: three judges scoring two projects
/// is six scorecards, and six is not a power of two.
pub fn build_tree(
    env: &soroban_sdk::Env,
    leaves: &Vec<BytesN<32>>,
) -> (BytesN<32>, Vec<Vec<BytesN<32>>>) {
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
