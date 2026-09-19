use soroban_sdk::{contracttype, Address, BytesN, Env, Vec};

use crate::constitution::TeamPolicy;
use crate::errors::Error;

/// Where a request to take part stands.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ApplicationStatus {
    Pending = 0,
    Approved = 1,
    Rejected = 2,
}

/// One person's request to take part, and what came of it.
///
/// The rejection reason is kept here rather than only in an event, because a
/// refusal that leaves no permanent record is the quiet back door the product
/// exists to close. It is a hash: the written reason lives off chain, and this
/// proves which text was given.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Registration {
    pub status: ApplicationStatus,
    /// When the request arrived.
    pub applied_at: u64,
    /// When it was decided; zero while it is still pending.
    pub decided_at: u64,
    /// Digest of the written reason for a refusal; all zeroes otherwise.
    pub reason: BytesN<32>,
}

impl Registration {
    /// A request that has just arrived.
    pub fn pending(env: &Env, applied_at: u64) -> Registration {
        Registration {
            status: ApplicationStatus::Pending,
            applied_at,
            decided_at: 0,
            reason: BytesN::from_array(env, &[0u8; 32]),
        }
    }

    /// Records an approval.
    pub fn approve(&self, env: &Env, decided_at: u64) -> Result<Registration, Error> {
        self.require_pending()?;

        Ok(Registration {
            status: ApplicationStatus::Approved,
            applied_at: self.applied_at,
            decided_at,
            reason: BytesN::from_array(env, &[0u8; 32]),
        })
    }

    /// Records a refusal against the reason that was given for it.
    pub fn reject(&self, decided_at: u64, reason: BytesN<32>) -> Result<Registration, Error> {
        self.require_pending()?;

        Ok(Registration {
            status: ApplicationStatus::Rejected,
            applied_at: self.applied_at,
            decided_at,
            reason,
        })
    }

    pub fn is_approved(&self) -> bool {
        self.status == ApplicationStatus::Approved
    }

    /// Whether this person may cast a community ballot.
    ///
    /// Approval alone is not enough. The registration deadline is the snapshot
    /// that fixes the electorate, so an approval granted after it lets someone
    /// take part in the event without ever gaining a vote. Without this, an
    /// organizer could wave through a hundred friends on the morning of the
    /// vote and decide the result.
    pub fn may_vote(&self, registration_closes_at: u64) -> bool {
        self.is_approved() && self.decided_at <= registration_closes_at
    }

    fn require_pending(&self) -> Result<(), Error> {
        match self.status {
            ApplicationStatus::Pending => Ok(()),
            _ => Err(Error::ApplicationNotPending),
        }
    }
}

/// A team, as the contract sees it.
///
/// There are no prize shares here on purpose. The whole prize goes to the
/// captain, who settles up with their team off the platform. That keeps the
/// contract out of arguments it cannot resolve, at the cost of one thing worth
/// naming: a teammate the captain does not pay has no recourse on chain. The
/// members are still recorded, so the receipt shows who built the project even
/// though it cannot show the last hop of the money.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Team {
    pub id: u32,
    /// The address the prize is paid to.
    pub captain: Address,
    /// Everyone on the team, the captain included and always first.
    pub members: Vec<Address>,
}

impl Team {
    /// A new team of one.
    pub fn found(env: &Env, id: u32, captain: Address) -> Team {
        let mut members = Vec::new(env);
        members.push_back(captain.clone());

        Team {
            id,
            captain,
            members,
        }
    }

    pub fn size(&self) -> u32 {
        self.members.len()
    }

    pub fn has_member(&self, who: &Address) -> bool {
        self.members.contains(who)
    }

    /// Adds someone to the team, within the size the organizer announced.
    pub fn add_member(&self, member: Address, policy: &TeamPolicy) -> Result<Team, Error> {
        if self.has_member(&member) {
            return Err(Error::TeamJoinRejected);
        }

        if !policy.accepts(self.size()) {
            return Err(Error::TeamJoinRejected);
        }

        let mut members = self.members.clone();
        members.push_back(member);

        Ok(Team {
            id: self.id,
            captain: self.captain.clone(),
            members,
        })
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    const DAY: u64 = 24 * 60 * 60;

    fn reason(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[3u8; 32])
    }

