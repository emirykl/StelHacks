//! The paths where somebody exercises judgement after the rules are locked.
//!
//! Every one of them is a place the product could quietly become the thing it
//! set out to replace, so each is bounded by something announced beforehand and
//! each leaves a reason behind.

use soroban_sdk::testutils::Ledger;
use soroban_sdk::BytesN;

use crate::constitution::Deadline;
use crate::errors::Error;
use crate::fixtures::{DAY, HOUR};
use crate::test::Fixture;

/// A running hackathon with the clock set before any deadline has passed.
fn running() -> Fixture {
    let fixture = Fixture::funded_and_open();
    fixture.env.ledger().set_timestamp(1_006 * DAY);

    fixture
}

fn reason(fixture: &Fixture) -> BytesN<32> {
    BytesN::from_array(&fixture.env, &[5u8; 32])
}

#[test]
fn an_organizer_can_give_a_deadline_more_time() {
    let fixture = running();
    let moved_to = fixture.client.state().schedule.submission_closes_at + HOUR;

    fixture
        .client
        .extend_deadline(&Deadline::Submission, &moved_to, &reason(&fixture));

    assert_eq!(
        fixture.client.state().schedule.submission_closes_at,
        moved_to
    );

    let usage = fixture.client.extension_usage(&Deadline::Submission);
    assert_eq!(usage.times, 1);
    assert_eq!(usage.seconds_added, HOUR);
}

/// The reason the effective schedule lives outside the constitution at all. If
/// an extension rewrote the locked rules, a legitimate hour granted after an
/// outage would break the digest and look exactly like tampering.
#[test]
fn the_announced_schedule_stays_where_the_rules_froze_it() {
    let fixture = running();
    let announced = fixture.client.constitution().schedule;
    let hash = fixture.client.constitution_hash();

    fixture.client.extend_deadline(
        &Deadline::Submission,
        &(announced.submission_closes_at + HOUR),
        &reason(&fixture),
    );

    assert_eq!(fixture.client.constitution().schedule, announced);
    assert_eq!(fixture.client.constitution_hash(), hash);
    assert_ne!(fixture.client.state().schedule, announced);
}

/// An extension only ever adds time. Pulling a deadline in would cut short a
/// window teams are already working against, which is the one direction nobody
/// can plan for.
#[test]
fn a_deadline_cannot_be_pulled_in() {
    let fixture = running();
    let earlier = fixture.client.state().schedule.submission_closes_at - HOUR;

    assert_eq!(
        fixture
            .client
            .try_extend_deadline(&Deadline::Submission, &earlier, &reason(&fixture))
            .err(),
        Some(Ok(Error::ScheduleInvalid))
    );
}

/// Reopening a closed window would let an organizer read what arrived and only
/// then decide whether the teams that missed it deserve another chance.
#[test]
fn a_deadline_that_has_passed_cannot_be_reopened() {
    let fixture = running();
    let closes_at = fixture.client.state().schedule.submission_closes_at;
    fixture.env.ledger().set_timestamp(closes_at);

    assert_eq!(
        fixture
            .client
            .try_extend_deadline(
                &Deadline::Submission,
                &(closes_at + HOUR),
                &reason(&fixture)
            )
            .err(),
        Some(Ok(Error::DeadlinePassed))
    );
}

/// The allowance is published before the lock, so a participant knows up front
/// how far a window can slip. It stops meaning that the moment the contract
/// lets the organizer spend more than they announced.
#[test]
fn the_allowance_runs_out_where_the_rules_said_it_would() {
    let fixture = running();
    let closes_at = fixture.client.state().schedule.submission_closes_at;
    let reason = reason(&fixture);

    // The sample rules announce two moves per deadline.
    fixture
        .client
        .extend_deadline(&Deadline::Submission, &(closes_at + HOUR), &reason);
    fixture
        .client
        .extend_deadline(&Deadline::Submission, &(closes_at + 2 * HOUR), &reason);

    assert_eq!(
        fixture
            .client
            .try_extend_deadline(&Deadline::Submission, &(closes_at + 3 * HOUR), &reason)
            .err(),
        Some(Ok(Error::ExtensionLimitReached))
    );

    let usage = fixture.client.extension_usage(&Deadline::Submission);
    assert_eq!(usage.times, 2);
    assert_eq!(usage.seconds_added, 2 * HOUR);
}

