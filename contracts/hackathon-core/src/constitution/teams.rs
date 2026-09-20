use soroban_sdk::contracttype;

use crate::errors::Error;

/// A team of one is a solo entry, which every hackathon has to allow.
pub const MIN_TEAM_SIZE: u32 = 1;

/// The ceiling on what an organizer may allow.
//
// Past ten, a hackathon team stops being a team and starts being a company
// with an unfair head start, and the cap is here so that judgement does not
// have to be made again for every event.
pub const MAX_TEAM_SIZE: u32 = 10;

/// How teams may be formed.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct TeamPolicy {
    /// The most people one team may hold, counting the captain.
    pub max_size: u32,
    /// Whether one person may belong to more than one team.
    //
    // Off in most events, because a builder splitting themselves across four
    // entries is competing against their own teammates. An organizer running a
    // small event where the same handful of people carry several ideas can
    // turn it on, and the self vote check accounts for every team a voter
    // belongs to either way.
    pub multi_team_allowed: bool,
}

impl TeamPolicy {
    /// The common setup: teams of up to four, one team per person.
    pub fn small_teams() -> TeamPolicy {
        TeamPolicy {
            max_size: 4,
            multi_team_allowed: false,
        }
    }

    /// Solo entries only.
    pub fn solo_only() -> TeamPolicy {
        TeamPolicy {
            max_size: MIN_TEAM_SIZE,
            multi_team_allowed: false,
        }
    }

    /// Whether one more member fits.
    pub fn accepts(&self, current_size: u32) -> bool {
        current_size < self.max_size
    }

    /// Rejects a size nobody could work with.
    pub fn validate(&self) -> Result<(), Error> {
        if self.max_size < MIN_TEAM_SIZE || self.max_size > MAX_TEAM_SIZE {
            return Err(Error::ConstitutionInvalid);
        }

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn the_common_setup_is_small_teams_and_one_team_each() {
        let policy = TeamPolicy::small_teams();

        assert_eq!(policy.validate(), Ok(()));
        assert_eq!(policy.max_size, 4);
        assert!(!policy.multi_team_allowed);
    }

    #[test]
    fn a_solo_only_hackathon_is_allowed() {
        let policy = TeamPolicy::solo_only();

        assert_eq!(policy.validate(), Ok(()));
        assert!(policy.accepts(0));
        assert!(!policy.accepts(1));
    }

    #[test]
    fn the_ceiling_is_ten() {
        let at_cap = TeamPolicy {
            max_size: MAX_TEAM_SIZE,
            multi_team_allowed: false,
        };
        let over_cap = TeamPolicy {
            max_size: MAX_TEAM_SIZE + 1,
            multi_team_allowed: false,
        };

        assert_eq!(at_cap.validate(), Ok(()));
        assert_eq!(over_cap.validate(), Err(Error::ConstitutionInvalid));
    }

    #[test]
    fn a_team_of_nobody_is_rejected() {
        let policy = TeamPolicy {
            max_size: 0,
            multi_team_allowed: false,
        };

        assert_eq!(policy.validate(), Err(Error::ConstitutionInvalid));
    }

    #[test]
    fn a_team_fills_up_at_its_limit() {
        let policy = TeamPolicy {
            max_size: 3,
            multi_team_allowed: true,
        };

        assert!(policy.accepts(0));
        assert!(policy.accepts(2));
        assert!(!policy.accepts(3));
        assert!(!policy.accepts(4));
    }
}