    #[test]
    fn a_new_request_is_pending_and_carries_no_reason() {
        let env = Env::default();
        let registration = Registration::pending(&env, 100);

        assert_eq!(registration.status, ApplicationStatus::Pending);
        assert_eq!(registration.applied_at, 100);
        assert_eq!(registration.decided_at, 0);
        assert!(!registration.is_approved());
    }

    #[test]
    fn approving_records_when_it_happened() {
        let env = Env::default();
        let approved = Registration::pending(&env, 100).approve(&env, 200).unwrap();

        assert!(approved.is_approved());
        assert_eq!(approved.decided_at, 200);
    }

    #[test]
    fn refusing_records_the_reason_that_was_given() {
        let env = Env::default();
        let rejected = Registration::pending(&env, 100)
            .reject(200, reason(&env))
            .unwrap();

        assert_eq!(rejected.status, ApplicationStatus::Rejected);
        assert_eq!(rejected.reason, reason(&env));
        assert!(!rejected.is_approved());
    }

    #[test]
    fn a_decided_request_cannot_be_decided_again() {
        let env = Env::default();
        let approved = Registration::pending(&env, 100).approve(&env, 200).unwrap();

        assert_eq!(
            approved.approve(&env, 300).err(),
            Some(Error::ApplicationNotPending)
        );
        assert_eq!(
            approved.reject(300, reason(&env)).err(),
            Some(Error::ApplicationNotPending)
        );
    }

    /// The check that stops an organizer waving through a hundred friends on
    /// the morning of the vote.
    #[test]
    fn an_approval_after_the_registration_deadline_carries_no_vote() {
        let env = Env::default();
        let deadline = 7 * DAY;

        let in_time = Registration::pending(&env, DAY)
            .approve(&env, deadline)
            .unwrap();
        let late = Registration::pending(&env, DAY)
            .approve(&env, deadline + 1)
            .unwrap();

        assert!(in_time.may_vote(deadline));
        assert!(late.is_approved(), "they still take part");
        assert!(!late.may_vote(deadline), "but they do not vote");
    }

    #[test]
    fn a_refused_applicant_never_votes() {
        let env = Env::default();
        let rejected = Registration::pending(&env, 100)
            .reject(200, reason(&env))
            .unwrap();

        assert!(!rejected.may_vote(u64::MAX));
    }

    #[test]
    fn a_new_team_holds_its_captain_and_nobody_else() {
        let env = Env::default();
        let captain = Address::generate(&env);
        let team = Team::found(&env, 1, captain.clone());

        assert_eq!(team.size(), 1);
        assert_eq!(team.captain, captain);
        assert!(team.has_member(&captain));
    }

    #[test]
    fn a_team_grows_up_to_the_announced_limit() {
        let env = Env::default();
        let policy = TeamPolicy {
            max_size: 3,
            multi_team_allowed: false,
        };

        let mut team = Team::found(&env, 1, Address::generate(&env));
        team = team.add_member(Address::generate(&env), &policy).unwrap();
        team = team.add_member(Address::generate(&env), &policy).unwrap();

        assert_eq!(team.size(), 3);
        assert_eq!(
            team.add_member(Address::generate(&env), &policy).err(),
            Some(Error::TeamJoinRejected)
        );
    }

    #[test]
    fn a_solo_hackathon_leaves_no_room_beside_the_captain() {
        let env = Env::default();
        let team = Team::found(&env, 1, Address::generate(&env));

        assert_eq!(
            team.add_member(Address::generate(&env), &TeamPolicy::solo_only())
                .err(),
            Some(Error::TeamJoinRejected)
        );
    }

    #[test]
    fn the_same_person_cannot_join_a_team_twice() {
        let env = Env::default();
        let policy = TeamPolicy::small_teams();
        let member = Address::generate(&env);

        let team = Team::found(&env, 1, Address::generate(&env))
            .add_member(member.clone(), &policy)
            .unwrap();

        assert_eq!(
            team.add_member(member, &policy).err(),
            Some(Error::TeamJoinRejected)
        );
    }

    #[test]
    fn the_captain_cannot_be_added_as_their_own_member() {
        let env = Env::default();
        let captain = Address::generate(&env);
        let team = Team::found(&env, 1, captain.clone());

        assert_eq!(
            team.add_member(captain, &TeamPolicy::small_teams()).err(),
            Some(Error::TeamJoinRejected)
        );
    }
}
