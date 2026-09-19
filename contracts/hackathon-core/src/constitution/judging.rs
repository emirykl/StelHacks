use soroban_sdk::contracttype;

/// How judges seal their scorecards until the reveal.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
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
    Easy = 0,
    /// The judge writes a commitment on chain themselves and opens it
    /// themselves. Two transactions, no trust in any service.
    ///
    /// For events where the prize is large enough, or the dispute risk high
    /// enough, that the easy mode's trust assumption is not acceptable.
    Strict = 1,
}

impl JudgingMode {
    /// Whether a collection service stands between the judge and the chain.
    pub fn relies_on_collection_service(self) -> bool {
        matches!(self, JudgingMode::Easy)
    }
}

#[cfg(test)]
mod test {
    use super::JudgingMode;

    #[test]
    fn the_easy_mode_is_the_one_that_leans_on_a_service() {
        assert!(JudgingMode::Easy.relies_on_collection_service());
        assert!(!JudgingMode::Strict.relies_on_collection_service());
    }
}
