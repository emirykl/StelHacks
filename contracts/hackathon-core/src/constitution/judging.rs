use soroban_sdk::{contracttype, Address};

/// How judges seal their scorecards until the reveal.
///
/// The easy mode carries the address that will seal them, because that address
/// is the one piece of trust this design does not remove and hiding it would be
/// dishonest. A participant reading the rules sees exactly who collects the
/// scorecards and publishes their root, and knows that if that party leaves one
/// out, the judge it belonged to can prove it.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum JudgingMode {
    /// The judge signs a scorecard off chain in a single action, paying no fee
    /// and never having to come back. The collection service publishes a Merkle
    /// root when the window closes, and the leaves at the reveal.
    ///
    /// This is the default because the alternative loses scorecards. A judge who
    /// must return to reveal is a judge who sometimes does not, and a missing
    /// scorecard breaks the quorum for a project that did nothing wrong. The
    /// cost is that the collection service could in theory omit a scorecard,
    /// which is why every submission returns a signed receipt and every judge
    /// gets an inclusion proof the moment the root is published.
    Easy(Address),
    /// The judge writes a commitment on chain themselves and opens it
    /// themselves. Two transactions, no trust in any service.
    ///
    /// For events where the prize is large enough, or the dispute risk high
    /// enough, that the easy mode's trust assumption is not acceptable.
    Strict,
}

impl JudgingMode {
    /// The address allowed to seal the scorecards, if any.
    pub fn sealer(&self) -> Option<Address> {
        match self {
            JudgingMode::Easy(sealer) => Some(sealer.clone()),
            JudgingMode::Strict => None,
        }
    }

    /// Whether a collection service stands between the judge and the chain.
    pub fn relies_on_collection_service(&self) -> bool {
        matches!(self, JudgingMode::Easy(_))
    }
}

#[cfg(test)]
mod test {
    use super::JudgingMode;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Env};

    #[test]
    fn the_easy_mode_names_the_service_it_leans_on() {
        let env = Env::default();
        let sealer = Address::generate(&env);
        let mode = JudgingMode::Easy(sealer.clone());

        assert!(mode.relies_on_collection_service());
        assert_eq!(mode.sealer(), Some(sealer));
    }

    #[test]
    fn the_strict_mode_leans_on_nobody() {
        assert!(!JudgingMode::Strict.relies_on_collection_service());
        assert_eq!(JudgingMode::Strict.sealer(), None);
    }
}
