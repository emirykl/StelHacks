use soroban_sdk::contracttype;

/// The stages a hackathon walks through, in order.
///
/// A hackathon only ever moves forward and every stage has exactly one legal
/// successor, so a caller can never skip a gate by picking a target state
/// itself.
///
/// The community vote is deliberately not a stage of its own. It is a timed
/// window inside [`Phase::Judging`], opened by a UTC timestamp the organizer
/// chose before the lock, usually right after the presentations while the
/// judges are scoring. Both the scorecards and the ballots stay sealed until
/// [`Phase::Reveal`] opens them together, which keeps the community signal
/// independent of the judges rather than an echo of a ranking it already saw.
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
    /// Judges score their assigned projects and eligible wallets cast their
    /// community ballots, both sealed.
    Judging = 5,
    /// Every scorecard and every ballot is published at once.
    Reveal = 6,
    /// The contract computes the ranking from the locked formula.
    Finalization = 7,
    /// The vault pays the winners.
    Settlement = 8,
    /// The proof page is permanent and nothing can change.
    Completed = 9,
    /// Ended early under the cancellation policy declared before the lock.
    Cancelled = 10,
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

    /// Whether sealed input, scorecards and ballots alike, is being collected.
    pub fn is_sealed_input(self) -> bool {
        matches!(self, Phase::Judging)
    }

    /// The one phase this phase may advance to.
    pub fn next(self) -> Option<Phase> {
        let next = match self {
            Phase::Draft => Phase::Funding,
            Phase::Funding => Phase::Registration,
            Phase::Registration => Phase::Submission,
            Phase::Submission => Phase::Screening,
            Phase::Screening => Phase::Judging,
            Phase::Judging => Phase::Reveal,
            Phase::Reveal => Phase::Finalization,
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

    /// Walking from the draft must visit every stage exactly once and stop at
    /// completion.
    #[test]
    fn full_sequence_reaches_completion() {
        let expected = [
            Phase::Funding,
            Phase::Registration,
            Phase::Submission,
            Phase::Screening,
            Phase::Judging,
            Phase::Reveal,
            Phase::Finalization,
            Phase::Settlement,
            Phase::Completed,
        ];

        let mut phase = Phase::Draft;
        for step in expected {
            phase = phase.next().expect("sequence ended early");
            assert_eq!(phase, step);
        }

        assert_eq!(phase.next(), None);
    }

    #[test]
    fn terminal_phases_do_not_move() {
        assert!(Phase::Completed.is_terminal());
        assert!(Phase::Cancelled.is_terminal());
        assert_eq!(Phase::Completed.next(), None);
        assert_eq!(Phase::Cancelled.next(), None);
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
    fn scorecards_and_ballots_share_one_sealed_phase() {
        assert!(Phase::Judging.is_sealed_input());
        assert!(!Phase::Reveal.is_sealed_input());
        assert!(!Phase::Screening.is_sealed_input());
    }

    #[test]
    fn a_running_hackathon_can_still_be_cancelled() {
        assert!(Phase::Draft.can_cancel());
        assert!(Phase::Judging.can_cancel());
        assert!(Phase::Settlement.can_cancel());
    }
}
