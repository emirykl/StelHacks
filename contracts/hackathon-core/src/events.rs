//! Everything the core contract announces.
//!
//! Events are not decoration here. The indexer rebuilds the entire application
//! state from this stream and from nothing else, which is what lets the product
//! claim that no backend decides anything. If a change to the hackathon does
//! not emit an event, it is a change the proof page cannot show, so every state
//! transition has one.
//!
//! Addresses are topics so a client can follow one participant without reading
//! the whole stream. Values that a reader needs but would never filter on, such
//! as a digest, travel in the payload.

use soroban_sdk::{contractevent, Address, BytesN, Env};

/// A hackathon exists and is open for configuration.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Created {
    #[topic]
    pub organizer: Address,
}

/// The draft rules were replaced.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Configured {
    #[topic]
    pub organizer: Address,
}

/// Someone gained or lost the right to review applications.
///
/// One event covers both directions, with the direction in the payload, so a
/// client following an address sees its whole history under a single name.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CollaboratorChanged {
    #[topic]
    pub collaborator: Address,
    pub added: bool,
}

/// The rules stopped being editable.
///
/// The digest travels along because this is the value every later reader
/// compares against, and an indexer holding this event never has to call the
/// contract to learn what was locked.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RulesLocked {
    pub constitution_hash: BytesN<32>,
}

/// The hackathon knows where its prize lives.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultBound {
    #[topic]
    pub vault: Address,
}

/// The prize is fully funded and the event is open.
///
/// This is the moment the status strip a participant reads turns green, so the
/// funded amount travels along and nobody has to cross reference two contracts
/// to know the prize was real before anyone started building.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Published {
    pub funded: i128,
    pub required: i128,
}

pub fn vault_bound(env: &Env, vault: &Address) {
    VaultBound {
        vault: vault.clone(),
    }
    .publish(env);
}

pub fn published(env: &Env, funded: i128, required: i128) {
    Published { funded, required }.publish(env);
}

pub fn hackathon_created(env: &Env, organizer: &Address) {
    Created {
        organizer: organizer.clone(),
    }
    .publish(env);
}

pub fn hackathon_configured(env: &Env, organizer: &Address) {
    Configured {
        organizer: organizer.clone(),
    }
    .publish(env);
}

pub fn collaborator_added(env: &Env, collaborator: &Address) {
    CollaboratorChanged {
        collaborator: collaborator.clone(),
        added: true,
    }
    .publish(env);
}

pub fn collaborator_removed(env: &Env, collaborator: &Address) {
    CollaboratorChanged {
        collaborator: collaborator.clone(),
        added: false,
    }
    .publish(env);
}

pub fn rules_locked(env: &Env, hash: &BytesN<32>) {
    RulesLocked {
        constitution_hash: hash.clone(),
    }
    .publish(env);
}
