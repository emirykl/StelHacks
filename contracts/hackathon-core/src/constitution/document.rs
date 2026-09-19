use soroban_sdk::{contracttype, Address, BytesN, Symbol, Vec};

use crate::constitution::discretion::{DiscretionPolicy, RefundRoute};
use crate::constitution::judging::JudgingMode;
use crate::constitution::ranking::{validate_tie_break, TieBreakRule};
use crate::constitution::schedule::{ExtensionPolicy, Schedule};
use crate::constitution::scoring::{total_prize_amount, validate_prize_tiers, PrizeTier, Track};
use crate::constitution::visibility::ProjectVisibility;
use crate::constitution::voting::VotePolicy;
use crate::errors::Error;
use crate::submission::SubmissionRequirements;

/// The format version of the constitution, so a reader can tell which shape it
/// is looking at once this structure has changed a few times.
pub const CONSTITUTION_VERSION: u32 = 1;

/// A judge and the tracks they are responsible for.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct JudgeAssignment {
    pub judge: Address,
    /// Identifiers of the tracks this judge scores. A judge with no track has
    /// no reason to be authorized, so an empty list is rejected.
    pub tracks: Vec<Symbol>,
}

/// Everything that decides the outcome of a hackathon.
///
/// This is signed and hashed before registration opens, and from that moment
/// none of it can change. Anyone can rebuild the same structure from the public
/// page, hash it themselves, and compare against the hash stored on chain; if
/// the two differ, the competition is not the one that was announced.
///
/// Everything that does not decide an outcome, meaning the name, the logo, the
/// long description and the judge biographies, is deliberately absent. Those
/// live off chain under [`Constitution::metadata_hash`], so editing a typo in a
/// description never has to look like tampering with the rules.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Constitution {
    /// Format version, see [`CONSTITUTION_VERSION`].
    pub version: u32,
    /// Hash of the deterministically serialized off chain metadata.
    pub metadata_hash: BytesN<32>,
    /// The token the prize is denominated and paid in.
    pub prize_asset: Address,
    /// Competition tracks, each with its own rubric.
    pub tracks: Vec<Track>,
    /// Authorized judges and their track assignments.
    pub judges: Vec<JudgeAssignment>,
    /// Valid scorecards a project needs before the result can be finalized.
    pub judge_quorum: u32,
    /// How scorecards are sealed until the reveal.
    pub judging_mode: JudgingMode,
    /// How the final score is split between judges and the crowd.
    pub vote: VotePolicy,
    /// Who may read the submitted projects while the event runs.
    pub visibility: ProjectVisibility,
    /// Which links a team has to supply with their project.
    pub submission_requirements: SubmissionRequirements,
    /// Payable positions per track.
    pub prize_tiers: Vec<PrizeTier>,
    /// The chain that separates two projects on the same score.
    pub tie_break: Vec<TieBreakRule>,
    /// Every power the organizer keeps after the lock.
    pub discretion: DiscretionPolicy,
    /// The announced deadlines.
    pub schedule: Schedule,
    /// How far those deadlines may later move.
    pub extensions: ExtensionPolicy,
}

impl Constitution {
    /// How many judges are authorized.
    pub fn judge_count(&self) -> u32 {
        self.judges.len()
    }

    /// Whether a community vote runs at all.
    pub fn community_vote_enabled(&self) -> bool {
        self.vote.community_vote_enabled()
    }

    /// The total the vault must hold before the hackathon can be published.
    pub fn required_funding(&self) -> Result<i128, Error> {
        total_prize_amount(&self.prize_tiers)
    }

    /// Looks up a track by identifier.
    pub fn track(&self, id: &Symbol) -> Option<Track> {
        self.tracks.iter().find(|track| &track.id == id)
    }

    /// Whether this address may score in this hackathon.
    pub fn is_judge(&self, who: &Address) -> bool {
        self.judges
            .iter()
            .any(|assignment| &assignment.judge == who)
    }

    /// Whether this judge is responsible for this track.
    pub fn judges_track(&self, who: &Address, track_id: &Symbol) -> bool {
        self.judges.iter().any(|assignment| {
            &assignment.judge == who && assignment.tracks.iter().any(|id| &id == track_id)
        })
    }

    /// How many judges are assigned to a track.
    pub fn judges_on_track(&self, track_id: &Symbol) -> u32 {
        let mut count = 0;
        for assignment in self.judges.iter() {
            if assignment.tracks.iter().any(|id| &id == track_id) {
                count += 1;
            }
        }

        count
    }