/// The check that matters most. Pushing submission past screening leaves a
/// schedule that cannot run, and it is the shape a well meant extension takes
/// when the organizer only looks at the deadline they are moving.
#[test]
fn an_extension_that_overruns_the_next_deadline_is_refused() {
    let fixture = running();
    let schedule = fixture.client.state().schedule;

    assert_eq!(
        fixture
            .client
            .try_extend_deadline(
                &Deadline::Submission,
                &schedule.screening_closes_at,
                &reason(&fixture)
            )
            .err(),
        Some(Ok(Error::ScheduleInvalid))
    );

    assert_eq!(
        fixture.client.state().schedule,
        schedule,
        "a refused extension leaves the schedule exactly where it was"
    );
}

/// Budgets are declared per deadline, so a slipping submission window must not
/// be able to eat the room the judges were promised.
#[test]
fn each_deadline_carries_its_own_allowance() {
    let fixture = running();
    let schedule = fixture.client.state().schedule;
    let reason = reason(&fixture);

    fixture.client.extend_deadline(
        &Deadline::Registration,
        &(schedule.registration_closes_at + HOUR),
        &reason,
    );
    fixture.client.extend_deadline(
        &Deadline::Registration,
        &(schedule.registration_closes_at + 2 * HOUR),
        &reason,
    );

    assert_eq!(
        fixture
            .client
            .try_extend_deadline(
                &Deadline::Registration,
                &(schedule.registration_closes_at + 3 * HOUR),
                &reason
            )
            .err(),
        Some(Ok(Error::ExtensionLimitReached))
    );

    fixture.client.extend_deadline(
        &Deadline::Submission,
        &(schedule.submission_closes_at + HOUR),
        &reason,
    );

    assert_eq!(
        fixture.client.extension_usage(&Deadline::Submission).times,
        1
    );
}

/// Before the lock the schedule is simply edited, and spending an allowance
/// against rules nobody has been shown yet would cost the organizer room they
/// might need once the event is real.
#[test]
fn a_deadline_cannot_be_moved_while_the_rules_are_still_a_draft() {
    let fixture = Fixture::created();
    let moved_to = fixture.client.state().schedule.submission_closes_at + HOUR;

    assert_eq!(
        fixture
            .client
            .try_extend_deadline(&Deadline::Submission, &moved_to, &reason(&fixture))
            .err(),
        Some(Ok(Error::WrongPhase))
    );
}

/// Removing an entry from the running, on the record.
///
/// This is the heaviest power the product hands anyone, so the tests here are
/// mostly about what it cannot do: not without a stated reason, not without the
/// team's window to answer, not without judges who are not the organizer, not
/// once the result is closed, and never quietly.
mod disqualification {
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{symbol_short, Address, BytesN, String};

    use crate::errors::Error;
    use crate::fixtures::HOUR;
    use crate::submission::SubmissionStatus;
    use crate::test::Fixture;

    /// An approved captain with a project entered in the payments track.
    fn enter(fixture: &Fixture) -> u32 {
        let env = fixture.env.clone();

        let captain = Address::generate(&env);
        fixture.client.apply(&captain);
        let organizer = fixture.organizer.clone();
        fixture.client.approve_application(&organizer, &captain);

        let team = fixture.client.create_team(&captain);
        fixture.client.submit_project(
            &captain,
            &team,
            &symbol_short!("payments"),
            &BytesN::from_array(&env, &[1u8; 32]),
            &String::from_str(&env, "ipfs://cid"),
        );

        team
    }

    /// A hackathon in its screening round with one project entered.
    struct Screening {
        fixture: Fixture,
        team: u32,
    }

