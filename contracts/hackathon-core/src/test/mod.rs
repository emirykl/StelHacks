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
mod submission;

use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env};

use crate::constitution::RegistrationPolicy;
use crate::contract::{HackathonCore, HackathonCoreClient};
use crate::fixtures::{sample_constitution, sample_constitution_paying};

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
        use prize_vault::{PrizeVault, PrizeVaultClient};
        use soroban_sdk::token::StellarAssetClient;

        let fixture = Fixture::locked_with_asset_under(registration);
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
        Fixture::locked_with_asset_under(RegistrationPolicy::Reviewed)
    }

    fn locked_with_asset_under(registration: RegistrationPolicy) -> Fixture {
        let fixture = Fixture::empty();

        let issuer = Address::generate(&fixture.env);
        let asset = fixture
            .env
            .register_stellar_asset_contract_v2(issuer)
            .address();

        let mut constitution = sample_constitution_paying(&fixture.env, asset);
        constitution.registration = registration;

        fixture.client.create(&fixture.organizer, &constitution);
        fixture.client.lock_rules();

        fixture
    }
}
