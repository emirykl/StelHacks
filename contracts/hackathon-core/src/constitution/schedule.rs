use soroban_sdk::contracttype;

use crate::errors::Error;

/// The deadlines of a hackathon, as UTC ledger timestamps in seconds.
///
/// The constitution locks the schedule that was announced. Deadlines can still
/// move, but only forward, only before they pass, and only within the limits of
/// the [`ExtensionPolicy`] that was declared alongside them, so the effective
/// schedule is always the announced one plus a public list of recorded
/// extensions.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Schedule {
    /// Sign up opens for participants.
    pub registration_opens_at: u64,
    /// Sign up closes. This is also the snapshot that fixes who may vote, so a
    /// wallet created after this moment can never influence the result.
    pub registration_closes_at: u64,
    /// Teams may start filing their project.
    pub submission_opens_at: u64,
    /// Projects are pinned and no further submission is accepted.
    pub submission_closes_at: u64,
    /// The organizer has finished the screening round.
    pub screening_closes_at: u64,
    /// Scorecards and ballots are due, and the reveal becomes possible.
    pub judging_closes_at: u64,
    /// The community vote opens, typically right after the presentations while
    /// the judges are scoring. Ignored when the community has no share.
    pub community_vote_opens_at: u64,
    /// The community vote closes. Ignored when the community has no share.
    pub community_vote_closes_at: u64,
}

impl Schedule {
    /// Rejects a schedule whose deadlines do not run in a workable order.
    ///
    /// `community_vote_enabled` comes from the locked vote split. When the
    /// community has no share the two vote timestamps carry no meaning and are
    /// not checked; otherwise the vote window has to sit inside the judging
    /// window, which is what keeps the ballots sealed until the reveal.
    pub fn validate(&self, community_vote_enabled: bool) -> Result<(), Error> {
        let ordered = self.registration_opens_at < self.registration_closes_at
            && self.registration_opens_at <= self.submission_opens_at
            && self.submission_opens_at < self.submission_closes_at
            && self.registration_closes_at <= self.submission_closes_at
            && self.submission_closes_at < self.screening_closes_at
            && self.screening_closes_at < self.judging_closes_at;

        if self.registration_opens_at == 0 || !ordered {
            return Err(Error::ScheduleInvalid);
        }

        if community_vote_enabled {
            let window_fits = self.screening_closes_at <= self.community_vote_opens_at
                && self.community_vote_opens_at < self.community_vote_closes_at
                && self.community_vote_closes_at <= self.judging_closes_at;

            if !window_fits {
                return Err(Error::ScheduleInvalid);
            }
        }

        Ok(())
    }

    /// Reads the deadline a given extension request targets.
    pub fn deadline(&self, deadline: Deadline) -> u64 {
        match deadline {
            Deadline::Registration => self.registration_closes_at,
            Deadline::Submission => self.submission_closes_at,
            Deadline::Screening => self.screening_closes_at,
            Deadline::Judging => self.judging_closes_at,
            Deadline::CommunityVote => self.community_vote_closes_at,
        }
    }

    /// Returns a copy of the schedule with one deadline moved back.
    ///
    /// The caller is expected to have checked [`Schedule::check_extension`]
    /// first; this only rewrites the field.
    pub fn with_deadline(&self, deadline: Deadline, moved_to: u64) -> Schedule {
        let mut moved = self.clone();
        match deadline {
            Deadline::Registration => moved.registration_closes_at = moved_to,
            Deadline::Submission => moved.submission_closes_at = moved_to,
            Deadline::Screening => moved.screening_closes_at = moved_to,
            Deadline::Judging => moved.judging_closes_at = moved_to,
            Deadline::CommunityVote => moved.community_vote_closes_at = moved_to,
        }

        moved
    }

