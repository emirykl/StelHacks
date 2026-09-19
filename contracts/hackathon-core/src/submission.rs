use soroban_sdk::{contracttype, BytesN, Env, String, Symbol};

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

/// Whether a submission still counts.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum SubmissionStatus {
    /// In the running.
    Valid = 0,
    /// Ruled out during the screening round. The project keeps its page and its
    /// reason; it is never deleted.
    Invalidated = 1,
}

/// A team's entry, as the contract records it.
///
/// The write up itself lives off chain under `uri`, and what sits here is its
/// digest. That is the whole trick of the submission lock: at the deadline this
/// digest stops being writable, so the project a judge scores is provably the
/// project that was entered, without the chain ever paying to store a video
/// link or a paragraph of prose.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Submission {
    /// The team this entry belongs to.
    pub team: u32,
    /// The track it competes in.
    pub track: Symbol,
    /// Digest of the metadata, computed over the fields of
    /// [`SubmissionMetadata`].
    pub metadata_hash: BytesN<32>,
    /// Where that metadata can be fetched.
    pub uri: String,
    /// When the entry first arrived.
    ///
    /// Later edits do not move this. Submission order is the last step of the
    /// tie break chain, so a team that edits a typo an hour before the deadline
    /// would otherwise lose the place their early entry earned them.
    pub submitted_at: u64,
    /// When it was last edited.
    pub updated_at: u64,
    pub status: SubmissionStatus,
    /// Digest of the written reason when a submission is ruled out; all zeroes
    /// otherwise.
    pub reason: BytesN<32>,
}

impl Submission {
    /// A new entry.
    pub fn new(
        env: &Env,
        team: u32,
        track: Symbol,
        metadata_hash: BytesN<32>,
        uri: String,
        now: u64,
    ) -> Submission {
        Submission {
            team,
            track,
            metadata_hash,
            uri,
            submitted_at: now,
            updated_at: now,
            status: SubmissionStatus::Valid,
            reason: BytesN::from_array(env, &[0u8; 32]),
        }
    }

    /// Replaces what the entry points at, keeping its place in the order.
    pub fn revise(
        &self,
        track: Symbol,
        metadata_hash: BytesN<32>,
        uri: String,
        now: u64,
    ) -> Submission {
        Submission {
            team: self.team,
            track,
            metadata_hash,
            uri,
            submitted_at: self.submitted_at,
            updated_at: now,
            status: self.status,
            reason: self.reason.clone(),
        }
    }

    /// Rules the entry out, against the reason given for it.
    pub fn invalidate(&self, reason: BytesN<32>) -> Result<Submission, Error> {
        if self.status == SubmissionStatus::Invalidated {
            return Err(Error::AlreadyInvalidated);
        }

        Ok(Submission {
            team: self.team,
            track: self.track.clone(),
            metadata_hash: self.metadata_hash.clone(),
            uri: self.uri.clone(),
            submitted_at: self.submitted_at,
            updated_at: self.updated_at,
            status: SubmissionStatus::Invalidated,
            reason,
        })
    }

    pub fn is_valid(&self) -> bool {
        self.status == SubmissionStatus::Valid
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

    #[test]
    fn a_new_entry_is_valid_and_carries_no_reason() {
        let env = Env::default();
        let submission = Submission::new(
            &env,
            1,
            symbol_short!("payments"),
            BytesN::from_array(&env, &[1u8; 32]),
            String::from_str(&env, "ipfs://cid"),
            100,
        );

        assert!(submission.is_valid());
        assert_eq!(submission.submitted_at, 100);
        assert_eq!(submission.updated_at, 100);
    }

    /// Editing must not buy a better place in the tie break, so the moment the
    /// entry first arrived is the one that sticks.
    #[test]
    fn revising_an_entry_leaves_its_place_in_the_order_alone() {
        let env = Env::default();
        let original = Submission::new(
            &env,
            1,
            symbol_short!("payments"),
            BytesN::from_array(&env, &[1u8; 32]),
            String::from_str(&env, "ipfs://one"),
            100,
        );

        let revised = original.revise(
            symbol_short!("defi"),
            BytesN::from_array(&env, &[2u8; 32]),
            String::from_str(&env, "ipfs://two"),
            500,
        );

        assert_eq!(revised.submitted_at, 100);
        assert_eq!(revised.updated_at, 500);
        assert_eq!(revised.track, symbol_short!("defi"));
        assert_eq!(revised.metadata_hash, BytesN::from_array(&env, &[2u8; 32]));
    }

    #[test]
    fn an_entry_ruled_out_keeps_everything_but_its_standing() {
        let env = Env::default();
        let reason = BytesN::from_array(&env, &[7u8; 32]);
        let submission = Submission::new(
            &env,
            1,
            symbol_short!("payments"),
            BytesN::from_array(&env, &[1u8; 32]),
            String::from_str(&env, "ipfs://cid"),
            100,
        );

        let ruled_out = submission.invalidate(reason.clone()).unwrap();

        assert!(!ruled_out.is_valid());
        assert_eq!(ruled_out.reason, reason);
        assert_eq!(ruled_out.metadata_hash, submission.metadata_hash);
        assert_eq!(ruled_out.submitted_at, submission.submitted_at);
    }

    #[test]
    fn an_entry_cannot_be_ruled_out_twice() {
        let env = Env::default();
        let reason = BytesN::from_array(&env, &[7u8; 32]);
        let ruled_out = Submission::new(
            &env,
            1,
            symbol_short!("payments"),
            BytesN::from_array(&env, &[1u8; 32]),
            String::from_str(&env, "ipfs://cid"),
            100,
        )
        .invalidate(reason.clone())
        .unwrap();

        assert_eq!(
            ruled_out.invalidate(reason).err(),
            Some(Error::AlreadyInvalidated)
        );
    }
}
