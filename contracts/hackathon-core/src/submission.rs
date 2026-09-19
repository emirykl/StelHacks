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
///
/// Checking these fields against [`SubmissionRequirements`] is the SDK's job,
/// not this contract's. The metadata never reaches the chain, only its digest
/// does, so a contract side check would be validating something it cannot see.
/// The SDK runs it before computing the hash, where it can also say which field
/// is missing rather than only that one is.
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
    /// Removed after the screening round, through the disqualification process.
    ///
    /// Kept apart from `Invalidated` rather than folded into it, because the two
    /// carry very different weight. Screening is one organizer's call on an
    /// entry nobody has scored yet; a disqualification takes a stated reason, a
    /// window for the team to answer, and a bench of judges signing, and a page
    /// that showed them as the same thing would flatter the first and slander
    /// the second.
    Disqualified = 2,
}

/// A case for removing an entry after the screening round has closed.
///
/// This is the heaviest power in the product, so every condition the PRD
/// attaches to it is a field here rather than a promise made elsewhere: the
/// reason is recorded before anything happens, the team gets a window to answer
/// on the record, judges other than the organizer have to sign, and only after
/// the window closes does anyone find out whether it carried. A case that
/// gathers no signatures ends with the project still in the running, because a
/// team that entered is in unless somebody clears the bar to remove them.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisqualificationCase {
    /// The entry the case is against.
    pub team: u32,
    /// When it was opened, which is where the appeal window counts from.
    pub opened_at: u64,
    /// Digest of the written reason.
    pub reason: BytesN<32>,
    /// Digest of the team's written answer; all zeroes until they file one.
    pub appeal: BytesN<32>,
    /// When they filed it, zero until then.
    pub appealed_at: u64,
    /// How many judges have signed.
    pub approvals: u32,
    /// Whether it has been settled one way or the other.
    pub resolved: bool,
}

impl DisqualificationCase {
    /// A case just opened, with nothing decided and no answer yet.
    pub fn open(env: &Env, team: u32, reason: BytesN<32>, now: u64) -> DisqualificationCase {
        DisqualificationCase {
            team,
            opened_at: now,
            reason,
            appeal: BytesN::from_array(env, &[0u8; 32]),
            appealed_at: 0,
            approvals: 0,
            resolved: false,
        }
    }

    /// Whether the team still has time to answer.
    pub fn appeal_window_open(&self, now: u64, window: u64) -> bool {
        now < self.opened_at + window
    }
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
        self.rule_out(SubmissionStatus::Invalidated, reason)
    }

    /// Removes the entry at the end of a disqualification case.
    pub fn disqualify(&self, reason: BytesN<32>) -> Result<Submission, Error> {
        self.rule_out(SubmissionStatus::Disqualified, reason)
    }

    /// Takes an entry out of the running, whichever route got it there.
    ///
    /// An entry already out cannot be taken out again, by either route. The two
    /// processes can overlap in time, and a second ruling would overwrite the
    /// first one's reason, leaving the page showing an explanation that belongs
    /// to a decision nobody made.
    fn rule_out(&self, status: SubmissionStatus, reason: BytesN<32>) -> Result<Submission, Error> {
        if !self.is_valid() {
            return Err(Error::SubmissionNotEligible);
        }

        Ok(Submission {
            team: self.team,
            track: self.track.clone(),
            metadata_hash: self.metadata_hash.clone(),
            uri: self.uri.clone(),
            submitted_at: self.submitted_at,
            updated_at: self.updated_at,
            status,
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

    /// Screening and disqualification reach the same outcome by very different
    /// roads, so the page has to be able to tell a reader which one applies.
    #[test]
    fn a_disqualified_entry_is_marked_apart_from_a_screened_one() {
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

        let removed = submission.disqualify(reason.clone()).unwrap();

        assert_eq!(removed.status, SubmissionStatus::Disqualified);
        assert!(!removed.is_valid());
        assert_eq!(removed.reason, reason);
        assert_eq!(removed.metadata_hash, submission.metadata_hash);
    }

    /// Either route closes the entry to the other. A second ruling would
    /// overwrite the first one's reason, leaving the page carrying an
    /// explanation that belongs to a decision nobody made.
    #[test]
    fn an_entry_out_by_one_route_cannot_be_taken_out_by_the_other() {
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

        let screened = submission.invalidate(reason.clone()).unwrap();
        assert_eq!(
            screened.disqualify(reason.clone()).err(),
            Some(Error::SubmissionNotEligible)
        );

        let disqualified = submission.disqualify(reason.clone()).unwrap();
        assert_eq!(
            disqualified.invalidate(reason).err(),
            Some(Error::SubmissionNotEligible)
        );
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
            Some(Error::SubmissionNotEligible)
        );
    }
}
