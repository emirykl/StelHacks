use soroban_sdk::contracttype;

use crate::constitution::{Deadline, ExtensionPolicy, Schedule};
use crate::errors::Error;
use crate::phase::Phase;

/// How much of its extension allowance one deadline has spent.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct ExtensionUsage {
    /// How many times this deadline has been moved.
    pub times: u32,
    /// Total seconds gained across those moves.
    pub seconds_added: u64,
}

impl ExtensionUsage {
    /// A deadline that still stands where it was announced.
    pub fn unused() -> ExtensionUsage {
        ExtensionUsage {
            times: 0,
            seconds_added: 0,
        }
    }

    /// Records one more extension.
    pub fn record(&self, seconds_added: u64) -> Result<ExtensionUsage, Error> {
        Ok(ExtensionUsage {
            times: self
                .times
                .checked_add(1)
                .ok_or(Error::ExtensionLimitReached)?,
            seconds_added: self
                .seconds_added
                .checked_add(seconds_added)
                .ok_or(Error::ExtensionLimitReached)?,
        })
    }
}

/// Everything about a hackathon that changes while it runs.
///
/// This sits beside the constitution rather than inside it. The constitution is
/// hashed and frozen; if the schedule in force lived there, moving a deadline
/// by an hour after an outage would break the digest and make a legitimate,
/// announced, judge approved extension look identical to tampering. So the
/// announced schedule stays locked in the constitution, the schedule actually
/// in force lives here, and the difference between them is a public list of
/// recorded extensions.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HackathonState {
    /// Where the hackathon is in its lifecycle.
    pub phase: Phase,
    /// The deadlines actually in force: the announced ones plus every recorded
    /// extension.
    pub schedule: Schedule,
    /// Whether settlement is being held by the pre declared authority. Scores
    /// are untouchable either way; this only stops money from moving.
    pub settlement_paused: bool,
    /// When the ranking closed, which is where the safety window counts from.
    /// Zero until then.
    pub finalized_at: u64,
}

impl HackathonState {
    /// A freshly created hackathon, still being configured.
    pub fn draft(schedule: Schedule) -> HackathonState {
        HackathonState {
            phase: Phase::Draft,
            schedule,
            settlement_paused: false,
            finalized_at: 0,
        }
    }

    /// Moves to the next phase, refusing to move early.
    ///
    /// A phase that ends on the clock cannot end before that moment, so nobody
    /// can cut a window short by advancing the state machine. A phase that ends
    /// on an action is advanced by whichever entry point performs that action,
    /// and reaches here having already checked its own conditions.
    pub fn advance(&self, now: u64) -> Result<HackathonState, Error> {
        let next = self.phase.next().ok_or(Error::WrongPhase)?;

        if let Some(deadline) = self.phase.closing_deadline() {
            if now < self.schedule.deadline(deadline) {
                return Err(Error::DeadlineNotReached);
            }
        }

        Ok(HackathonState {
            phase: next,
            schedule: self.schedule.clone(),
            settlement_paused: self.settlement_paused,
            finalized_at: self.finalized_at,
        })
    }

    /// Moves one deadline back, within the allowance the organizer announced.
    ///
    /// Returns the new state alongside the updated usage, so the caller writes
    /// both or neither. The schedule is revalidated afterwards because moving
    /// one deadline past another would leave a schedule that no longer runs in
    /// order, and a submission deadline pushed beyond the judging deadline is
    /// exactly the kind of well meant extension that strands an event.
    pub fn extend(
        &self,
        deadline: Deadline,
        moved_to: u64,
        now: u64,
        policy: &ExtensionPolicy,
        usage: &ExtensionUsage,
        community_vote_enabled: bool,
    ) -> Result<(HackathonState, ExtensionUsage), Error> {
        let added = self.schedule.check_extension(deadline, moved_to, now)?;

        policy.check(usage.times, usage.seconds_added, added)?;

        let schedule = self.schedule.with_deadline(deadline, moved_to);
        schedule.validate(community_vote_enabled)?;

        let state = HackathonState {
            phase: self.phase,
            schedule,
            settlement_paused: self.settlement_paused,
            finalized_at: self.finalized_at,
        };

        Ok((state, usage.record(added)?))
    }
}

#[cfg(test)]
mod test {
    use super::*;

    use crate::fixtures::{sample_schedule as schedule, DAY, HOUR};

    fn policy() -> ExtensionPolicy {
        ExtensionPolicy {
            max_extensions_per_deadline: 2,
            max_total_seconds_per_deadline: 2 * DAY,
        }
    }

    fn state_at(phase: Phase) -> HackathonState {
        HackathonState {
            phase,
            schedule: schedule(),
            settlement_paused: false,
            finalized_at: 0,
        }
    }

    #[test]
    fn a_new_hackathon_starts_as_a_draft() {
        let state = HackathonState::draft(schedule());

        assert_eq!(state.phase, Phase::Draft);
        assert!(!state.settlement_paused);
    }

