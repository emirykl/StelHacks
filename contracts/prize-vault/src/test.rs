use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::{StellarAssetClient, TokenClient};
use soroban_sdk::{Address, Env};

use crate::contract::{PrizeVault, PrizeVaultClient};
use crate::errors::Error;

struct Fixture {
    env: Env,
    vault: PrizeVaultClient<'static>,
    token: TokenClient<'static>,
    mint: StellarAssetClient<'static>,
    core: Address,
    sponsor: Address,
}

impl Fixture {
    fn new() -> Fixture {
        let env = Env::default();
        env.mock_all_auths();

        let issuer = Address::generate(&env);
        let asset = env.register_stellar_asset_contract_v2(issuer);
        let token = TokenClient::new(&env, &asset.address());
        let mint = StellarAssetClient::new(&env, &asset.address());

        // The hackathon is stood in for by a plain address here. What matters
        // to the vault is which address it obeys, not what that address runs.
        let core = Address::generate(&env);

        let vault_id = env.register(PrizeVault, ());
        let vault = PrizeVaultClient::new(&env, &vault_id);
        vault.create(&core, &asset.address());

        let sponsor = Address::generate(&env);
        mint.mint(&sponsor, &1_000_000);

        Fixture {
            env,
            vault,
            token,
            mint,
            core,
            sponsor,
        }
    }

    fn funded(amount: i128) -> Fixture {
        let fixture = Fixture::new();
        fixture.vault.deposit(&fixture.sponsor, &amount);

        fixture
    }
}

#[test]
fn a_new_vault_is_empty_and_knows_what_it_serves() {
    let fixture = Fixture::new();

    assert_eq!(fixture.vault.balance(), 0);
    assert_eq!(fixture.vault.core(), fixture.core);
    assert_eq!(fixture.vault.asset(), fixture.token.address);
}

#[test]
fn a_vault_cannot_be_rebound_to_another_hackathon() {
    let fixture = Fixture::new();
    let other = Address::generate(&fixture.env);

    assert_eq!(
        fixture
            .vault
            .try_create(&other, &fixture.token.address)
            .err(),
        Some(Ok(Error::AlreadyInitialized))
    );
    assert_eq!(fixture.vault.core(), fixture.core);
}

#[test]
fn a_deposit_moves_the_money_and_raises_the_pool() {
    let fixture = Fixture::new();

    fixture.vault.deposit(&fixture.sponsor, &10_000);

    assert_eq!(fixture.vault.balance(), 10_000);
    assert_eq!(fixture.token.balance(&fixture.sponsor), 990_000);
}

/// Anyone may add to the pool, and the prize only ever grows. A late sponsor
/// harms nobody, so nothing about the phase or the caller is checked.
#[test]
fn anyone_can_top_the_pool_up() {
    let fixture = Fixture::funded(10_000);

    let latecomer = Address::generate(&fixture.env);
    fixture.mint.mint(&latecomer, &5_000);
    fixture.vault.deposit(&latecomer, &5_000);

    assert_eq!(fixture.vault.balance(), 15_000);
}

#[test]
fn a_deposit_of_nothing_is_refused() {
    let fixture = Fixture::new();

    assert_eq!(
        fixture.vault.try_deposit(&fixture.sponsor, &0).err(),
        Some(Ok(Error::AmountNotPositive))
    );
    assert_eq!(
        fixture.vault.try_deposit(&fixture.sponsor, &-1).err(),
        Some(Ok(Error::AmountNotPositive))
    );
}

#[test]
fn the_hackathon_can_pay_a_winner() {
    let fixture = Fixture::funded(10_000);
    let winner = Address::generate(&fixture.env);

    fixture.vault.pay(&winner, &5_000);

    assert_eq!(fixture.token.balance(&winner), 5_000);
    assert_eq!(fixture.vault.balance(), 5_000);
}

#[test]
fn the_vault_cannot_pay_more_than_it_holds() {
    let fixture = Fixture::funded(10_000);
    let winner = Address::generate(&fixture.env);

    assert_eq!(
        fixture.vault.try_pay(&winner, &10_001).err(),
        Some(Ok(Error::InsufficientBalance))
    );
    assert_eq!(fixture.vault.balance(), 10_000);
}

/// The guarantee the whole product rests on: no key moves this money.
///
/// Every other test in this file runs with authorization mocked, which is right
/// for testing behaviour but would hide exactly this. Here the mock is dropped,
/// so `pay` faces the authorization check a real caller would, and the call
/// dies rather than paying anyone.
#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_but_the_bound_hackathon_can_move_money_out() {
    let fixture = Fixture::funded(10_000);
    let thief = Address::generate(&fixture.env);

    fixture.env.set_auths(&[]);
    fixture.vault.pay(&thief, &10_000);
}

/// The same check from the other side: with no authorization at all, even a
/// call naming the real hackathon as the recipient fails.
#[test]
#[should_panic(expected = "Unauthorized")]
fn an_unauthorized_payment_fails_even_when_it_names_the_hackathon() {
    let fixture = Fixture::funded(10_000);
    let core = fixture.core.clone();

    fixture.env.set_auths(&[]);
    fixture.vault.pay(&core, &10_000);
}

/// The balance is read from the token rather than from a counter the vault
/// keeps, so a transfer made straight to this address still counts toward the
/// prize instead of sitting there invisible.
#[test]
fn money_sent_directly_still_counts_toward_the_prize() {
    let fixture = Fixture::funded(10_000);

    fixture.mint.mint(&fixture.vault.address, &2_500);

    assert_eq!(fixture.vault.balance(), 12_500);
}