    /// Whether a deadline may be moved to `moved_to` at time `now`.
    ///
    /// Two rules do the work here. A deadline only ever moves forward, so an
    /// organizer can never cut a window short once people are working against
    /// it. And a deadline that has already passed is closed for good, because
    /// reopening it would let the organizer look at what came in and only then
    /// decide whether to give more time.
    pub fn check_extension(
        &self,
        deadline: Deadline,
        moved_to: u64,
        now: u64,
    ) -> Result<u64, Error> {
        let current = self.deadline(deadline);

        if now >= current {
            return Err(Error::DeadlinePassed);
        }

        if moved_to <= current {
            return Err(Error::ScheduleInvalid);
        }

        Ok(moved_to - current)
    }
}

/// The deadlines an organizer is allowed to move.
///
/// The opening timestamps are deliberately absent. Moving an opening moment
/// after the fact changes who could take part rather than how long they had.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Deadline {
    Registration = 0,
    Submission = 1,
    Screening = 2,
    Judging = 3,
    CommunityVote = 4,
}

/// How much room the organizer announced for moving deadlines.
///
/// Declaring this before the lock is the whole point: participants know up
/// front that submission can slip by at most so much, so an extension is a
/// use of a published allowance rather than a surprise.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct ExtensionPolicy {
    /// How many times a single deadline may be moved. Zero means the announced
    /// schedule is final.
    pub max_extensions_per_deadline: u32,
    /// The total number of seconds a single deadline may gain across all of
    /// its extensions.
    pub max_total_seconds_per_deadline: u64,
}

impl ExtensionPolicy {
    /// A policy that forbids any movement at all.
    pub fn fixed() -> ExtensionPolicy {
        ExtensionPolicy {
            max_extensions_per_deadline: 0,
            max_total_seconds_per_deadline: 0,
        }
    }

    /// Rejects a policy that allows extensions without a time budget, or a
    /// time budget that can never be spent.
    pub fn validate(&self) -> Result<(), Error> {
        let allows_extensions = self.max_extensions_per_deadline > 0;
        let has_budget = self.max_total_seconds_per_deadline > 0;

        if allows_extensions != has_budget {
            return Err(Error::ConstitutionInvalid);
        }

        Ok(())
    }