    /// Rejects a constitution that cannot run to a defined result.
    ///
    /// Each part validates itself first, then the checks that only make sense
    /// across parts run. Those cross checks are the point of this function: a
    /// setting is rarely wrong on its own, it is wrong next to another setting,
    /// and the moment to catch that is before anybody writes code against it.
    pub fn validate(&self) -> Result<(), Error> {
        self.validate_tracks()?;
        self.validate_judges()?;

        self.vote.validate()?;
        self.discretion.validate(self.judge_count())?;
        self.extensions.validate()?;
        self.schedule.validate(self.community_vote_enabled())?;

        validate_prize_tiers(&self.prize_tiers)?;
        self.required_funding()?;

        for tier in self.prize_tiers.iter() {
            if self.track(&tier.track).is_none() {
                return Err(Error::TrackNotFound);
            }
        }

        validate_tie_break(&self.tie_break, &self.tracks, self.community_vote_enabled())?;

        // Asking participants to vote on projects they are not allowed to open
        // turns the ballot into a contest between team names.
        if self.community_vote_enabled() && !self.visibility.supports_community_vote() {
            return Err(Error::VisibilityConflictsWithVote);
        }

        // Spreading an unawarded prize across the remaining tracks needs a
        // remaining track to exist.
        if self.discretion.no_award_refund == RefundRoute::RemainingTracks && self.tracks.len() < 2
        {
            return Err(Error::NoAwardRefundNeedsAnotherTrack);
        }

        Ok(())
    }

    fn validate_tracks(&self) -> Result<(), Error> {
        if self.tracks.is_empty() {
            return Err(Error::TracksMissing);
        }

        for (index, track) in self.tracks.iter().enumerate() {
            track.validate()?;

            for other in self.tracks.iter().skip(index + 1) {
                if other.id == track.id {
                    return Err(Error::TrackAlreadyExists);
                }
            }
        }

        Ok(())
    }

