use soroban_sdk::contracterror;

/// Every rejection the vault can produce.
///
/// The list is deliberately short. A vault that can fail in many ways is a
/// vault nobody can reason about, and this one only has to do three things:
/// take money from anyone, hold it where no key can reach it, and pay out when
/// the hackathon it is bound to says the result is final.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    /// The caller is not the hackathon this vault was bound to at creation.
    /// Nothing else can move money out.
    NotCore = 3,
    AmountNotPositive = 4,
    InsufficientBalance = 5,
}
