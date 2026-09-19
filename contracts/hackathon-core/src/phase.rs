use soroban_sdk::contracttype;

use crate::constitution::Deadline;

/// The stages a hackathon walks through, in order.
///
/// A hackathon only ever moves forward and every stage has exactly one legal
/// successor, so a caller can never skip a gate by picking a target state
/// itself.
///
/// A stage is not the same thing as a window. Two stages carry two windows
/// each, because the underlying activities genuinely overlap and pretending
/// otherwise would force a schedule nobody runs. [`Phase::Open`] holds the
/// registration window and the submission window, since people sign up and
/// start building on the same evening. [`Phase::Judging`] holds the scoring
/// window and the community vote window, both sealed, so the crowd never votes
/// with the judge table already in front of it. Each window is gated by its own
/// timestamps rather than by the stage alone.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Phase {
    /// Configuration is still being edited and nothing is binding yet.
    Draft = 0,
    /// The prize is being deposited and full funding is being verified.
    Funding = 1,
    /// The event is running: participants apply, teams form, projects arrive.
    Open = 2,
    /// The organizer works through the screening round for spam and rule
    /// breaches, before any scorecard exists to be influenced by it.
    Screening = 3,
    /// Judges score their assigned projects and eligible wallets cast their
    /// community ballots, both sealed.
    Judging = 4,
    /// Every scorecard and every ballot is published at once.
    Reveal = 5,
    /// The contract computes the ranking from the locked formula.
    Finalization = 6,
    /// The vault pays the winners.
    Settlement = 7,
    /// The proof page is permanent and nothing can change.
    Completed = 8,
    /// Ended early under the cancellation policy declared before the lock.
    Cancelled = 9,
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
            Phase::Funding => Phase::Open,
            Phase::Open => Phase::Screening,
            Phase::Screening => Phase::Judging,
            Phase::Judging => Phase::Reveal,
            Phase::Reveal => Phase::Finalization,
            Phase::Finalization => Phase::Settlement,
            Phase::Settlement => Phase::Completed,
            Phase::Completed | Phase::Cancelled => return None,
        };

        Some(next)
    }

    /// The deadline that has to pass before this phase can end.
    ///
    /// Only three stages end on the clock. The rest end when somebody does the
    /// work that closes them: locking the rules, publishing a funded hackathon,
    /// revealing the sealed input, computing the ranking, paying the winners.
    /// Returning `None` therefore means the phase is waiting on an action, not
    /// that it can be skipped.
    pub fn closing_deadline(self) -> Option<Deadline> {
        match self {
            Phase::Open => Some(Deadline::Submission),
            Phase::Screening => Some(Deadline::Screening),
            Phase::Judging => Some(Deadline::Judging),
            _ => None,
        }
    }

    /// Cancellation is a sideways exit rather than a step in the sequence, and
    /// it is only available while the hackathon is still running.
    pub fn can_cancel(self) -> bool {
        !self.is_terminal()
    }
}

#[cfg(test)]
mod test {
    use super::*;

    /// Walking from the draft must visit every stage exactly once and stop at
    /// completion.
    #[test]
    fn full_sequence_reaches_completion() {
        let expected = [
            Phase::Funding,
            Phase::Open,
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

    #[test]
    fn only_three_phases_end_on_the_clock() {
        assert_eq!(Phase::Open.closing_deadline(), Some(Deadline::Submission));
        assert_eq!(
            Phase::Screening.closing_deadline(),
            Some(Deadline::Screening)
        );
        assert_eq!(Phase::Judging.closing_deadline(), Some(Deadline::Judging));

        for phase in [
            Phase::Draft,
            Phase::Funding,
            Phase::Reveal,
            Phase::Finalization,
            Phase::Settlement,
            Phase::Completed,
            Phase::Cancelled,
        ] {
            assert_eq!(phase.closing_deadline(), None);
        }
    }
}