    impl Screening {
        fn new() -> Screening {
            let fixture = Fixture::funded_and_open();
            let schedule = fixture.client.state().schedule;
            let env = fixture.env.clone();

            env.ledger()
                .set_timestamp(schedule.registration_opens_at + 3_600);
            let team = enter(&fixture);

            env.ledger()
                .set_timestamp(schedule.submission_closes_at + 1);
            fixture.client.advance_phase();

            Screening { fixture, team }
        }
    }

    /// The same hackathon carried on into its judging window.
    struct Contested {
        fixture: Fixture,
        team: u32,
    }

    impl Contested {
        fn new() -> Contested {
            let screening = Screening::new();
            let closes_at = screening
                .fixture
                .client
                .state()
                .schedule
                .screening_closes_at;

            screening.fixture.env.ledger().set_timestamp(closes_at + 1);
            screening.fixture.client.advance_phase();

            Contested {
                fixture: screening.fixture,
                team: screening.team,
            }
        }

        fn captain(&self) -> Address {
            self.fixture.client.team_by_id(&self.team).captain
        }

        fn judge(&self, index: u32) -> Address {
            self.fixture
                .client
                .constitution()
                .judges
                .get(index)
                .unwrap()
                .judge
        }

        fn reason(&self) -> BytesN<32> {
            BytesN::from_array(&self.fixture.env, &[9u8; 32])
        }

        fn open(&self) {
            self.fixture
                .client
                .open_disqualification(&self.team, &self.reason());
        }

        /// Moves the clock past the window the team was given to answer.
        fn past_the_window(&self) {
            let opened_at = self.fixture.client.disqualification(&self.team).opened_at;
            let window = self.fixture.client.constitution().discretion.appeal_window;

            self.fixture.env.ledger().set_timestamp(opened_at + window);
        }

        fn status(&self) -> SubmissionStatus {
            self.fixture.client.submission(&self.team).status
        }
    }

    /// The accusation alone changes nothing. A team accused on the last evening
    /// of judging is still competing while the case runs, which is the whole
    /// difference between a process and a removal.
    #[test]
    fn an_open_case_leaves_the_project_in_the_running() {
        let contested = Contested::new();
        contested.open();

        let case = contested.fixture.client.disqualification(&contested.team);

        assert_eq!(case.team, contested.team);
        assert_eq!(case.reason, contested.reason());
        assert_eq!(case.approvals, 0);
        assert!(!case.resolved);
        assert_eq!(contested.status(), SubmissionStatus::Valid);
    }

    #[test]
    fn judges_who_reach_the_announced_threshold_remove_the_entry() {
        let contested = Contested::new();
        contested.open();

        // The sample rules ask for two signatures.
        contested
            .fixture
            .client
            .approve_disqualification(&contested.judge(0), &contested.team);
        contested
            .fixture
            .client
            .approve_disqualification(&contested.judge(1), &contested.team);

        contested.past_the_window();

        assert!(contested
            .fixture
            .client
            .resolve_disqualification(&contested.team));

        let submission = contested.fixture.client.submission(&contested.team);

        assert_eq!(submission.status, SubmissionStatus::Disqualified);
        assert_eq!(
            submission.reason,
            contested.reason(),
            "the entry carries the reason the case was opened with"
        );
        assert_eq!(
            submission.metadata_hash,
            BytesN::from_array(&contested.fixture.env, &[1u8; 32]),
            "the project keeps its page rather than disappearing"
        );
    }

    /// The default that makes this discretion rather than a loophole. An
    /// organizer who cannot convince the bench has removed nobody.
    #[test]
    fn a_case_the_judges_did_not_sign_leaves_the_team_competing() {
        let contested = Contested::new();
        contested.open();

        contested
            .fixture
            .client
            .approve_disqualification(&contested.judge(0), &contested.team);

        contested.past_the_window();

        assert!(!contested
            .fixture
            .client
            .resolve_disqualification(&contested.team));
        assert_eq!(contested.status(), SubmissionStatus::Valid);
        assert!(
            contested
                .fixture
                .client
                .disqualification(&contested.team)
                .resolved,
            "the case is closed on the record rather than left hanging"
        );
    }

