//! What the vault announces.
//!
//! The proof page shows a running total and every transaction that made it up,
//! so a sponsor can point at their own deposit and a participant can see the
//! prize existed before they started building. Both of those read from this
//! stream.

use soroban_sdk::{contractevent, Address, Env};

/// The vault exists and is bound to its hackathon.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Created {
    #[topic]
    pub core: Address,
    pub asset: Address,
}

/// Money arrived.
///
/// The depositor is a topic because a sponsor wants to point at their own
/// contribution, and the running balance travels along so a reader never has to
/// add the deposits up themselves to know where the pool stood.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deposited {
    #[topic]
    pub from: Address,
    pub amount: i128,
    pub balance: i128,
}

/// Money left, which can only ever happen against a finalized result.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Paid {
    #[topic]
    pub to: Address,
    pub amount: i128,
    pub balance: i128,
}

pub fn created(env: &Env, core: &Address, asset: &Address) {
    Created {
        core: core.clone(),
        asset: asset.clone(),
    }
    .publish(env);
}

pub fn deposited(env: &Env, from: &Address, amount: i128, balance: i128) {
    Deposited {
        from: from.clone(),
        amount,
        balance,
    }
    .publish(env);
}

pub fn paid(env: &Env, to: &Address, amount: i128, balance: i128) {
    Paid {
        to: to.clone(),
        amount,
        balance,
    }
    .publish(env);
}
