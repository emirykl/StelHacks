use soroban_sdk::contracttype;

/// The stages a hackathon walks through, in order.
///
/// A hackathon only ever moves forward. Every stage has exactly one legal
/// successor, so a caller can never skip a gate by picking a target state
/// itself. The single conditional step is [`Phase::Reveal`], which goes
/// straight to [`Phase::Finalization`] when the constitution gives the
/// community no share of the final score.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Phase {
    /// Configuration is still being edited and nothing is binding yet.
    Draft = 0,
    /// The prize is being deposited and full funding is being verified.
    Funding = 1,
    /// Participants sign up and form teams.
    Registration = 2,
    /// Projects are submitted and pinned at the deadline.
    Submission = 3,
    /// The organizer runs the screening round for spam and rule breaches.
    Screening = 4,
    /// Judges score their assigned projects, sealed from each other.
    Judging = 5,
    /// Every scorecard is published at once.
    Reveal = 6,
    /// Eligible wallets cast their single community vote.
    CommunityVote = 7,
    /// The contract computes the ranking from the locked formula.
    Finalization = 8,
    /// The vault pays the winners.
    Settlement = 9,
    /// The proof page is permanent and nothing can change.
    Completed = 10,
    /// Ended early under the cancellation policy declared before the lock.
    Cancelled = 11,
}

impl Phase {
    /// Whether the hackathon has come to rest and can no longer move.
    pub fn is_terminal(self) -> bool {
        matches!(self, Phase::Completed | Phase::Cancelled)
    }

    /// Whether the constitution is still editable in this phase.
    pub fn is_configurable(self) -> bool {
        matches!(self, Phase::Draft)
    }

    /// The one phase this phase may advance to.
    ///
    /// `community_vote_enabled` reflects the locked vote split: when the
    /// community share is zero there is no vote to run and the reveal leads
    /// directly into finalization.
    pub fn next(self, community_vote_enabled: bool) -> Option<Phase> {
        let next = match self {
            Phase::Draft => Phase::Funding,
            Phase::Funding => Phase::Registration,
            Phase::Registration => Phase::Submission,
            Phase::Submission => Phase::Screening,
            Phase::Screening => Phase::Judging,
            Phase::Judging => Phase::Reveal,
            Phase::Reveal => {
                if community_vote_enabled {
                    Phase::CommunityVote
                } else {
                    Phase::Finalization
                }
            }
            Phase::CommunityVote => Phase::Finalization,
            Phase::Finalization => Phase::Settlement,
            Phase::Settlement => Phase::Completed,
            Phase::Completed | Phase::Cancelled => return None,
        };

        Some(next)
    }

    /// Cancellation is a sideways exit rather than a step in the sequence, and
    /// it is only available while the hackathon is still running.
    pub fn can_cancel(self) -> bool {
        !self.is_terminal()
    }
}

#[cfg(test)]
mod test {
    use super::Phase;

    /// Walking from the draft with the community vote enabled must visit every
    /// stage exactly once and stop at completion.
    #[test]
    fn full_sequence_reaches_completion() {
        let expected = [
            Phase::Funding,
            Phase::Registration,
            Phase::Submission,
            Phase::Screening,
            Phase::Judging,
            Phase::Reveal,
            Phase::CommunityVote,
            Phase::Finalization,
            Phase::Settlement,
            Phase::Completed,
        ];

        let mut phase = Phase::Draft;
        for step in expected {
            phase = phase.next(true).expect("sequence ended early");
            assert_eq!(phase, step);
        }

        assert_eq!(phase.next(true), None);
    }

    #[test]
    fn reveal_skips_the_community_vote_when_it_is_disabled() {
        assert_eq!(Phase::Reveal.next(false), Some(Phase::Finalization));
        assert_eq!(Phase::Reveal.next(true), Some(Phase::CommunityVote));
    }

    #[test]
    fn terminal_phases_do_not_move() {
        assert!(Phase::Completed.is_terminal());
        assert!(Phase::Cancelled.is_terminal());
        assert_eq!(Phase::Completed.next(true), None);
        assert_eq!(Phase::Cancelled.next(true), None);
        assert!(!Phase::Completed.can_cancel());
        assert!(!Phase::Cancelled.can_cancel());
    }

    #[test]
    fn only_the_draft_is_configurable() {
        assert!(Phase::Draft.is_configurable());
        assert!(!Phase::Funding.is_configurable());
        assert!(!Phase::Judging.is_configurable());
    }

    #[test]
    fn a_running_hackathon_can_still_be_cancelled() {
        assert!(Phase::Draft.can_cancel());
        assert!(Phase::Judging.can_cancel());
        assert!(Phase::Settlement.can_cancel());
    }
}