    /// Settling early would take the team's window away by simply not waiting
    /// for it, which is the cheapest way to make an appeal right meaningless.
    #[test]
    fn a_case_cannot_be_settled_before_the_team_has_had_its_window() {
        let contested = Contested::new();
        contested.open();

        contested
            .fixture
            .client
            .approve_disqualification(&contested.judge(0), &contested.team);
        contested
            .fixture
            .client
            .approve_disqualification(&contested.judge(1), &contested.team);

        assert_eq!(
            contested
                .fixture
                .client
                .try_resolve_disqualification(&contested.team)
                .err(),
            Some(Ok(Error::AppealWindowOpen))
        );
        assert_eq!(contested.status(), SubmissionStatus::Valid);
    }

    #[test]
    fn a_team_can_answer_on_the_record_while_the_window_is_open() {
        let contested = Contested::new();
        contested.open();

        let answer = BytesN::from_array(&contested.fixture.env, &[3u8; 32]);
        let captain = contested.captain();
        contested
            .fixture
            .client
            .submit_appeal(&captain, &contested.team, &answer);

        let case = contested.fixture.client.disqualification(&contested.team);

        assert_eq!(case.appeal, answer);
        assert!(case.appealed_at >= case.opened_at);
    }

    #[test]
    fn an_answer_filed_after_the_window_is_refused() {
        let contested = Contested::new();
        contested.open();
        contested.past_the_window();

        let captain = contested.captain();

        assert_eq!(
            contested
                .fixture
                .client
                .try_submit_appeal(
                    &captain,
                    &contested.team,
                    &BytesN::from_array(&contested.fixture.env, &[3u8; 32])
                )
                .err(),
            Some(Ok(Error::AppealWindowClosed))
        );
    }

    #[test]
    fn somebody_outside_the_team_cannot_answer_for_it() {
        let contested = Contested::new();
        contested.open();

        let stranger = Address::generate(&contested.fixture.env);

        assert_eq!(
            contested
                .fixture
                .client
                .try_submit_appeal(
                    &stranger,
                    &contested.team,
                    &BytesN::from_array(&contested.fixture.env, &[3u8; 32])
                )
                .err(),
            Some(Ok(Error::NotTeamMember))
        );
    }

    /// A threshold one judge could reach twice is not a threshold.
    #[test]
    fn a_judge_cannot_sign_the_same_case_twice() {
        let contested = Contested::new();
        contested.open();

        let judge = contested.judge(0);
        contested
            .fixture
            .client
            .approve_disqualification(&judge, &contested.team);

        assert_eq!(
            contested
                .fixture
                .client
                .try_approve_disqualification(&judge, &contested.team)
                .err(),
            Some(Ok(Error::AlreadySigned))
        );
        assert_eq!(
            contested
                .fixture
                .client
                .disqualification(&contested.team)
                .approvals,
            1
        );
    }

    #[test]
    fn somebody_who_is_not_a_judge_here_cannot_sign() {
        let contested = Contested::new();
        contested.open();

        let stranger = Address::generate(&contested.fixture.env);

        assert_eq!(
            contested
                .fixture
                .client
                .try_approve_disqualification(&stranger, &contested.team)
                .err(),
            Some(Ok(Error::NotJudge))
        );
    }

    #[test]
    fn a_case_cannot_be_opened_twice_against_the_same_entry() {
        let contested = Contested::new();
        contested.open();

        assert_eq!(
            contested
                .fixture
                .client
                .try_open_disqualification(&contested.team, &contested.reason())
                .err(),
            Some(Ok(Error::CaseAlreadyOpen))
        );
    }

