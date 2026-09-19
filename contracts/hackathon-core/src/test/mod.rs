//! Tests that drive the contract through its generated client, the way a real
//! caller reaches it.
//!
//! These are kept apart from the unit tests beside each type. A unit test can
//! prove that a rule rejects the wrong input; only a test that registers the
//! contract can prove that the rule is actually reachable from outside, that
//! authorization is demanded, and that storage survives between calls. The
//! product's promises live at that level, so this is where they are checked.

mod setup;

use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env};

use crate::contract::{HackathonCore, HackathonCoreClient};
use crate::fixtures::sample_constitution;

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
}
