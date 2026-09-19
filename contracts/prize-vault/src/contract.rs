use soroban_sdk::{contract, contractimpl, token, Address, Env};

use crate::errors::Error;
use crate::events;
use crate::storage;

/// Custody of the prize pool for a single hackathon.
///
/// The vault accepts deposits from anyone at any point in the event, and pays
/// out only when the hackathon it is bound to tells it to. There is no
/// administrator, no upgrade path and no withdrawal function; the paired
/// hackathon contract is the only address that can move money out, and that
/// contract only asks after a result is final.
///
/// The binding is set once at creation and never again. A vault whose
/// hackathon could be changed later would be a vault whose deposits mean
/// nothing, because the money could be redirected after it arrived.
#[contract]
pub struct PrizeVault;

#[contractimpl]
impl PrizeVault {
    /// Binds a new vault to one hackathon and one asset.
    pub fn create(env: Env, core: Address, asset: Address) -> Result<(), Error> {
        if storage::is_initialized(&env) {
            return Err(Error::AlreadyInitialized);
        }

        storage::save_binding(&env, &core, &asset);
        events::created(&env, &core, &asset);

        Ok(())
    }

    /// Adds to the prize pool.
    ///
    /// Open to anyone at any phase, and deliberately so. A sponsor arriving on
    /// the last day, or a third party topping up a pool they liked the look of,
    /// harms nobody: the prize only ever grows, and the page shows where the
    /// growth came from.
    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::AmountNotPositive);
        }

        from.require_auth();

        let asset = storage::load_asset(&env)?;
        token::Client::new(&env, &asset).transfer(&from, env.current_contract_address(), &amount);

        events::deposited(&env, &from, amount, Self::balance(env.clone()));

        Ok(())
    }

    /// Sends part of the pool to a winner.
    ///
    /// The single line that matters is the authorization check: only the
    /// hackathon this vault was bound to can call this. That contract computes
    /// the ranking itself and refuses to accept one from anywhere else, so the
    /// path from a scorecard to a payment never leaves the chain.
    pub fn pay(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::AmountNotPositive);
        }

        let core = storage::load_core(&env)?;
        core.require_auth();

        let balance = Self::balance(env.clone());
        if amount > balance {
            return Err(Error::InsufficientBalance);
        }

        let asset = storage::load_asset(&env)?;
        token::Client::new(&env, &asset).transfer(&env.current_contract_address(), &to, &amount);

        events::paid(&env, &to, amount, Self::balance(env.clone()));

        Ok(())
    }

    /// What the pool holds right now.
    ///
    /// Read from the token rather than from a counter this contract keeps, so
    /// the number can never drift from the truth. It also means a direct
    /// transfer to this address, made without calling `deposit`, still counts
    /// toward the prize.
    pub fn balance(env: Env) -> i128 {
        match storage::load_asset(&env) {
            Ok(asset) => token::Client::new(&env, &asset).balance(&env.current_contract_address()),
            Err(_) => 0,
        }
    }

    /// The hackathon this vault pays for.
    pub fn core(env: Env) -> Result<Address, Error> {
        storage::load_core(&env)
    }

    /// The token the prize is denominated in.
    pub fn asset(env: Env) -> Result<Address, Error> {
        storage::load_asset(&env)
    }
}
