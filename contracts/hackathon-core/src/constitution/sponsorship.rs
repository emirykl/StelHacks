use soroban_sdk::{contracttype, Symbol, Vec};

use crate::constitution::scoring::Track;
use crate::errors::Error;

/// Whether outside money may join the prize pool after the lock, and how far.
//
// The vault has always taken deposits from anyone at any phase, and until now
// that generosity went nowhere: prizes are paid from the frozen table, so a
// sponsor arriving on the second day put money into a pool no entry point
// could ever move out again. This policy is what gives that money a
// destination.
//
// It lives in the constitution for the same reason the platform fee does. A
// hackathon that could take on sponsors the organizer never announced is a
// hackathon whose prize table is not what the participant read, and the whole
// product rests on that table being what it said. So the door is opened before
// the lock or it is never opened: an organizer who left this closed cannot
// change their mind once somebody has started building.
//
// Note what a sponsor still cannot do. They cannot appoint a judge, they
// cannot write a rubric, and they cannot take a position away from anybody. A
// sponsor track borrows its bench and its rubric from a track that was frozen
// with everything else, which is the line between adding a prize and editing
// the competition.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SponsorshipPolicy {
    /// Whether anyone may add to a position that is already in the prize table.
    pub top_ups_allowed: bool,
    /// How many tracks sponsors may open between them. Zero forbids them, and
    /// is the setting for an organizer who wants help with the prize but not
    /// with the shape of the competition.
    pub max_new_tracks: u32,
    /// The least a single contribution may carry.
    //
    // Not a snobbery about small money: every sponsorship is a stored record
    // and a line on a public wall, and a pool that can be joined for one
    // stroop can be buried under ten thousand of them by anybody who wants the
    // wall to be useless.
    pub min_bounty: i128,
    /// The track a sponsor track takes its rubric **and its bench** from.
    //
    // Both, from one field, because they cannot be separated. The frozen judge
    // list assigns judges to named tracks; a track whose name nobody was
    // assigned to has no judge who may score it and a quorum it can never
    // reach, so a sponsor track that borrowed only the rubric would be a prize
    // nobody could ever award. Borrowing the bench along with it also settles
    // the question a sponsor would otherwise ask next, which is whether they
    // may bring their own judge. They may not.
    //
    // Read only when [`Self::max_new_tracks`] is positive.
    pub borrows_from: Symbol,
}

impl SponsorshipPolicy {
    /// An event that takes no outside money, which is still an event that says
    /// so.
    //
    // Named rather than left to a caller assembling zeroes, because the
    // borrowed track has to be some symbol even when nothing reads it, and a
    // caller inventing one per event is a caller who will eventually invent
    // one that means something.
    pub fn closed(track: Symbol) -> Self {
        Self {
            top_ups_allowed: false,
            max_new_tracks: 0,
            min_bounty: 0,
            borrows_from: track,
        }
    }

    /// Whether this policy lets anybody in at all.
    pub fn is_open(&self) -> bool {
        self.top_ups_allowed || self.max_new_tracks > 0
    }

    /// Rejects a policy that could not be honoured.
    //
    // The floor has to be positive wherever the door is open. A minimum of
    // zero would admit the zero contribution, which the vault refuses to
    // transfer anyway, so the sponsorship would be recorded against money that
    // never moved.
    pub fn validate(&self, tracks: &Vec<Track>) -> Result<(), Error> {
        if !self.is_open() {
            return Ok(());
        }

        if self.min_bounty <= 0 {
            return Err(Error::ConstitutionInvalid);
        }

        // Only checked where sponsor tracks are actually allowed. An organizer
        // who opened top ups alone never names a track to borrow from, and
        // failing them over a field their setting does not read would be a
        // rejection they could not act on.
        if self.max_new_tracks > 0 && !tracks.iter().any(|track| track.id == self.borrows_from) {
            return Err(Error::NotFound);
        }

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::constitution::scoring::Criterion;
    use crate::constitution::scoring::WEIGHT_TOTAL_BPS;
    use soroban_sdk::{symbol_short, vec, Env};

    fn tracks(env: &Env) -> Vec<Track> {
        vec![
            env,
            Track {
                id: symbol_short!("main"),
                criteria: vec![
                    env,
                    Criterion {
                        id: symbol_short!("craft"),
                        weight_bps: WEIGHT_TOTAL_BPS,
                    },
                ],
                no_award_allowed: false,
            },
        ]
    }

    fn open() -> SponsorshipPolicy {
        SponsorshipPolicy {
            top_ups_allowed: true,
            max_new_tracks: 2,
            min_bounty: 100,
            borrows_from: symbol_short!("main"),
        }
    }

    #[test]
    fn a_closed_policy_needs_nothing_else_to_hold_together() {
        let env = Env::default();
        let policy = SponsorshipPolicy::closed(symbol_short!("main"));

        assert!(!policy.is_open());
        assert_eq!(policy.validate(&tracks(&env)), Ok(()));
    }

    /// A closed policy is checked against an empty track list too, because the
    /// document validates its parts before it validates them against each
    /// other, and a policy nobody reads must not be the thing that fails first.
    #[test]
    fn a_closed_policy_does_not_reach_for_a_track() {
        let env = Env::default();
        let policy = SponsorshipPolicy::closed(symbol_short!("nope"));

        assert_eq!(policy.validate(&vec![&env]), Ok(()));
    }

    #[test]
    fn an_open_policy_is_accepted_when_it_names_a_real_track() {
        let env = Env::default();

        assert_eq!(open().validate(&tracks(&env)), Ok(()));
        assert!(open().is_open());
    }

    /// The borrowed track is where a sponsor track gets both its rubric and the
    /// judges allowed to score it. Naming one that does not exist would freeze
    /// a policy whose every sponsor track is unjudgeable.
    #[test]
    fn borrowing_from_a_track_that_does_not_exist_is_refused() {
        let env = Env::default();

        let policy = SponsorshipPolicy {
            borrows_from: symbol_short!("ghost"),
            ..open()
        };

        assert_eq!(policy.validate(&tracks(&env)), Err(Error::NotFound));
    }

    /// Top ups alone never read the borrowed track, so an organizer who wants
    /// only money must not be failed over a field their setting ignores.
    #[test]
    fn top_ups_alone_do_not_have_to_name_a_borrowed_track() {
        let env = Env::default();

        let policy = SponsorshipPolicy {
            top_ups_allowed: true,
            max_new_tracks: 0,
            min_bounty: 100,
            borrows_from: symbol_short!("ghost"),
        };

        assert_eq!(policy.validate(&tracks(&env)), Ok(()));
    }

    /// The vault will not transfer zero, so a floor of zero would let a
    /// sponsorship be recorded against money that never moved.
    #[test]
    fn an_open_policy_with_no_floor_is_refused() {
        let env = Env::default();

        let policy = SponsorshipPolicy {
            min_bounty: 0,
            ..open()
        };

        assert_eq!(
            policy.validate(&tracks(&env)),
            Err(Error::ConstitutionInvalid)
        );
    }
}