    /// Whether one more extension of `seconds_added` fits in the allowance,
    /// given what a deadline has already used.
    pub fn check(
        &self,
        extensions_used: u32,
        seconds_used: u64,
        seconds_added: u64,
    ) -> Result<(), Error> {
        if extensions_used >= self.max_extensions_per_deadline {
            return Err(Error::ExtensionLimitReached);
        }

        let total = seconds_used
            .checked_add(seconds_added)
            .ok_or(Error::ExtensionLimitReached)?;

        if total > self.max_total_seconds_per_deadline {
            return Err(Error::ExtensionLimitReached);
        }

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;

    const HOUR: u64 = 3_600;
    const DAY: u64 = 24 * HOUR;

    fn schedule() -> Schedule {
        Schedule {
            registration_opens_at: 1_000 * DAY,
            registration_closes_at: 1_007 * DAY,
            submission_opens_at: 1_000 * DAY,
            submission_closes_at: 1_009 * DAY,
            screening_closes_at: 1_010 * DAY,
            judging_closes_at: 1_012 * DAY,
            community_vote_opens_at: 1_010 * DAY + 2 * HOUR,
            community_vote_closes_at: 1_011 * DAY,
        }
    }

    #[test]
    fn a_schedule_in_order_is_accepted() {
        assert_eq!(schedule().validate(true), Ok(()));
    }

    #[test]
    fn registration_must_close_before_submission_does() {
        let mut schedule = schedule();
        schedule.registration_closes_at = 1_011 * DAY;

        assert_eq!(schedule.validate(true), Err(Error::ScheduleInvalid));
    }

    #[test]
    fn judging_must_come_after_screening() {
        let mut schedule = schedule();
        schedule.judging_closes_at = schedule.screening_closes_at;

        assert_eq!(schedule.validate(true), Err(Error::ScheduleInvalid));
    }

    #[test]
    fn the_vote_window_must_sit_inside_the_judging_window() {
        let mut schedule = schedule();
        schedule.community_vote_closes_at = schedule.judging_closes_at + HOUR;

        assert_eq!(schedule.validate(true), Err(Error::ScheduleInvalid));
    }

    #[test]
    fn a_vote_window_opening_before_screening_ends_is_rejected() {
        let mut schedule = schedule();
        schedule.community_vote_opens_at = schedule.submission_closes_at;

        assert_eq!(schedule.validate(true), Err(Error::ScheduleInvalid));
    }

    #[test]
    fn the_vote_window_is_ignored_when_the_community_has_no_share() {
        let mut schedule = schedule();
        schedule.community_vote_opens_at = 0;
        schedule.community_vote_closes_at = 0;

        assert_eq!(schedule.validate(false), Ok(()));
        assert_eq!(schedule.validate(true), Err(Error::ScheduleInvalid));
    }

    #[test]
    fn a_deadline_can_be_moved_forward_before_it_passes() {
        let schedule = schedule();
        let now = 1_008 * DAY;
        let moved_to = schedule.submission_closes_at + DAY;

        assert_eq!(
            schedule.check_extension(Deadline::Submission, moved_to, now),
            Ok(DAY)
        );

        let moved = schedule.with_deadline(Deadline::Submission, moved_to);
        assert_eq!(moved.submission_closes_at, moved_to);
        assert_eq!(
            moved.registration_closes_at,
            schedule.registration_closes_at
        );
    }

    #[test]
    fn a_deadline_cannot_be_pulled_in() {
        let schedule = schedule();
        let now = 1_008 * DAY;
        let moved_to = schedule.submission_closes_at - HOUR;

        assert_eq!(
            schedule.check_extension(Deadline::Submission, moved_to, now),
            Err(Error::ScheduleInvalid)
        );
    }

    #[test]
    fn a_deadline_that_already_passed_cannot_be_reopened() {
        let schedule = schedule();
        let now = schedule.submission_closes_at;
        let moved_to = schedule.submission_closes_at + DAY;

        assert_eq!(
            schedule.check_extension(Deadline::Submission, moved_to, now),
            Err(Error::DeadlinePassed)
        );
    }

    #[test]
    fn an_extension_fits_while_the_announced_allowance_lasts() {
        let policy = ExtensionPolicy {
            max_extensions_per_deadline: 2,
            max_total_seconds_per_deadline: 2 * DAY,
        };

        assert_eq!(policy.validate(), Ok(()));
        assert_eq!(policy.check(0, 0, DAY), Ok(()));
        assert_eq!(policy.check(1, DAY, DAY), Ok(()));
    }

    #[test]
    fn a_third_extension_is_refused_when_two_were_announced() {
        let policy = ExtensionPolicy {
            max_extensions_per_deadline: 2,
            max_total_seconds_per_deadline: 10 * DAY,
        };

        assert_eq!(
            policy.check(2, 2 * DAY, HOUR),
            Err(Error::ExtensionLimitReached)
        );
    }

    #[test]
    fn an_extension_over_the_announced_budget_is_refused() {
        let policy = ExtensionPolicy {
            max_extensions_per_deadline: 5,
            max_total_seconds_per_deadline: DAY,
        };

        assert_eq!(policy.check(1, 20 * HOUR, 4 * HOUR), Ok(()));
        assert_eq!(
            policy.check(1, 20 * HOUR, 4 * HOUR + 1),
            Err(Error::ExtensionLimitReached)
        );
    }

    #[test]
    fn a_fixed_policy_refuses_the_first_extension() {
        let policy = ExtensionPolicy::fixed();

        assert_eq!(policy.validate(), Ok(()));
        assert_eq!(policy.check(0, 0, 1), Err(Error::ExtensionLimitReached));
    }

    #[test]
    fn a_policy_with_a_count_but_no_time_budget_is_rejected() {
        let policy = ExtensionPolicy {
            max_extensions_per_deadline: 2,
            max_total_seconds_per_deadline: 0,
        };

        assert_eq!(policy.validate(), Err(Error::ConstitutionInvalid));
    }
}