    #[test]
    fn a_phase_that_ends_on_an_action_advances_at_any_time() {
        let state = state_at(Phase::Draft);

        assert_eq!(state.advance(0).unwrap().phase, Phase::Funding);
    }

    #[test]
    fn a_phase_that_ends_on_the_clock_refuses_to_end_early() {
        let state = state_at(Phase::Open);
        let deadline = schedule().submission_closes_at;

        assert_eq!(state.advance(deadline - 1), Err(Error::DeadlineNotReached));
        assert_eq!(state.advance(deadline).unwrap().phase, Phase::Screening);
    }

    #[test]
    fn screening_and_judging_hold_the_same_line() {
        let screening = state_at(Phase::Screening);
        assert_eq!(
            screening.advance(schedule().screening_closes_at - 1),
            Err(Error::DeadlineNotReached)
        );
        assert_eq!(
            screening
                .advance(schedule().screening_closes_at)
                .unwrap()
                .phase,
            Phase::Judging
        );

        let judging = state_at(Phase::Judging);
        assert_eq!(
            judging.advance(schedule().judging_closes_at - 1),
            Err(Error::DeadlineNotReached)
        );
        assert_eq!(
            judging.advance(schedule().judging_closes_at).unwrap().phase,
            Phase::Reveal
        );
    }

    #[test]
    fn a_finished_hackathon_cannot_advance() {
        assert_eq!(
            state_at(Phase::Completed).advance(u64::MAX),
            Err(Error::WrongPhase)
        );
        assert_eq!(
            state_at(Phase::Cancelled).advance(u64::MAX),
            Err(Error::WrongPhase)
        );
    }

    #[test]
    fn advancing_carries_the_schedule_and_the_pause_along() {
        let mut state = state_at(Phase::Reveal);
        state.settlement_paused = true;

        let advanced = state.advance(0).unwrap();

        assert_eq!(advanced.phase, Phase::Finalization);
        assert_eq!(advanced.schedule, state.schedule);
        assert!(advanced.settlement_paused);
    }

    #[test]
    fn an_extension_moves_the_deadline_and_records_the_cost() {
        let state = state_at(Phase::Open);
        let moved_to = schedule().submission_closes_at + DAY;

        let (extended, usage) = state
            .extend(
                Deadline::Submission,
                moved_to,
                1_008 * DAY,
                &policy(),
                &ExtensionUsage::unused(),
                true,
            )
            .unwrap();

        assert_eq!(extended.schedule.submission_closes_at, moved_to);
        assert_eq!(usage.times, 1);
        assert_eq!(usage.seconds_added, DAY);
        assert_eq!(extended.phase, Phase::Open);
    }

    #[test]
    fn an_extension_past_the_allowance_is_refused() {
        let state = state_at(Phase::Open);
        let spent = ExtensionUsage {
            times: 2,
            seconds_added: 2 * DAY,
        };

        assert_eq!(
            state.extend(
                Deadline::Submission,
                schedule().submission_closes_at + HOUR,
                1_008 * DAY,
                &policy(),
                &spent,
                true,
            ),
            Err(Error::ExtensionLimitReached)
        );
    }

    /// The check that matters most here. Pushing submission past screening
    /// leaves a schedule that cannot run, and it is the shape a well meant
    /// extension takes when the organizer only looks at the deadline they are
    /// moving.
    #[test]
    fn an_extension_that_overruns_the_next_deadline_is_refused() {
        let state = state_at(Phase::Open);
        let past_screening = schedule().screening_closes_at + HOUR;

        // A generous allowance, so the only thing left to refuse the move is
        // the schedule falling out of order.
        let generous = ExtensionPolicy {
            max_extensions_per_deadline: 5,
            max_total_seconds_per_deadline: 30 * DAY,
        };

        assert_eq!(
            state.extend(
                Deadline::Submission,
                past_screening,
                1_008 * DAY,
                &generous,
                &ExtensionUsage::unused(),
                true,
            ),
            Err(Error::ScheduleInvalid)
        );
    }

    #[test]
    fn a_deadline_that_has_passed_cannot_be_reopened() {
        let state = state_at(Phase::Open);

        assert_eq!(
            state.extend(
                Deadline::Submission,
                schedule().submission_closes_at + HOUR,
                schedule().submission_closes_at,
                &policy(),
                &ExtensionUsage::unused(),
                true,
            ),
            Err(Error::DeadlinePassed)
        );
    }

    #[test]
    fn usage_accumulates_across_extensions() {
        let unused = ExtensionUsage::unused();
        let once = unused.record(HOUR).unwrap();
        let twice = once.record(2 * HOUR).unwrap();

        assert_eq!(twice.times, 2);
        assert_eq!(twice.seconds_added, 3 * HOUR);
    }
}
