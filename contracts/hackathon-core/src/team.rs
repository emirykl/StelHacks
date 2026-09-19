use soroban_sdk::{contracttype, Address, Env, Vec};

use crate::errors::Error;

/// The people running a hackathon from the organizing side.
///
/// The organizer is fixed when the hackathon is created and is the only address
/// that can fund the vault, lock the rules, screen submissions or open a
/// disqualification. Collaborators are the organizer's helpers, and their reach
/// stops at one job: deciding who gets into the event.
///
/// That split is deliberate. The collaborator list can grow in the middle of a
/// running hackathon, when a hundred applications are waiting and one person
/// cannot read them all. Anything touching the prize or the ranking would be
/// unsafe to hang off a list that grows under time pressure, so it does not.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OrganizingTeam {
    /// The address that created the hackathon and holds every organizer power.
    pub organizer: Address,
    /// Helpers who may review registration applications. Changes to this list
    /// are recorded, so the proof page can show who was allowed to admit whom.
    pub collaborators: Vec<Address>,
}

impl OrganizingTeam {
    /// A hackathon that starts with the organizer working alone.
    pub fn new(env: &Env, organizer: Address) -> OrganizingTeam {
        OrganizingTeam {
            organizer,
            collaborators: Vec::new(env),
        }
    }

    /// Whether this address holds the full organizer powers.
    pub fn is_organizer(&self, who: &Address) -> bool {
        &self.organizer == who
    }

    /// Whether this address may approve or reject a registration application.
    ///
    /// The organizer is always included, so adding a collaborator widens the
    /// door without ever narrowing it.
    pub fn can_review_applications(&self, who: &Address) -> bool {
        self.is_organizer(who) || self.collaborators.contains(who)
    }

    /// Adds a helper who can work through the application queue.
    ///
    /// The organizer is refused rather than silently ignored, because a caller
    /// asking for that has misunderstood who already holds the power and should
    /// hear about it.
    pub fn add_collaborator(&mut self, collaborator: Address) -> Result<(), Error> {
        if self.is_organizer(&collaborator) {
            return Err(Error::OrganizerCannotBeCollaborator);
        }

        if self.collaborators.contains(&collaborator) {
            return Err(Error::CollaboratorAlreadyAdded);
        }

        self.collaborators.push_back(collaborator);

        Ok(())
    }

    /// Removes a helper. Applications they already decided on stay decided;
    /// the record of who reviewed what is kept elsewhere and is not rewritten.
    pub fn remove_collaborator(&mut self, collaborator: &Address) -> Result<(), Error> {
        match self.collaborators.first_index_of(collaborator) {
            Some(index) => {
                self.collaborators.remove(index);
                Ok(())
            }
            None => Err(Error::CollaboratorNotFound),
        }
    }

    /// Fails unless the caller holds the full organizer powers.
    pub fn require_organizer(&self, who: &Address) -> Result<(), Error> {
        if self.is_organizer(who) {
            Ok(())
        } else {
            Err(Error::NotOrganizer)
        }
    }

    /// Fails unless the caller may work through the application queue.
    pub fn require_application_reviewer(&self, who: &Address) -> Result<(), Error> {
        if self.can_review_applications(who) {
            Ok(())
        } else {
            Err(Error::NotOnOrganizingTeam)
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    fn team(env: &Env) -> (OrganizingTeam, Address) {
        let organizer = Address::generate(env);
        (OrganizingTeam::new(env, organizer.clone()), organizer)
    }

    #[test]
    fn a_new_hackathon_starts_with_the_organizer_alone() {
        let env = Env::default();
        let (team, organizer) = team(&env);

        assert!(team.is_organizer(&organizer));
        assert!(team.can_review_applications(&organizer));
        assert_eq!(team.collaborators.len(), 0);
    }

    #[test]
    fn a_collaborator_can_review_applications_but_is_not_the_organizer() {
        let env = Env::default();
        let (mut team, _organizer) = team(&env);
        let helper = Address::generate(&env);

        assert_eq!(team.add_collaborator(helper.clone()), Ok(()));
        assert!(team.can_review_applications(&helper));
        assert!(!team.is_organizer(&helper));
        assert_eq!(team.require_organizer(&helper), Err(Error::NotOrganizer));
        assert_eq!(team.require_application_reviewer(&helper), Ok(()));
    }

    #[test]
    fn a_stranger_can_do_neither() {
        let env = Env::default();
        let (team, _organizer) = team(&env);
        let stranger = Address::generate(&env);

        assert_eq!(team.require_organizer(&stranger), Err(Error::NotOrganizer));
        assert_eq!(
            team.require_application_reviewer(&stranger),
            Err(Error::NotOnOrganizingTeam)
        );
    }

    #[test]
    fn the_same_helper_cannot_be_added_twice() {
        let env = Env::default();
        let (mut team, _organizer) = team(&env);
        let helper = Address::generate(&env);

        assert_eq!(team.add_collaborator(helper.clone()), Ok(()));
        assert_eq!(
            team.add_collaborator(helper),
            Err(Error::CollaboratorAlreadyAdded)
        );
        assert_eq!(team.collaborators.len(), 1);
    }

    #[test]
    fn the_organizer_cannot_be_listed_as_their_own_helper() {
        let env = Env::default();
        let (mut team, organizer) = team(&env);

        assert_eq!(
            team.add_collaborator(organizer),
            Err(Error::OrganizerCannotBeCollaborator)
        );
    }

    #[test]
    fn removing_a_helper_takes_their_review_rights_away() {
        let env = Env::default();
        let (mut team, _organizer) = team(&env);
        let helper = Address::generate(&env);

        team.add_collaborator(helper.clone()).unwrap();
        assert_eq!(team.remove_collaborator(&helper), Ok(()));
        assert!(!team.can_review_applications(&helper));
    }

    #[test]
    fn removing_someone_who_was_never_a_helper_is_refused() {
        let env = Env::default();
        let (mut team, _organizer) = team(&env);
        let stranger = Address::generate(&env);

        assert_eq!(
            team.remove_collaborator(&stranger),
            Err(Error::CollaboratorNotFound)
        );
    }

    #[test]
    fn removing_a_helper_leaves_the_others_in_place() {
        let env = Env::default();
        let (mut team, _organizer) = team(&env);
        let first = Address::generate(&env);
        let second = Address::generate(&env);

        team.add_collaborator(first.clone()).unwrap();
        team.add_collaborator(second.clone()).unwrap();
        team.remove_collaborator(&first).unwrap();

        assert!(!team.can_review_applications(&first));
        assert!(team.can_review_applications(&second));
        assert_eq!(team.collaborators.len(), 1);
    }
}
