use soroban_sdk::contracttype;

/// Who may read the submitted projects while the hackathon is running.
//
// This governs the project metadata only, and it is enforced off chain, where
// that metadata lives. What sits on chain is a hash, a timestamp and a track,
// and those stay readable by anyone in every setting. A private hackathon
// therefore still produces a receipt a stranger can check: they can see that
// project seven scored 84.2 and what every judge gave it on every criterion,
// they simply cannot read what project seven was.
//
// Calling this a privacy guarantee would be dishonest, so it is not. It is an
// access rule on the platform's own API, and the proof of the result never
// depends on it.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ProjectVisibility {
    /// Anyone can browse the gallery, signed in or not. This is the default and
    /// the setting that makes a hackathon its own advertisement.
    Public = 0,
    /// Only approved participants of this hackathon can see the projects.
    /// A closed event still needs this much, because a community vote asks
    /// participants to judge work they have to be able to open.
    Participants = 1,
    /// Only the organizing team and the judges can see the projects. Suitable
    /// for a corporate or internal event, and incompatible with a community
    /// vote for the obvious reason.
    Restricted = 2,
}

impl ProjectVisibility {
    /// Whether participants of the hackathon can open a project page.
    pub fn visible_to_participants(self) -> bool {
        matches!(
            self,
            ProjectVisibility::Public | ProjectVisibility::Participants
        )
    }

    /// Whether someone with no connection to the hackathon can open it.
    pub fn visible_to_public(self) -> bool {
        matches!(self, ProjectVisibility::Public)
    }

    /// Whether a community vote can be run under this setting.
    //
    // Asking participants to vote on projects they are not allowed to read
    // would turn the ballot into a popularity contest over team names, so the
    // two settings are checked against each other when the rules are locked.
    pub fn supports_community_vote(self) -> bool {
        self.visible_to_participants()
    }
}

#[cfg(test)]
mod test {
    use super::ProjectVisibility;

    #[test]
    fn a_public_gallery_is_open_to_everyone() {
        let visibility = ProjectVisibility::Public;

        assert!(visibility.visible_to_public());
        assert!(visibility.visible_to_participants());
        assert!(visibility.supports_community_vote());
    }

    #[test]
    fn a_participants_only_gallery_is_closed_to_outsiders() {
        let visibility = ProjectVisibility::Participants;

        assert!(!visibility.visible_to_public());
        assert!(visibility.visible_to_participants());
        assert!(visibility.supports_community_vote());
    }

    #[test]
    fn a_restricted_gallery_rules_out_a_community_vote() {
        let visibility = ProjectVisibility::Restricted;

        assert!(!visibility.visible_to_public());
        assert!(!visibility.visible_to_participants());
        assert!(!visibility.supports_community_vote());
    }
}
