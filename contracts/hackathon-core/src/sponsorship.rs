use soroban_sdk::{contracttype, Address, BytesN, Symbol, Vec};

use crate::constitution::PrizeTier;

/// The most contributions one hackathon may take.
//
// A cap rather than an open list, for two reasons that both have to hold.
// Cancelling an event walks this list and pays every sponsor back inside a
// single invocation, so an unbounded list is an event that could grow past the
// point where it can be refunded at all. And the public wall is read by
// people, not machines; past a hundred names it stops being a wall and starts
// being a log.
//
// A hundred is far above any event this product expects and far below where
// either problem begins.
pub const MAX_SPONSORSHIPS: u32 = 100;

/// One contribution to the prize pool, and the position it was aimed at.
//
// Recorded rather than merely accumulated, because the sum is what settlement
// needs and the list is what everybody else needs: the sponsor wall, the
// refund on a cancellation, and the reader who wants to know whose money is
// behind a prize that grew after they signed up. A total alone could answer
// none of those.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Sponsorship {
    /// Who paid. The address that signed, so nobody can be credited with money
    /// they did not send.
    pub sponsor: Address,
    /// The track whose position this was aimed at.
    pub track: Symbol,
    /// The rank within that track, or zero for a contribution spread over
    /// every position in it.
    //
    // Zero is free to carry that meaning because no real position can ever
    // hold it: `validate_prize_tiers` refuses a table containing a rank of
    // zero, in the frozen constitution and in a sponsored track alike. A
    // reader who does not know about the sentinel sees a rank that is not in
    // the table, which is the truth.
    pub rank: u32,
    /// What reaches the winner, in the smallest unit of the prize asset.
    pub amount: i128,
    /// What the platform takes on top, paid by the sponsor in the same call.
    //
    // Held beside the amount rather than folded into it, because the two go to
    // different places and a reader working out what a position is now worth
    // must not accidentally count the fee as prize money.
    pub fee: i128,
    /// When it landed.
    pub at: u64,
    /// Digest of who the sponsor is and whatever they wanted said beside their
    /// name, which lives off chain for the same reason the hackathon's own
    /// description does: a logo and a sentence are not rules.
    pub note: BytesN<32>,
}

impl Sponsorship {
    /// What the sponsor actually paid, which is the prize plus the fee.
    //
    // The number the vault received and, on a cancellation, the number that
    // has to go back. Nothing was earned by an event that did not happen, so
    // the fee returns along with the prize.
    pub fn paid(&self) -> i128 {
        self.amount + self.fee
    }
}

/// How a contribution aimed at a whole track is divided between its positions.
//
// Somebody with a hundred to give and four places to give it to has two
// defensible answers and this contract has no way to pick between them, so it
// takes the sponsor's.
//
// Evenly treats the places as equal opportunities: the same money behind each
// one, whatever the table already says, which narrows the gap between first
// and last. ByWorth leaves the table's own shape alone, so a first prize that
// was three times the fourth is still three times the fourth afterwards.
// Neither is more correct — they are two different things to want, and
// guessing would put somebody's money where they did not mean it to go.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Split {
    /// The same amount to every position.
    Evenly = 0,
    /// In proportion to what each position is already worth.
    ByWorth = 1,
}

/// Where a sponsor's request for a track of their own has got to.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum TrackStatus {
    /// Funded and waiting on the organizer.
    Proposed = 0,
    /// Running. Teams may enter it and it is ranked with everything else.
    Accepted = 1,
    /// Turned down, and the money already back with the sponsor.
    Declined = 2,
}

/// A competition track a sponsor paid to open.
//
// The sponsor brings three things and only three: a name, a prize table and
// the money to cover it. The rubric and the bench come from the track the
// locked rules named in
// [`SponsorshipPolicy::borrows_from`](crate::constitution::SponsorshipPolicy),
// so nothing about how a project is scored, or by whom, arrives with the
// money. That is the line between adding a prize and editing the competition,
// and it is the reason this can be allowed after the lock at all.
//
// The organizer still decides. Paying is not a way in: a track carries the
// event's name as much as the sponsor's, and a request that is turned down
// takes its money back with it.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SponsorTrack {
    /// The track's identifier, unique across the frozen tracks and the
    /// sponsored ones alike.
    pub id: Symbol,
    /// Who asked for it and funded it.
    pub sponsor: Address,
    /// The positions it pays. Each one names this track, so a tier read out of
    /// here is the same shape as a tier read out of the frozen table and every
    /// reader downstream can treat them alike.
    pub tiers: Vec<PrizeTier>,
    /// What the platform takes on this track, paid by the sponsor on top.
    pub fee: i128,
    pub status: TrackStatus,
    /// When it was proposed.
    pub at: u64,
    /// Digest of the sponsor's name, logo and whatever they wanted said.
    pub note: BytesN<32>,
}

impl SponsorTrack {
    /// What the positions add up to.
    pub fn total(&self) -> i128 {
        self.tiers.iter().map(|tier| tier.amount).sum()
    }

    /// What the sponsor paid to open it, which is what goes back if it is
    /// turned down or the event is called off.
    pub fn paid(&self) -> i128 {
        self.total() + self.fee
    }

    /// Whether this track's money is still in the vault.
    //
    // A declined track's money left the moment it was declined, so a refund
    // path that did not ask this would pay its sponsor twice.
    pub fn holds_money(&self) -> bool {
        self.status != TrackStatus::Declined
    }
}
