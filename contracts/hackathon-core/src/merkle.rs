use soroban_sdk::{Bytes, BytesN, Env, Vec};

/// Tags that keep a leaf and an inner node from ever hashing the same way.
//
// Without them the tree has a known forgery: an attacker who can choose data
// shaped like a pair of digests can present an inner node as though it were a
// leaf, and prove membership of something that was never submitted. One byte
// in front of the payload closes it, and it is the reason these two constants
// exist rather than a plain concatenation.
const LEAF_TAG: u8 = 0x00;
const NODE_TAG: u8 = 0x01;

/// The digest of a leaf.
//
// Callers pass the already serialized payload, so the tree stays indifferent
// to what it is carrying: a scorecard in one place, a ballot in another, each
// with its own domain tag applied before it gets here.
pub fn leaf(env: &Env, payload: &Bytes) -> BytesN<32> {
    let mut tagged = Bytes::from_array(env, &[LEAF_TAG]);
    tagged.append(payload);

    env.crypto().sha256(&tagged).into()
}

/// The digest of two children.
//
// The pair is sorted before hashing, which means a proof carries only the
// sibling digests and no direction bits. That keeps the proof half the size
// and, more usefully, removes a whole class of client bug where the two sides
// disagree about which way to walk the tree.
pub fn node(env: &Env, a: &BytesN<32>, b: &BytesN<32>) -> BytesN<32> {
    let (first, second) = if a.to_array() <= b.to_array() {
        (a, b)
    } else {
        (b, a)
    };

    let mut payload = Bytes::from_array(env, &[NODE_TAG]);
    payload.extend_from_array(&first.to_array());
    payload.extend_from_array(&second.to_array());

    env.crypto().sha256(&payload).into()
}

/// Whether `leaf` sits under `root`, given the sibling digests along the way.
//
// This is what a judge uses to check their own scorecard was counted, and what
// a voter uses to check their ballot was. The collection service can hand over
// a root that leaves someone out, but it cannot hand over a proof for a leaf
// it excluded, so the omission is detectable by exactly the person it harmed.
pub fn verify(env: &Env, root: &BytesN<32>, leaf: &BytesN<32>, proof: &Vec<BytesN<32>>) -> bool {
    let mut computed = leaf.clone();

    for sibling in proof.iter() {
        computed = node(env, &computed, &sibling);
    }

    &computed == root
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::vec;

    fn payload(env: &Env, byte: u8) -> Bytes {
        Bytes::from_array(env, &[byte; 8])
    }

    /// Four leaves, distinct by construction.
    fn leaves(env: &Env) -> Vec<BytesN<32>> {
        let mut leaves = Vec::new(env);
        for byte in 1u8..=4 {
            leaves.push_back(leaf(env, &payload(env, byte)));
        }

        leaves
    }

    /// Builds the tree over a power of two set of leaves and returns its root
    /// with a proof for the leaf at `index`.
    fn tree(env: &Env, leaves: &Vec<BytesN<32>>, index: u32) -> (BytesN<32>, Vec<BytesN<32>>) {
        let mut level = leaves.clone();
        let mut position = index;
        let mut proof = Vec::new(env);

        while level.len() > 1 {
            let sibling = if position.is_multiple_of(2) {
                position + 1
            } else {
                position - 1
            };
            proof.push_back(level.get(sibling).unwrap());

            let mut next = Vec::new(env);
            let mut at = 0;
            while at < level.len() {
                next.push_back(node(
                    env,
                    &level.get(at).unwrap(),
                    &level.get(at + 1).unwrap(),
                ));
                at += 2;
            }

            level = next;
            position /= 2;
        }

        (level.get(0).unwrap(), proof)
    }

    #[test]
    fn a_lone_leaf_is_its_own_root() {
        let env = Env::default();
        let only = leaf(&env, &payload(&env, 1));

        assert!(verify(&env, &only, &only, &Vec::new(&env)));
    }

    #[test]
    fn a_leaf_verifies_against_the_tree_it_sits_in() {
        let env = Env::default();
        let leaves = leaves(&env);

        for index in 0..leaves.len() {
            let (root, proof) = tree(&env, &leaves, index);

            assert!(
                verify(&env, &root, &leaves.get(index).unwrap(), &proof),
                "every leaf must verify against its own tree"
            );
        }
    }

    #[test]
    fn a_leaf_that_was_never_submitted_does_not_verify() {
        let env = Env::default();
        let leaves = leaves(&env);
        let (root, proof) = tree(&env, &leaves, 0);

        let stranger = leaf(&env, &payload(&env, 99));

        assert!(!verify(&env, &root, &stranger, &proof));
    }

    #[test]
    fn a_proof_from_the_wrong_position_does_not_verify() {
        let env = Env::default();
        let leaves = leaves(&env);
        let (root, proof_for_first) = tree(&env, &leaves, 0);

        assert!(!verify(
            &env,
            &root,
            &leaves.get(2).unwrap(),
            &proof_for_first
        ));
    }

    #[test]
    fn a_truncated_proof_does_not_verify() {
        let env = Env::default();
        let leaves = leaves(&env);
        let (root, proof) = tree(&env, &leaves, 0);

        let short = vec![&env, proof.get(0).unwrap()];

        assert!(!verify(&env, &root, &leaves.get(0).unwrap(), &short));
    }

    /// The forgery the domain tags exist to stop. An inner node is a real
    /// digest sitting in the tree, so without separate tags it could be fed
    /// back through the leaf function and made to prove membership of
    /// something nobody ever submitted.
    #[test]
    fn an_inner_node_cannot_be_passed_off_as_a_leaf() {
        let env = Env::default();
        let leaves = leaves(&env);
        let (root, _) = tree(&env, &leaves, 0);

        let inner = node(&env, &leaves.get(0).unwrap(), &leaves.get(1).unwrap());
        let sibling = node(&env, &leaves.get(2).unwrap(), &leaves.get(3).unwrap());
        let proof = vec![&env, sibling];

        // As an inner node it verifies, which is simply how the tree works.
        assert!(verify(&env, &root, &inner, &proof));

        // Re-deriving it through the leaf function is the shape an attacker
        // controls, and that must not reach the same digest.
        let forged = leaf(&env, &Bytes::from_array(&env, &inner.to_array()));
        assert!(!verify(&env, &root, &forged, &proof));
    }

    #[test]
    fn hashing_a_pair_ignores_the_order_it_arrives_in() {
        let env = Env::default();
        let a = leaf(&env, &payload(&env, 1));
        let b = leaf(&env, &payload(&env, 2));

        assert_eq!(node(&env, &a, &b), node(&env, &b, &a));
    }

    #[test]
    fn two_different_payloads_never_share_a_leaf_digest() {
        let env = Env::default();

        assert_ne!(leaf(&env, &payload(&env, 1)), leaf(&env, &payload(&env, 2)));
    }
}
