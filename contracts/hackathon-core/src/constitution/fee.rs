use soroban_sdk::{contracttype, Address};

use crate::errors::Error;

/// What a rate is measured against, so a rate and a total never disagree about
/// their scale.
pub const FEE_TOTAL_BPS: i128 = 10_000;

/// The most a constitution may declare.
//
// Not a protection against a greedy platform, which this cannot be: the fee is
// announced before the lock, anyone can read it, and it is paid on top of the
// prize table rather than out of it, so a high one only costs the organizer who
// agreed to it. It is a guard against the typo. Five percent written as `5_000`
// instead of `500` is a plausible mistake, it is a fifty percent fee, and there
// is no way to fix it after the lock. Twenty percent is well above anything
// this product intends to charge and well below what a slipped digit produces.
pub const MAX_PLATFORM_FEE_BPS: u32 = 2_000;

/// What the platform takes for carrying the event, frozen with everything else.
//
// This is in the constitution rather than in a table we keep, and that is the
// whole point of it. The landing page promises that the rules are hashed and
// frozen and that nobody can change them afterwards, us included. A cut applied
// from outside that document would be exactly the thing the promise is against,
// and it would be the platform breaking it rather than an organizer. So the fee
// is read before anybody registers, it is hashed into the same digest as the
// rubric and the prize table, and it cannot move afterwards either.
//
// It is charged on top of the prize table, never out of it. A winner is paid
// the amount their position announced, and the organizer funds the pool with
// the prizes plus the fee. The alternative, taking a slice of each prize, would
// mean the number a builder read before giving up a weekend was not the number
// they were paid, which is a smaller lie than the ones this product exists to
// remove but is the same kind.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlatformFee {
    /// Where it goes. Named even at a zero rate, because an address that only
    /// appears at some rates is a field readers have to check the rate to
    /// interpret, and every other address in this document is unconditional.
    pub collector: Address,
    /// Basis points of the prize table. Zero is a real answer and the common one
    /// for community events.
    pub bps: u32,
}

impl PlatformFee {
    /// An event that owes nothing, which is still an event that says so.
    pub fn free(collector: Address) -> Self {
        Self { collector, bps: 0 }
    }

    pub fn validate(&self) -> Result<(), Error> {
        if self.bps > MAX_PLATFORM_FEE_BPS {
            return Err(Error::ConstitutionInvalid);
        }

        Ok(())
    }

    /// What this rate comes to against a prize table.
    //
    // Integer division, so the remainder is dropped and the fee lands a
    // fraction low rather than a fraction high. Rounding the other way would
    // take from a pool sized to the announced total and could, on a table small
    // enough, ask for a unit the organizer was never told to deposit.
    pub fn amount_on(&self, prize_total: i128) -> Result<i128, Error> {
        prize_total
            .checked_mul(self.bps as i128)
            .map(|scaled| scaled / FEE_TOTAL_BPS)
            .ok_or(Error::ConstitutionInvalid)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    fn at(env: &Env, bps: u32) -> PlatformFee {
        PlatformFee {
            collector: Address::generate(env),
            bps,
        }
    }

    /// The number in every conversation about this product's pricing, checked
    /// so a change to the arithmetic has to be argued for rather than noticed.
    #[test]
    fn five_percent_of_ten_thousand_is_five_hundred() {
        let env = Env::default();

        assert_eq!(at(&env, 500).amount_on(10_000), Ok(500));
    }

    /// Without this a community event would still have to name a rate that
    /// happened to be harmless, and the zero case would be untested.
    #[test]
    fn a_free_event_owes_nothing() {
        let env = Env::default();
        let fee = PlatformFee::free(Address::generate(&env));

        assert_eq!(fee.validate(), Ok(()));
        assert_eq!(fee.amount_on(10_000), Ok(0));
    }

    /// A fee that rounded up could ask the vault for a unit the organizer was
    /// never told to deposit, which would strand the settlement.
    #[test]
    fn a_remainder_is_dropped_rather_than_rounded_up() {
        let env = Env::default();

        // Five percent of 199 is 9.95.
        assert_eq!(at(&env, 500).amount_on(199), Ok(9));
    }

    /// The digit slip this cap exists for: five percent typed at the wrong
    /// scale is a fifty percent fee and cannot be undone after the lock.
    #[test]
    fn a_rate_past_the_cap_is_refused_before_the_lock() {
        let env = Env::default();

        assert_eq!(at(&env, MAX_PLATFORM_FEE_BPS).validate(), Ok(()));
        assert_eq!(
            at(&env, MAX_PLATFORM_FEE_BPS + 1).validate(),
            Err(Error::ConstitutionInvalid)
        );
        assert_eq!(at(&env, 5_000).validate(), Err(Error::ConstitutionInvalid));
    }

    /// The multiplication is checked, so a prize table near the top of the range
    /// fails the lock rather than wrapping into a negative fee.
    #[test]
    fn a_prize_table_too_large_to_multiply_is_refused() {
        let env = Env::default();

        assert_eq!(
            at(&env, 500).amount_on(i128::MAX),
            Err(Error::ConstitutionInvalid)
        );
    }
}