    #[test]
    fn a_settled_case_cannot_be_settled_again() {
        let contested = Contested::new();
        contested.open();
        contested.past_the_window();
        contested
            .fixture
            .client
            .resolve_disqualification(&contested.team);

        assert_eq!(
            contested
                .fixture
                .client
                .try_resolve_disqualification(&contested.team)
                .err(),
            Some(Ok(Error::CaseNotOpen))
        );
    }

    /// The heavier route has to be available during screening too. An organizer
    /// who finds plagiarism while the screening round is still open would
    /// otherwise have to reach for the lighter one, which is exactly the route
    /// that gives the team no window to answer and asks no judge to agree.
    #[test]
    fn a_case_can_be_opened_while_screening_is_still_running() {
        let screening = Screening::new();
        let reason = BytesN::from_array(&screening.fixture.env, &[9u8; 32]);

        screening
            .fixture
            .client
            .open_disqualification(&screening.team, &reason);

        assert_eq!(
            screening
                .fixture
                .client
                .disqualification(&screening.team)
                .reason,
            reason
        );
        assert_eq!(
            screening.fixture.client.submission(&screening.team).status,
            SubmissionStatus::Valid
        );
    }

    /// One entry, one process. Ruling the entry out through screening while a
    /// case is running would leave the heavier process holding a verdict it can
    /// no longer apply, and would take away a window the team had already been
    /// given.
    #[test]
    fn screening_cannot_rule_out_an_entry_that_already_has_a_case() {
        let screening = Screening::new();
        let reason = BytesN::from_array(&screening.fixture.env, &[9u8; 32]);

        screening
            .fixture
            .client
            .open_disqualification(&screening.team, &reason);

        assert_eq!(
            screening
                .fixture
                .client
                .try_invalidate_submission(&screening.team, &reason)
                .err(),
            Some(Ok(Error::CaseAlreadyOpen))
        );
    }

    /// Nothing is pinned before the submission deadline, so there is no entry
    /// to build a case against.
    #[test]
    fn a_case_cannot_be_opened_while_projects_are_still_arriving() {
        let fixture = Fixture::funded_and_open();
        let env = fixture.env.clone();
        let schedule = fixture.client.state().schedule;

        env.ledger()
            .set_timestamp(schedule.registration_opens_at + 3_600);
        let team = enter(&fixture);

        assert_eq!(
            fixture
                .client
                .try_open_disqualification(&team, &BytesN::from_array(&env, &[9u8; 32]))
                .err(),
            Some(Ok(Error::WrongPhase))
        );
    }

    /// An entry already out cannot be taken out again. A second ruling would
    /// overwrite the first one's reason, leaving the page carrying an
    /// explanation that belongs to a decision nobody made.
    #[test]
    fn an_entry_already_out_of_the_running_cannot_be_charged_again() {
        let contested = Contested::new();
        contested.open();
        contested
            .fixture
            .client
            .approve_disqualification(&contested.judge(0), &contested.team);
        contested
            .fixture
            .client
            .approve_disqualification(&contested.judge(1), &contested.team);
        contested.past_the_window();
        contested
            .fixture
            .client
            .resolve_disqualification(&contested.team);

        // A fresh case needs the old one gone, and it is not; even if it were,
        // the entry itself is no longer in the running.
        assert_eq!(
            contested
                .fixture
                .client
                .try_open_disqualification(&contested.team, &contested.reason())
                .err(),
            Some(Ok(Error::SubmissionNotEligible))
        );
    }

    /// A case opened an hour before the judging window closes still runs its
    /// full course, so the clock cannot be used to outlast the process.
    #[test]
    fn the_window_the_team_was_promised_survives_the_end_of_judging() {
        let contested = Contested::new();
        let closes_at = contested.fixture.client.state().schedule.judging_closes_at;

        contested
            .fixture
            .env
            .ledger()
            .set_timestamp(closes_at - HOUR);
        contested.open();

        assert_eq!(
            contested
                .fixture
                .client
                .try_resolve_disqualification(&contested.team)
                .err(),
            Some(Ok(Error::AppealWindowOpen))
        );
    }
}

