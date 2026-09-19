//! The funding gate, with a real vault on the other side of it.
//!
//! These tests register both contracts and let them call each other, because
//! the guarantee under test spans the pair: the hackathon refuses to open
//! until the vault it is bound to actually holds the prize, and it is the vault
//! that answers when asked.

use soroban_sdk::testutils::Address as _;
use soroban_sdk::Address;

use crate::errors::Error;
use crate::phase::Phase;
use crate::test::Fixture;

use prize_vault::{PrizeVault, PrizeVaultClient};
use soroban_sdk::token::StellarAssetClient;

/// A locked hackathon, a vault bound to it, and a sponsor holding money.
struct Funded {
    core: Fixture,
    vault: PrizeVaultClient<'static>,
    mint: StellarAssetClient<'static>,
    sponsor: Address,
}

impl Funded {
    /// Locked rules, a bound vault, nothing deposited yet.
    fn bound() -> Funded {
        let core = Fixture::locked_with_asset();
        let env = core.env.clone();

        let asset = core.client.constitution().prize_asset;
        let mint = StellarAssetClient::new(&env, &asset);

        let vault_id = env.register(PrizeVault, ());
        let vault = PrizeVaultClient::new(&env, &vault_id);
        vault.create(&core.client.address, &asset);

        core.client.bind_vault(&vault.address);

        let sponsor = Address::generate(&env);
        mint.mint(&sponsor, &1_000_000);

        Funded {
            core,
            vault,
            mint,
            sponsor,
        }
    }

    fn deposit(&self, amount: i128) {
        self.vault.deposit(&self.sponsor, &amount);
    }
}

#[test]
fn a_locked_hackathon_waits_in_funding_with_no_vault() {
    let fixture = Fixture::locked_with_asset();

    assert_eq!(fixture.client.phase(), Phase::Funding);
    assert_eq!(
        fixture.client.try_vault().err(),
        Some(Ok(Error::VaultNotBound))
    );
}

#[test]
fn binding_a_vault_records_it_and_reports_an_empty_pool() {
    let fixture = Funded::bound();

    assert_eq!(fixture.core.client.vault(), fixture.vault.address);
    assert_eq!(fixture.core.client.funding(), 0);
    assert_eq!(fixture.core.client.required_funding(), 10_000);
    assert!(!fixture.core.client.is_fully_funded());
}

/// The binding is checked from both sides, so an organizer cannot point their
/// hackathon at a pool that answers to somebody else.
#[test]
fn a_vault_serving_another_hackathon_is_refused() {
    let fixture = Fixture::locked_with_asset();
    let asset = fixture.client.constitution().prize_asset;

    let stranger = Address::generate(&fixture.env);
    let vault_id = fixture.env.register(PrizeVault, ());
    let vault = PrizeVaultClient::new(&fixture.env, &vault_id);
    vault.create(&stranger, &asset);

    assert_eq!(
        fixture.client.try_bind_vault(&vault.address).err(),
        Some(Ok(Error::VaultRejected))
    );
}

/// A vault holding a different token would let a hackathon advertise a prize in
/// one currency and hold another.
#[test]
fn a_vault_holding_the_wrong_asset_is_refused() {
    let fixture = Fixture::locked_with_asset();

    let other_issuer = Address::generate(&fixture.env);
    let other_asset = fixture
        .env
        .register_stellar_asset_contract_v2(other_issuer)
        .address();

    let vault_id = fixture.env.register(PrizeVault, ());
    let vault = PrizeVaultClient::new(&fixture.env, &vault_id);
    vault.create(&fixture.client.address, &other_asset);

    assert_eq!(
        fixture.client.try_bind_vault(&vault.address).err(),
        Some(Ok(Error::VaultRejected))
    );
}

#[test]
fn a_vault_cannot_be_swapped_once_bound() {
    let fixture = Funded::bound();
    let asset = fixture.core.client.constitution().prize_asset;

    let second_id = fixture.core.env.register(PrizeVault, ());
    let second = PrizeVaultClient::new(&fixture.core.env, &second_id);
    second.create(&fixture.core.client.address, &asset);

    assert_eq!(
        fixture.core.client.try_bind_vault(&second.address).err(),
        Some(Ok(Error::VaultAlreadyBound))
    );
    assert_eq!(fixture.core.client.vault(), fixture.vault.address);
}

/// The first problem the product set out to remove: a hackathon that advertises
/// a prize it does not hold.
#[test]
fn an_underfunded_hackathon_cannot_open() {
    let fixture = Funded::bound();
    fixture.deposit(9_999);

    assert_eq!(
        fixture.core.client.try_publish().err(),
        Some(Ok(Error::VaultUnderfunded))
    );
    assert_eq!(fixture.core.client.phase(), Phase::Funding);
}

#[test]
fn a_fully_funded_hackathon_opens() {
    let fixture = Funded::bound();
    fixture.deposit(10_000);

    assert!(fixture.core.client.is_fully_funded());
    fixture.core.client.publish();

    assert_eq!(fixture.core.client.phase(), Phase::Open);
}

/// Publishing is not the organizer's privilege. Once the prize is covered,
/// letting them sit on a funded hackathon would put the participants back in
/// the position of waiting on somebody's goodwill.
///
/// Authorization is dropped entirely for this call, so the test would fail if
/// `publish` demanded a signature from anyone.
#[test]
fn opening_a_funded_hackathon_needs_no_signature_from_anyone() {
    let fixture = Funded::bound();
    fixture.deposit(10_000);

    fixture.core.env.set_auths(&[]);
    fixture.core.client.publish();

    assert_eq!(fixture.core.client.phase(), Phase::Open);
}

#[test]
fn a_hackathon_cannot_open_twice() {
    let fixture = Funded::bound();
    fixture.deposit(10_000);
    fixture.core.client.publish();

    assert_eq!(
        fixture.core.client.try_publish().err(),
        Some(Ok(Error::WrongPhase))
    );
}

/// Sponsors arriving after the event opened only ever make the pool bigger, so
/// nothing stops them.
#[test]
fn the_pool_keeps_growing_after_the_hackathon_opens() {
    let fixture = Funded::bound();
    fixture.deposit(10_000);
    fixture.core.client.publish();

    let sponsor = Address::generate(&fixture.core.env);
    fixture.mint.mint(&sponsor, &5_000);
    fixture.vault.deposit(&sponsor, &5_000);

    assert_eq!(fixture.core.client.funding(), 15_000);
}

/// A vault can only be bound while the hackathon is waiting for its prize.
#[test]
fn a_vault_cannot_be_bound_before_the_rules_are_locked() {
    let fixture = Fixture::created();
    let vault_id = fixture.env.register(PrizeVault, ());

    assert_eq!(
        fixture.client.try_bind_vault(&vault_id).err(),
        Some(Ok(Error::WrongPhase))
    );
}
