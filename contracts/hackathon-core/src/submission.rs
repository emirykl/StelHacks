use soroban_sdk::{contracttype, String, Symbol};

use crate::errors::Error;

/// Which links a team has to supply before their project counts as submitted.
///
/// The organizer chooses this before the lock, so nobody discovers on the last
/// evening that a demo video was expected. A repository is required by default
/// in practice, since a hackathon judging code without code to read is judging
/// a pitch, but the choice stays with the organizer because internal and design
/// focused events exist too.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct SubmissionRequirements {
    /// The team must supply a source repository link.
    pub repository_required: bool,
    /// The team must supply a demo video link.
    pub demo_video_required: bool,
    /// The team must supply a link to something running.
    pub live_url_required: bool,
}

impl SubmissionRequirements {
    /// The common setup: show the code, show it working on video, deploying it
    /// somewhere is optional.
    pub fn code_and_video() -> SubmissionRequirements {
        SubmissionRequirements {
            repository_required: true,
            demo_video_required: true,
            live_url_required: false,
        }
    }
}

/// Everything a team writes about their project.
///
/// None of this is stored on chain. It lives off chain and the contract keeps
/// only a hash of it, which is what freezes the submission at the deadline
/// without paying to store a description or a video link in ledger state.
///
/// The struct exists here anyway, and this is the important part: it fixes the
/// exact field set and field order that the hash covers. A client that
/// serializes these fields in this order arrives at the same digest the
/// contract would, which is what lets anyone check that the project being
/// judged is the project that was submitted.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubmissionMetadata {
    /// The project name shown in the gallery.
    pub name: String,
    /// One line describing what it does.
    pub summary: String,
    /// The full write up.
    pub description: String,
    /// Where the logo image is stored.
    pub logo_uri: String,
    /// Source repository, normally a GitHub URL.
    pub repository_url: String,
    /// Demo video, normally a YouTube or Loom URL.
    pub demo_video_url: String,
    /// A deployed instance a judge can open and click through.
    pub live_url: String,
    /// The track this project competes in.
    pub track: Symbol,
}

impl SubmissionMetadata {
    /// Rejects a submission that does not carry what the organizer asked for.
    ///
    /// Only presence is checked. Whether a repository link actually resolves,
    /// or points at an empty repository, is a judgement the screening round
    /// makes with a reason attached, not something a contract can decide.
    pub fn validate(&self, requirements: &SubmissionRequirements) -> Result<(), Error> {
        if self.name.is_empty() {
            return Err(Error::ProjectNameMissing);
        }

        if requirements.repository_required && self.repository_url.is_empty() {
            return Err(Error::RepositoryLinkRequired);
        }

        if requirements.demo_video_required && self.demo_video_url.is_empty() {
            return Err(Error::DemoVideoLinkRequired);
        }

        if requirements.live_url_required && self.live_url.is_empty() {
            return Err(Error::LiveUrlRequired);
        }

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{symbol_short, Env};

    fn metadata(env: &Env) -> SubmissionMetadata {
        SubmissionMetadata {
            name: String::from_str(env, "Lumen Split"),
            summary: String::from_str(env, "Shared expenses settled in USDC"),
            description: String::from_str(env, "A longer write up of the project."),
            logo_uri: String::from_str(env, "https://cdn.example.com/lumen-split.png"),
            repository_url: String::from_str(env, "https://github.com/example/lumen-split"),
            demo_video_url: String::from_str(env, "https://youtu.be/example"),
            live_url: String::from_str(env, "https://lumen-split.example.com"),
            track: symbol_short!("payments"),
        }
    }

    #[test]
    fn a_complete_submission_is_accepted() {
        let env = Env::default();
        let requirements = SubmissionRequirements {
            repository_required: true,
            demo_video_required: true,
            live_url_required: true,
        };

        assert_eq!(metadata(&env).validate(&requirements), Ok(()));
    }

    #[test]
    fn a_project_without_a_name_is_rejected() {
        let env = Env::default();
        let mut metadata = metadata(&env);
        metadata.name = String::from_str(&env, "");

        assert_eq!(
            metadata.validate(&SubmissionRequirements::code_and_video()),
            Err(Error::ProjectNameMissing)
        );
    }

    #[test]
    fn a_missing_repository_is_rejected_only_when_it_was_asked_for() {
        let env = Env::default();
        let mut metadata = metadata(&env);
        metadata.repository_url = String::from_str(&env, "");

        let mut requirements = SubmissionRequirements::code_and_video();
        assert_eq!(
            metadata.validate(&requirements),
            Err(Error::RepositoryLinkRequired)
        );

        requirements.repository_required = false;
        assert_eq!(metadata.validate(&requirements), Ok(()));
    }

    #[test]
    fn a_missing_demo_video_is_rejected_only_when_it_was_asked_for() {
        let env = Env::default();
        let mut metadata = metadata(&env);
        metadata.demo_video_url = String::from_str(&env, "");

        let mut requirements = SubmissionRequirements::code_and_video();
        assert_eq!(
            metadata.validate(&requirements),
            Err(Error::DemoVideoLinkRequired)
        );

        requirements.demo_video_required = false;
        assert_eq!(metadata.validate(&requirements), Ok(()));
    }

    #[test]
    fn a_missing_live_url_is_rejected_only_when_it_was_asked_for() {
        let env = Env::default();
        let mut metadata = metadata(&env);
        metadata.live_url = String::from_str(&env, "");

        let mut requirements = SubmissionRequirements::code_and_video();
        assert_eq!(metadata.validate(&requirements), Ok(()));

        requirements.live_url_required = true;
        assert_eq!(
            metadata.validate(&requirements),
            Err(Error::LiveUrlRequired)
        );
    }

    #[test]
    fn a_design_event_can_ask_for_nothing_but_a_name() {
        let env = Env::default();
        let requirements = SubmissionRequirements {
            repository_required: false,
            demo_video_required: false,
            live_url_required: false,
        };

        let mut metadata = metadata(&env);
        metadata.repository_url = String::from_str(&env, "");
        metadata.demo_video_url = String::from_str(&env, "");
        metadata.live_url = String::from_str(&env, "");

        assert_eq!(metadata.validate(&requirements), Ok(()));
    }

    #[test]
    fn the_common_setup_asks_for_code_and_a_video() {
        let requirements = SubmissionRequirements::code_and_video();

        assert!(requirements.repository_required);
        assert!(requirements.demo_video_required);
        assert!(!requirements.live_url_required);
    }
}