    fn validate_judges(&self) -> Result<(), Error> {
        if self.judges.is_empty() {
            return Err(Error::JudgesMissing);
        }

        for (index, assignment) in self.judges.iter().enumerate() {
            if assignment.tracks.is_empty() {
                return Err(Error::JudgeNotAssigned);
            }

            for track_id in assignment.tracks.iter() {
                if self.track(&track_id).is_none() {
                    return Err(Error::TrackNotFound);
                }
            }

            for other in self.judges.iter().skip(index + 1) {
                if other.judge == assignment.judge {
                    return Err(Error::JudgeAlreadyAssigned);
                }
            }
        }

        if self.judge_quorum == 0 || self.judge_quorum > self.judge_count() {
            return Err(Error::JudgeQuorumInvalid);
        }

        // A quorum the track can never reach would strand every project in it.
        // The check is skipped when scorecards carry no weight, because then
        // the quorum is not a condition for finalizing anyway.
        if self.vote.judge_score_counts() {
            for track in self.tracks.iter() {
                if self.judges_on_track(&track.id) < self.judge_quorum {
                    return Err(Error::JudgeQuorumInvalid);
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::fixtures::{sample_constitution, HOUR};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{symbol_short, vec, Address, Env};

    #[test]
    fn a_complete_constitution_is_accepted() {
        let env = Env::default();
        let constitution = sample_constitution(&env);

        assert_eq!(constitution.validate(), Ok(()));
        assert_eq!(constitution.judge_count(), 3);
        assert_eq!(constitution.required_funding(), Ok(10_000));
        assert!(constitution.community_vote_enabled());
    }

    #[test]
    fn a_hackathon_without_a_track_has_nothing_to_judge() {
        let env = Env::default();
        let mut constitution = sample_constitution(&env);
        constitution.tracks = vec![&env];

        assert_eq!(constitution.validate(), Err(Error::TracksMissing));
    }

    #[test]
    fn a_repeated_track_identifier_is_rejected() {
        let env = Env::default();
        let mut constitution = sample_constitution(&env);
        let duplicate = constitution.tracks.get(0).unwrap();
        constitution.tracks.set(1, duplicate);

        assert_eq!(constitution.validate(), Err(Error::TrackAlreadyExists));
    }

    #[test]
    fn a_hackathon_without_judges_is_rejected() {
        let env = Env::default();
        let mut constitution = sample_constitution(&env);
        constitution.judges = vec![&env];

        assert_eq!(constitution.validate(), Err(Error::JudgesMissing));
    }

    #[test]
    fn a_judge_with_no_track_has_no_reason_to_be_authorized() {
        let env = Env::default();
        let mut constitution = sample_constitution(&env);
        let mut assignment = constitution.judges.get(0).unwrap();
        assignment.tracks = vec![&env];
        constitution.judges.set(0, assignment);

        assert_eq!(constitution.validate(), Err(Error::JudgeNotAssigned));
    }

    #[test]
    fn a_judge_assigned_to_a_track_that_does_not_exist_is_rejected() {
        let env = Env::default();
        let mut constitution = sample_constitution(&env);
        let mut assignment = constitution.judges.get(0).unwrap();
        assignment.tracks = vec![&env, symbol_short!("ghost")];
        constitution.judges.set(0, assignment);

        assert_eq!(constitution.validate(), Err(Error::TrackNotFound));
    }

    #[test]
    fn the_same_judge_cannot_be_listed_twice() {
        let env = Env::default();
        let mut constitution = sample_constitution(&env);
        let first = constitution.judges.get(0).unwrap();
        constitution.judges.set(1, first);

        assert_eq!(constitution.validate(), Err(Error::JudgeAlreadyAssigned));
    }

    #[test]
    fn a_quorum_larger_than_the_judge_bench_is_rejected() {
        let env = Env::default();
        let mut constitution = sample_constitution(&env);
        constitution.judge_quorum = 4;

        assert_eq!(constitution.validate(), Err(Error::JudgeQuorumInvalid));
    }

    #[test]
    fn a_quorum_a_single_track_cannot_reach_is_rejected() {
        let env = Env::default();
        let mut constitution = sample_constitution(&env);

        // Leave the second track with a single judge while the quorum asks for
        // three, which would strand every project in that track.
        let mut assignment = constitution.judges.get(0).unwrap();
        assignment.tracks = vec![&env, symbol_short!("payments")];
        constitution.judges.set(0, assignment);

        let mut second = constitution.judges.get(1).unwrap();
        second.tracks = vec![&env, symbol_short!("payments")];
        constitution.judges.set(1, second);

        assert_eq!(constitution.validate(), Err(Error::JudgeQuorumInvalid));
    }

    #[test]
    fn a_prize_for_a_track_that_does_not_exist_is_rejected() {
        let env = Env::default();
        let mut constitution = sample_constitution(&env);
        constitution.prize_tiers.set(
            0,
            PrizeTier {
                track: symbol_short!("ghost"),
                rank: 1,
                amount: 5_000,
            },
        );

        assert_eq!(constitution.validate(), Err(Error::TrackNotFound));
    }

    #[test]
    fn a_restricted_gallery_cannot_run_a_community_vote() {
        let env = Env::default();
        let mut constitution = sample_constitution(&env);
        constitution.visibility = ProjectVisibility::Restricted;

        assert_eq!(
            constitution.validate(),
            Err(Error::VisibilityConflictsWithVote)
        );

        constitution.visibility = ProjectVisibility::Participants;
        assert_eq!(constitution.validate(), Ok(()));
    }

    #[test]
    fn a_restricted_gallery_is_fine_without_a_community_vote() {
        let env = Env::default();
        let mut constitution = sample_constitution(&env);
        constitution.visibility = ProjectVisibility::Restricted;
        constitution.vote = VotePolicy::judges_only();

        assert_eq!(constitution.validate(), Ok(()));
    }

    #[test]
    fn spreading_an_unawarded_prize_needs_somewhere_to_spread_it() {
        let env = Env::default();
        let mut constitution = sample_constitution(&env);
        constitution.discretion.no_award_refund = RefundRoute::RemainingTracks;

        assert_eq!(constitution.validate(), Ok(()));

        // Reduce the hackathon to a single track, moving the judges and the
        // prize table with it so the only thing left wrong is the refund route.
        let single = constitution.tracks.get(0).unwrap();
        constitution.tracks = vec![&env, single];
        constitution.prize_tiers = vec![
            &env,
            PrizeTier {
                track: symbol_short!("payments"),
                rank: 1,
                amount: 5_000,
            },
        ];
        for index in 0..constitution.judges.len() {
            let mut assignment = constitution.judges.get(index).unwrap();
            assignment.tracks = vec![&env, symbol_short!("payments")];
            constitution.judges.set(index, assignment);
        }

        assert_eq!(
            constitution.validate(),
            Err(Error::NoAwardRefundNeedsAnotherTrack)
        );
    }

    #[test]
    fn a_community_tie_break_without_a_community_vote_is_rejected() {
        let env = Env::default();
        let mut constitution = sample_constitution(&env);
        constitution.vote = VotePolicy::judges_only();
        constitution.tie_break = vec![
            &env,
            TieBreakRule::CommunityScore,
            TieBreakRule::SubmissionOrder,
        ];

        assert_eq!(constitution.validate(), Err(Error::TieBreakInvalid));
    }

    #[test]
    fn judge_lookups_answer_by_address_and_track() {
        let env = Env::default();
        let constitution = sample_constitution(&env);
        let judge = constitution.judges.get(0).unwrap().judge;
        let stranger = Address::generate(&env);

        assert!(constitution.is_judge(&judge));
        assert!(!constitution.is_judge(&stranger));
        assert!(constitution.judges_track(&judge, &symbol_short!("payments")));
        assert!(!constitution.judges_track(&judge, &symbol_short!("ghost")));
        assert_eq!(constitution.judges_on_track(&symbol_short!("payments")), 3);
        assert_eq!(constitution.judges_on_track(&symbol_short!("ghost")), 0);
    }

    #[test]
    fn a_schedule_whose_vote_window_escapes_judging_is_rejected() {
        let env = Env::default();
        let mut constitution = sample_constitution(&env);
        constitution.schedule.community_vote_closes_at =
            constitution.schedule.judging_closes_at + HOUR;

        assert_eq!(constitution.validate(), Err(Error::ScheduleInvalid));
    }
}