/// Calling the whole thing off.
///
/// The only power that reaches everybody at once, so the tests are about who is
/// allowed to use it and when. Before anybody has entered it costs nothing and
/// the organizer acts alone; from the moment teams start building it costs them
/// work, and the person whose deposit comes back stops being the only person
/// who decides.
mod cancellation {
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::token::TokenClient;
    use soroban_sdk::{Address, BytesN};

    use crate::errors::Error;
    use crate::phase::Phase;
    use crate::test::Fixture;

    /// The bar the sample rules set.
    const SIGNATURES_NEEDED: u32 = 2;

    fn reason(fixture: &Fixture) -> BytesN<32> {
        BytesN::from_array(&fixture.env, &[4u8; 32])
    }

    fn judge(fixture: &Fixture, index: u32) -> Address {
        fixture
            .client
            .constitution()
            .judges
            .get(index)
            .unwrap()
            .judge
    }

    fn token(fixture: &Fixture) -> TokenClient<'static> {
        TokenClient::new(&fixture.env, &fixture.client.constitution().prize_asset)
    }

    /// Nothing has been spent yet, by anyone, so there is nobody to protect
    /// from the organizer changing their mind.
    #[test]
    fn a_hackathon_nobody_has_entered_can_be_called_off_alone() {
        let fixture = Fixture::created();

        assert_eq!(fixture.client.cancel(&reason(&fixture)), 0);
        assert_eq!(fixture.client.phase(), Phase::Cancelled);
    }

    /// A sponsor's deposit has to come back out. Money that could only leave
    /// the vault by paying a winner would be stranded in a hackathon that will
    /// never have one.
    #[test]
    fn calling_it_off_during_funding_returns_the_whole_pool() {
        use prize_vault::{PrizeVault, PrizeVaultClient};
        use soroban_sdk::token::StellarAssetClient;

        let fixture = Fixture::locked_with_asset();
        let asset = fixture.client.constitution().prize_asset;

        let vault_id = fixture.env.register(PrizeVault, ());
        let vault = PrizeVaultClient::new(&fixture.env, &vault_id);
        vault.create(&fixture.client.address, &asset);
        fixture.client.bind_vault(&vault.address);

        let sponsor = Address::generate(&fixture.env);
        StellarAssetClient::new(&fixture.env, &asset).mint(&sponsor, &10_000);
        vault.deposit(&sponsor, &10_000);

        let organizer = fixture.organizer.clone();

        assert_eq!(fixture.client.phase(), Phase::Funding);
        assert_eq!(fixture.client.cancel(&reason(&fixture)), 10_000);
        assert_eq!(fixture.client.phase(), Phase::Cancelled);
        assert_eq!(token(&fixture).balance(&organizer), 10_000);
        assert_eq!(vault.balance(), 0);
    }

    /// From the moment people can enter, the organizer is no longer the only
    /// party with something at stake, and the signature that stops the event
    /// stops being theirs alone to give.
    #[test]
    fn once_teams_can_enter_the_organizer_cannot_stop_it_alone() {
        let fixture = Fixture::funded_and_open();
        let organizer = fixture.organizer.clone();

        assert_eq!(
            fixture.client.try_cancel(&reason(&fixture)).err(),
            Some(Ok(Error::WrongPhase))
        );
        assert_eq!(fixture.client.phase(), Phase::Open);
        assert_eq!(token(&fixture).balance(&organizer), 0);
    }

    /// The whole point of the threshold. The organizer is the party the pool
    /// goes back to, so they cannot also be the only signature on stopping.
    #[test]
    fn a_cancellation_waits_for_the_signatures_the_rules_announced() {
        let fixture = Fixture::funded_and_open();
        let organizer = fixture.organizer.clone();

        fixture.client.open_cancellation(&reason(&fixture));

        assert_eq!(
            fixture.client.try_resolve_cancellation().err(),
            Some(Ok(Error::JudgeApprovalThresholdNotMet))
        );

        let first = judge(&fixture, 0);
        fixture.client.approve_cancellation(&first);

        assert_eq!(
            fixture.client.try_resolve_cancellation().err(),
            Some(Ok(Error::JudgeApprovalThresholdNotMet)),
            "one signature short is still short"
        );

        let second = judge(&fixture, 1);
        fixture.client.approve_cancellation(&second);

        assert_eq!(fixture.client.resolve_cancellation(), 10_000);
        assert_eq!(fixture.client.phase(), Phase::Cancelled);
        assert_eq!(token(&fixture).balance(&organizer), 10_000);
        assert_eq!(fixture.client.cancellation().approvals, SIGNATURES_NEEDED);
    }

    /// Opening is not stopping. Deadlines keep passing and teams keep working
    /// while the judges make up their minds, because a hackathon that froze the
    /// moment somebody proposed cancelling it would hand the organizer the
    /// power they were just refused.
    #[test]
    fn an_open_move_leaves_the_hackathon_running() {
        let fixture = Fixture::funded_and_open();
        let opens_at = fixture.client.state().schedule.registration_opens_at;
        fixture.env.ledger().set_timestamp(opens_at + 3_600);

        fixture.client.open_cancellation(&reason(&fixture));

        assert_eq!(fixture.client.phase(), Phase::Open);

        let applicant = Address::generate(&fixture.env);
        fixture.client.apply(&applicant);

        assert!(fixture.client.registration(&applicant).decided_at == 0);
    }

    #[test]
    fn a_judge_cannot_sign_the_same_move_twice() {
        let fixture = Fixture::funded_and_open();
        fixture.client.open_cancellation(&reason(&fixture));

        let judge = judge(&fixture, 0);
        fixture.client.approve_cancellation(&judge);

        assert_eq!(
            fixture.client.try_approve_cancellation(&judge).err(),
            Some(Ok(Error::AlreadySigned))
        );
        assert_eq!(fixture.client.cancellation().approvals, 1);
    }

    #[test]
    fn somebody_who_is_not_on_the_bench_cannot_sign() {
        let fixture = Fixture::funded_and_open();
        fixture.client.open_cancellation(&reason(&fixture));

        let stranger = Address::generate(&fixture.env);

        assert_eq!(
            fixture.client.try_approve_cancellation(&stranger).err(),
            Some(Ok(Error::NotJudge))
        );
    }

    /// A second move would reset the signature count, which is the cheapest way
    /// to keep asking until the answer changes.
    #[test]
    fn a_move_cannot_be_opened_twice() {
        let fixture = Fixture::funded_and_open();
        fixture.client.open_cancellation(&reason(&fixture));

        assert_eq!(
            fixture
                .client
                .try_open_cancellation(&reason(&fixture))
                .err(),
            Some(Ok(Error::CaseAlreadyOpen))
        );
    }

    #[test]
    fn nothing_can_be_resolved_that_was_never_opened() {
        let fixture = Fixture::funded_and_open();

        assert_eq!(
            fixture.client.try_resolve_cancellation().err(),
            Some(Ok(Error::CaseNotOpen))
        );
    }

    /// A hackathon that has come to rest stays there. Reopening a cancelled
    /// event to cancel it again would mean the vault could be emptied twice.
    #[test]
    fn a_stopped_hackathon_cannot_be_stopped_again() {
        let fixture = Fixture::funded_and_open();
        fixture.client.open_cancellation(&reason(&fixture));

        for index in 0..SIGNATURES_NEEDED {
            let judge = judge(&fixture, index);
            fixture.client.approve_cancellation(&judge);
        }
        fixture.client.resolve_cancellation();

        assert_eq!(
            fixture.client.try_resolve_cancellation().err(),
            Some(Ok(Error::WrongPhase))
        );
        assert_eq!(
            fixture
                .client
                .try_open_cancellation(&reason(&fixture))
                .err(),
            Some(Ok(Error::WrongPhase))
        );
    }
}
