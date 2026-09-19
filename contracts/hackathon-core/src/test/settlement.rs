//! The chain the product's submission threshold asks for, end to end:
//! rules locked, judging sealed, ranking derived, money paid.
//!
//! Everything here runs against both contracts with a real token, so a passing
//! test means a hackathon actually settled rather than that the pieces compile
//! next to each other.

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{symbol_short, vec, Address, BytesN, String, Symbol, Vec};

use crate::constitution::JudgingMode;
use crate::errors::Error;
use crate::hashing::scorecard_leaf;
use crate::merkle;
use crate::phase::Phase;
use crate::results::DecidedBy;
use crate::scorecard::{CriterionScore, Scorecard};
use crate::test::Fixture;

use prize_vault::PrizeVaultClient;
use soroban_sdk::token::TokenClient;

/// A hackathon carried all the way to a settled ranking.
struct Settled {
    fixture: Fixture,
    vault: PrizeVaultClient<'static>,
    token: TokenClient<'static>,
    /// Team identifiers in the order they were entered.
    teams: Vec<u32>,
}

impl Settled {
    /// Two teams enter the payments track, the judges prefer the first, the
    /// scorecards are sealed and opened, and the ranking is closed.
    fn through_finalization() -> Settled {
        let settled = Settled::through_reveal();
        settled.fixture.client.finalize_results();

        settled
    }

    /// The same hackathon carried as far as the reveal, with every scorecard
    /// opened and the ranking still to be closed. This is the last moment a
    /// disqualification can still change who wins.
    fn through_reveal() -> Settled {
        Settled::through_reveal_with(1)
    }

    /// The same, with every team holding `size` people.
    fn through_reveal_with(size: u32) -> Settled {
        let fixture = Fixture::funded_and_open();
        let env = fixture.env.clone();
        let schedule = fixture.client.state().schedule;

        env.ledger()
            .set_timestamp(schedule.registration_opens_at + 3_600);

        let mut teams = Vec::new(&env);
        teams.push_back(Self::enter(&fixture, 1, size));
        teams.push_back(Self::enter(&fixture, 2, size));

        env.ledger()
            .set_timestamp(schedule.submission_closes_at + 1);
        fixture.client.advance_phase();
        env.ledger().set_timestamp(schedule.screening_closes_at + 1);
        fixture.client.advance_phase();

        // The first team scores better with every judge.
        let mut cards = Vec::new(&env);
        for index in 0..2u32 {
            let judge = fixture
                .client
                .constitution()
                .judges
                .get(index)
                .unwrap()
                .judge;
            cards.push_back(Self::scorecard(
                &fixture,
                &judge,
                teams.get(0).unwrap(),
                90,
                90,
            ));
            cards.push_back(Self::scorecard(
                &fixture,
                &judge,
                teams.get(1).unwrap(),
                40,
                40,
            ));
        }
        let third = fixture.client.constitution().judges.get(2).unwrap().judge;
        cards.push_back(Self::scorecard(
            &fixture,
            &third,
            teams.get(0).unwrap(),
            80,
            80,
        ));
        cards.push_back(Self::scorecard(
            &fixture,
            &third,
            teams.get(1).unwrap(),
            50,
            50,
        ));

        let proofs = Self::seal(&fixture, &cards);

        env.ledger().set_timestamp(schedule.judging_closes_at + 1);
        fixture.client.advance_phase();

        for index in 0..cards.len() {
            fixture
                .client
                .reveal_score(&cards.get(index).unwrap(), &proofs.get(index).unwrap());
        }

        let vault_address = fixture.client.vault();
        let vault = PrizeVaultClient::new(&env, &vault_address);
        let token = TokenClient::new(&env, &fixture.client.constitution().prize_asset);

        Settled {
            fixture,
            vault,
            token,
            teams,
        }
    }

    /// The same hackathon with the safety window run out and settlement open.
    fn open() -> Settled {
        Settled::open_with(1)
    }

    /// The same, with every team holding `size` people.
    fn open_with(size: u32) -> Settled {
        let settled = Settled::through_reveal_with(size);
        settled.fixture.client.finalize_results();
        let hold = 24 * 60 * 60;
        let now = settled.fixture.client.state().finalized_at + hold;

        settled.fixture.env.ledger().set_timestamp(now);
        settled.fixture.client.open_settlement();

        settled
    }

    /// One team of `size` people, entered in the payments track.
    ///
    /// The captain is the first of them and takes no larger a share for it.
    fn enter(fixture: &Fixture, digest: u8, size: u32) -> u32 {
        let organizer = fixture.organizer.clone();

        let captain = Address::generate(&fixture.env);
        fixture.client.apply(&captain);
        fixture.client.approve_application(&organizer, &captain);

        let team = fixture.client.create_team(&captain);

        for _ in 1..size {
            let member = Address::generate(&fixture.env);
            fixture.client.apply(&member);
            fixture.client.approve_application(&organizer, &member);
            fixture.client.add_member(&team, &member);
        }

        fixture.client.submit_project(
            &captain,
            &team,
            &symbol_short!("payments"),
            &BytesN::from_array(&fixture.env, &[digest; 32]),
            &String::from_str(&fixture.env, "ipfs://cid"),
        );

        team
    }

    fn scorecard(fixture: &Fixture, judge: &Address, team: u32, a: u32, b: u32) -> Scorecard {
        Scorecard {
            judge: judge.clone(),
            team,
            scores: vec![
                &fixture.env,
                CriterionScore {
                    criterion: symbol_short!("technical"),
                    score: a,
                },
                CriterionScore {
                    criterion: symbol_short!("novelty"),
                    score: b,
                },
            ],
        }
    }

    /// Builds a tree over however many scorecards there are and seals it.
    fn seal(fixture: &Fixture, cards: &Vec<Scorecard>) -> Vec<Vec<BytesN<32>>> {
        let env = &fixture.env;

        let mut leaves = Vec::new(env);
        for index in 0..cards.len() {
            leaves.push_back(scorecard_leaf(env, &cards.get(index).unwrap()));
        }

        let (root, proofs) = build_tree(env, &leaves);

        let schedule = fixture.client.state().schedule;
        env.ledger().set_timestamp(schedule.judging_closes_at);

        match fixture.client.constitution().judging_mode {
            JudgingMode::Easy(_) => fixture.client.publish_score_root(&root),
            JudgingMode::Strict => panic!("the sample hackathon runs the easy mode"),
        }

        proofs
    }

    fn captain(&self, team: u32) -> Address {
        self.fixture.client.team_by_id(&team).captain
    }

    /// Whoever holds the share for a position.
    ///
    /// Every team in this harness is a solo entry, so the captain is the whole
    /// team and one payment settles the position. The team splits are exercised
    /// in `shared_prizes`, where the teams have more than one person in them.
    fn winner(&self, track: &Symbol, rank: u32) -> Address {
        self.captain(self.winner_team(track, rank))
    }

    /// The team that took a position.
    fn winner_team(&self, track: &Symbol, rank: u32) -> u32 {
        self.fixture
            .client
            .ranking(track)
            .iter()
            .find(|placement| placement.rank == rank)
            .expect("the position was won")
            .team
    }
}

/// A tree over any number of leaves, with a proof for each one.
///
/// A level with an odd count promotes its last node unchanged, which is what
/// the real collection service will do too: three judges scoring two projects
/// is six scorecards, and six is not a power of two.
fn build_tree(
    env: &soroban_sdk::Env,
    leaves: &Vec<BytesN<32>>,
) -> (BytesN<32>, Vec<Vec<BytesN<32>>>) {
    let count = leaves.len();

    let mut proofs = Vec::new(env);
    let mut positions = Vec::new(env);
    for index in 0..count {
        proofs.push_back(Vec::new(env));
        positions.push_back(index);
    }

    let mut level = leaves.clone();

    while level.len() > 1 {
        for leaf in 0..count {
            let position = positions.get(leaf).unwrap();

            let sibling = if position.is_multiple_of(2) {
                if position + 1 < level.len() {
                    Some(position + 1)
                } else {
                    None
                }
            } else {
                Some(position - 1)
            };

            if let Some(sibling) = sibling {
                let mut proof = proofs.get(leaf).unwrap();
                proof.push_back(level.get(sibling).unwrap());
                proofs.set(leaf, proof);
            }

            positions.set(leaf, position / 2);
        }

        let mut next = Vec::new(env);
        let mut at = 0;
        while at < level.len() {
            if at + 1 < level.len() {
                next.push_back(merkle::node(
                    env,
                    &level.get(at).unwrap(),
                    &level.get(at + 1).unwrap(),
                ));
            } else {
                next.push_back(level.get(at).unwrap());
            }
            at += 2;
        }

        level = next;
    }

    (level.get(0).unwrap(), proofs)
}

fn payments() -> Symbol {
    symbol_short!("payments")
}

#[test]
fn the_ranking_puts_the_better_scored_project_first() {
    let settled = Settled::through_finalization();
    let ranking = settled.fixture.client.ranking(&payments());

    assert_eq!(settled.fixture.client.phase(), Phase::Finalization);
    assert_eq!(ranking.len(), 2);

    let winner = ranking.get(0).unwrap();
    let runner_up = ranking.get(1).unwrap();

    assert_eq!(winner.team, settled.teams.get(0).unwrap());
    assert_eq!(winner.rank, 1);
    assert_eq!(runner_up.rank, 2);
    assert!(winner.final_score > runner_up.final_score);
    assert_eq!(
        runner_up.decided_by,
        DecidedBy::Score,
        "they were separated on the score itself, not on a tie break"
    );
}

/// The window buys time to stop a payout after a bug is found; until it runs
/// out, nothing moves.
#[test]
fn nothing_is_paid_while_the_safety_window_is_open() {
    let settled = Settled::through_finalization();

    assert_eq!(
        settled.fixture.client.try_open_settlement().err(),
        Some(Ok(Error::SafetyWindowOpen))
    );
    assert_eq!(
        settled
            .fixture
            .client
            .try_settle_prize(&payments(), &1, &settled.winner(&payments(), 1))
            .err(),
        Some(Ok(Error::WrongPhase))
    );
}

#[test]
fn the_window_runs_out_and_settlement_opens() {
    let settled = Settled::open();

    assert_eq!(settled.fixture.client.phase(), Phase::Settlement);
}

/// The whole chain, ending where it has to end: money in a winner's account.
#[test]
fn the_winner_is_paid_from_the_vault() {
    let settled = Settled::open();
    let captain = settled.captain(settled.teams.get(0).unwrap());

    assert_eq!(settled.token.balance(&captain), 0);

    let paid =
        settled
            .fixture
            .client
            .settle_prize(&payments(), &1, &settled.winner(&payments(), 1));

    assert_eq!(paid, 5_000);
    assert_eq!(settled.token.balance(&captain), 5_000);
    assert_eq!(settled.vault.balance(), 5_000);
    assert!(settled.fixture.client.is_paid(&payments(), &1));
}

#[test]
fn the_runner_up_is_paid_their_own_position() {
    let settled = Settled::open();
    let second = settled.captain(settled.teams.get(1).unwrap());

    settled
        .fixture
        .client
        .settle_prize(&payments(), &2, &settled.winner(&payments(), 2));

    assert_eq!(settled.token.balance(&second), 3_000);
}

#[test]
fn a_position_cannot_be_paid_twice() {
    let settled = Settled::open();
    settled
        .fixture
        .client
        .settle_prize(&payments(), &1, &settled.winner(&payments(), 1));

    assert_eq!(
        settled
            .fixture
            .client
            .try_settle_prize(&payments(), &1, &settled.winner(&payments(), 1))
            .err(),
        Some(Ok(Error::PrizeAlreadyPaid))
    );
}

/// Paying needs nobody's permission. The ranking is settled and the amounts are
/// locked, so leaving it to the organizer would only let them sit on it.
#[test]
fn paying_a_winner_needs_no_signature_from_anyone() {
    let settled = Settled::open();
    let captain = settled.captain(settled.teams.get(0).unwrap());

    settled.fixture.env.set_auths(&[]);
    settled
        .fixture
        .client
        .settle_prize(&payments(), &1, &settled.winner(&payments(), 1));

    assert_eq!(settled.token.balance(&captain), 5_000);
}

#[test]
fn a_hold_stops_the_money_and_lifting_it_lets_them_through() {
    let settled = Settled::open();
    let reason = BytesN::from_array(&settled.fixture.env, &[4u8; 32]);
    let captain = settled.captain(settled.teams.get(0).unwrap());

    settled.fixture.client.pause_settlement(&reason);
    assert_eq!(
        settled
            .fixture
            .client
            .try_settle_prize(&payments(), &1, &settled.winner(&payments(), 1))
            .err(),
        Some(Ok(Error::SettlementPaused))
    );

    settled.fixture.client.resume_settlement(&reason);
    settled
        .fixture
        .client
        .settle_prize(&payments(), &1, &settled.winner(&payments(), 1));

    assert_eq!(settled.token.balance(&captain), 5_000);
}

#[test]
fn a_hold_cannot_be_lifted_when_there_is_none() {
    let settled = Settled::open();
    let reason = BytesN::from_array(&settled.fixture.env, &[4u8; 32]);

    assert_eq!(
        settled.fixture.client.try_resume_settlement(&reason).err(),
        Some(Ok(Error::SettlementNotPaused))
    );
}

/// A track's prize table only reaches as far as it reaches.
#[test]
fn a_position_the_prize_table_does_not_have_is_refused() {
    let settled = Settled::open();

    assert_eq!(
        settled
            .fixture
            .client
            .try_settle_prize(&payments(), &9, &settled.winner(&payments(), 1))
            .err(),
        Some(Ok(Error::NotFound))
    );
}

/// The vault only ever gives up what the prize table says.
#[test]
fn the_pool_falls_by_exactly_the_prize_that_was_paid() {
    let settled = Settled::open();
    let before = settled.vault.balance();

    settled
        .fixture
        .client
        .settle_prize(&payments(), &1, &settled.winner(&payments(), 1));
    settled
        .fixture
        .client
        .settle_prize(&payments(), &2, &settled.winner(&payments(), 2));

    assert_eq!(settled.vault.balance(), before - 8_000);
}

/// What a disqualification actually costs a project, proved against a real
/// ranking rather than against a status field.
///
/// The process itself is tested in `discretion`. What matters here is the one
/// thing that makes the process worth having: an entry removed on the last day
/// of judging never reaches the prize table, and the team behind it never
/// reaches the vault.
mod disqualification {
    use super::*;

    /// The bar the sample rules set.
    const SIGNATURES_NEEDED: u32 = 2;

    fn open_and_uphold(settled: &Settled, team: u32) {
        let reason = BytesN::from_array(&settled.fixture.env, &[9u8; 32]);
        settled.fixture.client.open_disqualification(&team, &reason);

        for index in 0..SIGNATURES_NEEDED {
            let judge = settled
                .fixture
                .client
                .constitution()
                .judges
                .get(index)
                .unwrap()
                .judge;
            settled
                .fixture
                .client
                .approve_disqualification(&judge, &team);
        }

        let case = settled.fixture.client.disqualification(&team);
        let window = settled
            .fixture
            .client
            .constitution()
            .discretion
            .appeal_window;

        settled
            .fixture
            .env
            .ledger()
            .set_timestamp(case.opened_at + window);

        assert!(settled.fixture.client.resolve_disqualification(&team));
    }

    /// The winner is removed after every scorecard is already open, which is
    /// the case that matters: the scores stay exactly where they were and the
    /// ranking is rebuilt without the entry rather than around it.
    #[test]
    fn a_disqualified_project_never_reaches_the_ranking() {
        let settled = Settled::through_reveal();
        let removed = settled.teams.get(0).unwrap();
        let survivor = settled.teams.get(1).unwrap();

        open_and_uphold(&settled, removed);
        settled.fixture.client.finalize_results();

        let ranking = settled.fixture.client.ranking(&payments());

        assert_eq!(ranking.len(), 1);
        assert_eq!(ranking.get(0).unwrap().team, survivor);
        assert_eq!(
            ranking.get(0).unwrap().rank,
            1,
            "the project that was left takes the place the removed one held"
        );
    }

    /// The reason the ranking waits. Closing the result around an entry whose
    /// case is still running would decide it by timing, and nothing can be
    /// undone once the result is final.
    #[test]
    fn the_result_cannot_close_while_a_case_is_still_open() {
        let settled = Settled::through_reveal();
        let team = settled.teams.get(0).unwrap();
        let reason = BytesN::from_array(&settled.fixture.env, &[9u8; 32]);

        settled.fixture.client.open_disqualification(&team, &reason);

        assert_eq!(
            settled.fixture.client.try_finalize_results().err(),
            Some(Ok(Error::DisqualificationUnresolved))
        );

        let case = settled.fixture.client.disqualification(&team);
        let window = settled
            .fixture
            .client
            .constitution()
            .discretion
            .appeal_window;
        settled
            .fixture
            .env
            .ledger()
            .set_timestamp(case.opened_at + window);
        settled.fixture.client.resolve_disqualification(&team);

        settled.fixture.client.finalize_results();

        assert_eq!(settled.fixture.client.phase(), Phase::Finalization);
    }

    /// A case that failed leaves nothing behind. The team is ranked exactly as
    /// though it had never been opened, which is what stops an accusation from
    /// being a penalty in itself.
    #[test]
    fn a_case_that_failed_costs_the_team_nothing() {
        let settled = Settled::through_reveal();
        let accused = settled.teams.get(0).unwrap();
        let reason = BytesN::from_array(&settled.fixture.env, &[9u8; 32]);

        settled
            .fixture
            .client
            .open_disqualification(&accused, &reason);

        let case = settled.fixture.client.disqualification(&accused);
        let window = settled
            .fixture
            .client
            .constitution()
            .discretion
            .appeal_window;
        settled
            .fixture
            .env
            .ledger()
            .set_timestamp(case.opened_at + window);

        assert!(!settled.fixture.client.resolve_disqualification(&accused));

        settled.fixture.client.finalize_results();

        let ranking = settled.fixture.client.ranking(&payments());

        assert_eq!(ranking.len(), 2);
        assert_eq!(ranking.get(0).unwrap().team, accused);
    }
}

/// The move to award nothing, which is the sharpest power an organizer keeps
/// and therefore the one with the most conditions on it.
mod no_award {
    use super::*;

    fn defi() -> Symbol {
        symbol_short!("defi")
    }

    fn reason(settled: &Settled) -> BytesN<32> {
        BytesN::from_array(&settled.fixture.env, &[8u8; 32])
    }

    fn judge(settled: &Settled, index: u32) -> Address {
        settled
            .fixture
            .client
            .constitution()
            .judges
            .get(index)
            .unwrap()
            .judge
    }

    /// The window has to run out before anything settles, so this walks the
    /// clock past it.
    fn past_the_window(settled: &Settled) {
        let opened_at = settled.fixture.client.no_award(&defi()).opened_at;
        let window = settled
            .fixture
            .client
            .constitution()
            .discretion
            .appeal_window;

        settled
            .fixture
            .env
            .ledger()
            .set_timestamp(opened_at + window);
    }

    /// The first condition: the track carried the clause before the rules
    /// locked, so every participant read it before writing a line of code.
    #[test]
    fn a_track_that_never_carried_the_clause_cannot_reach_for_it() {
        let settled = Settled::through_finalization();

        assert_eq!(
            settled
                .fixture
                .client
                .try_open_no_award(&payments(), &reason(&settled))
                .err(),
            Some(Ok(Error::NoAwardNotDeclarable))
        );
    }

    #[test]
    fn a_marked_track_can_open_the_move_with_a_reason() {
        let settled = Settled::through_finalization();
        settled
            .fixture
            .client
            .open_no_award(&defi(), &reason(&settled));

        let case = settled.fixture.client.no_award(&defi());

        assert_eq!(case.reason, reason(&settled));
        assert_eq!(case.approvals, 0);
        assert!(!case.resolved);
    }

    #[test]
    fn the_move_cannot_be_opened_twice() {
        let settled = Settled::through_finalization();
        settled
            .fixture
            .client
            .open_no_award(&defi(), &reason(&settled));

        assert_eq!(
            settled
                .fixture
                .client
                .try_open_no_award(&defi(), &reason(&settled))
                .err(),
            Some(Ok(Error::CaseAlreadyOpen))
        );
    }

    /// The appeal window is a condition, not a formality.
    #[test]
    fn nothing_settles_while_the_appeal_window_is_open() {
        let settled = Settled::through_finalization();
        settled
            .fixture
            .client
            .open_no_award(&defi(), &reason(&settled));

        assert_eq!(
            settled.fixture.client.try_resolve_no_award(&defi()).err(),
            Some(Ok(Error::AppealWindowOpen))
        );
    }

    /// The default when the bar is not cleared: the prize is owed. A track that
    /// opened the move and failed to gather signatures pays out normally.
    #[test]
    fn a_move_the_judges_did_not_sign_fails_and_the_prize_stands() {
        let settled = Settled::through_finalization();
        settled
            .fixture
            .client
            .open_no_award(&defi(), &reason(&settled));
        past_the_window(&settled);

        assert!(!settled.fixture.client.resolve_no_award(&defi()));
        assert!(!settled.fixture.client.is_paid(&defi(), &1));
    }

    #[test]
    fn a_move_the_judges_signed_returns_the_prize_to_the_organizer() {
        let settled = Settled::through_finalization();
        let organizer = settled.fixture.organizer.clone();

        settled
            .fixture
            .client
            .open_no_award(&defi(), &reason(&settled));

        // The sample hackathon asks for two signatures.
        settled
            .fixture
            .client
            .approve_no_award(&judge(&settled, 0), &defi());
        settled
            .fixture
            .client
            .approve_no_award(&judge(&settled, 1), &defi());

        past_the_window(&settled);

        let before = settled.token.balance(&organizer);
        assert!(settled.fixture.client.resolve_no_award(&defi()));

        assert_eq!(settled.token.balance(&organizer), before + 2_000);
        assert!(
            settled.fixture.client.is_paid(&defi(), &1),
            "the position is closed so settlement cannot reach it"
        );
    }

    #[test]
    fn a_judge_cannot_sign_the_same_move_twice() {
        let settled = Settled::through_finalization();
        settled
            .fixture
            .client
            .open_no_award(&defi(), &reason(&settled));

        let judge = judge(&settled, 0);
        settled.fixture.client.approve_no_award(&judge, &defi());

        assert_eq!(
            settled
                .fixture
                .client
                .try_approve_no_award(&judge, &defi())
                .err(),
            Some(Ok(Error::AlreadySigned))
        );
        assert_eq!(settled.fixture.client.no_award(&defi()).approvals, 1);
    }

    #[test]
    fn somebody_who_is_not_a_judge_here_cannot_sign() {
        let settled = Settled::through_finalization();
        settled
            .fixture
            .client
            .open_no_award(&defi(), &reason(&settled));

        let stranger = Address::generate(&settled.fixture.env);

        assert_eq!(
            settled
                .fixture
                .client
                .try_approve_no_award(&stranger, &defi())
                .err(),
            Some(Ok(Error::NotJudge))
        );
    }

    #[test]
    fn a_settled_move_cannot_be_settled_again() {
        let settled = Settled::through_finalization();
        settled
            .fixture
            .client
            .open_no_award(&defi(), &reason(&settled));
        past_the_window(&settled);
        settled.fixture.client.resolve_no_award(&defi());

        assert_eq!(
            settled.fixture.client.try_resolve_no_award(&defi()).err(),
            Some(Ok(Error::CaseNotOpen))
        );
    }

    /// Withholding one track's prize leaves the others alone.
    #[test]
    fn the_other_tracks_pay_out_as_normal() {
        let settled = Settled::through_finalization();
        settled
            .fixture
            .client
            .open_no_award(&defi(), &reason(&settled));
        settled
            .fixture
            .client
            .approve_no_award(&judge(&settled, 0), &defi());
        settled
            .fixture
            .client
            .approve_no_award(&judge(&settled, 1), &defi());
        past_the_window(&settled);
        settled.fixture.client.resolve_no_award(&defi());

        let hold = 24 * 60 * 60;
        let now = settled.fixture.client.state().finalized_at + hold;
        settled.fixture.env.ledger().set_timestamp(now);
        settled.fixture.client.open_settlement();

        let captain = settled.captain(settled.teams.get(0).unwrap());
        settled
            .fixture
            .client
            .settle_prize(&payments(), &1, &settled.winner(&payments(), 1));

        assert_eq!(settled.token.balance(&captain), 5_000);
    }
}

/// Closing the hackathon, and what happens to a prize nobody came for.
mod closing {
    use super::*;

    fn defi() -> Symbol {
        symbol_short!("defi")
    }

    /// Settles every position the sample prize table holds.
    ///
    /// The defi track drew no entries, so its position has no winner to pay and
    /// is closed by the sweep instead. That is the ordinary case rather than an
    /// edge one: a track nobody entered still has to end somewhere.
    fn settle_everything(settled: &Settled) {
        settled
            .fixture
            .client
            .settle_prize(&payments(), &1, &settled.winner(&payments(), 1));
        settled
            .fixture
            .client
            .settle_prize(&payments(), &2, &settled.winner(&payments(), 2));

        let claim = settled
            .fixture
            .client
            .constitution()
            .discretion
            .prize_claim_period;
        let opened = settled.fixture.client.state().settlement_opened_at;
        settled.fixture.env.ledger().set_timestamp(opened + claim);

        settled.fixture.client.sweep_unclaimed(&defi(), &1);
    }

    /// A hackathon that closed with money still owed would be the outcome the
    /// proof page exists to make impossible.
    #[test]
    fn a_hackathon_cannot_close_while_a_prize_is_still_owed() {
        let settled = Settled::open();
        settled
            .fixture
            .client
            .settle_prize(&payments(), &1, &settled.winner(&payments(), 1));

        assert_eq!(
            settled.fixture.client.try_complete().err(),
            Some(Ok(Error::SettlementIncomplete))
        );
    }

    #[test]
    fn a_hackathon_closes_once_every_position_is_settled() {
        let settled = Settled::open();

        // The defi track had no entries, so its position falls to the sweep.
        settled
            .fixture
            .client
            .settle_prize(&payments(), &1, &settled.winner(&payments(), 1));
        settled
            .fixture
            .client
            .settle_prize(&payments(), &2, &settled.winner(&payments(), 2));

        let claim = settled
            .fixture
            .client
            .constitution()
            .discretion
            .prize_claim_period;
        let opened = settled.fixture.client.state().settlement_opened_at;
        settled.fixture.env.ledger().set_timestamp(opened + claim);

        settled.fixture.client.sweep_unclaimed(&defi(), &1);
        settled.fixture.client.complete();

        assert_eq!(settled.fixture.client.phase(), Phase::Completed);
    }

    /// The winner keeps the full window the rules promised them.
    #[test]
    fn nothing_is_swept_while_the_claim_period_is_open() {
        let settled = Settled::open();

        assert_eq!(
            settled
                .fixture
                .client
                .try_sweep_unclaimed(&defi(), &1)
                .err(),
            Some(Ok(Error::ClaimPeriodOpen))
        );
    }

    #[test]
    fn a_prize_nobody_came_for_goes_back_to_the_organizer() {
        let settled = Settled::open();
        let organizer = settled.fixture.organizer.clone();

        let claim = settled
            .fixture
            .client
            .constitution()
            .discretion
            .prize_claim_period;
        let opened = settled.fixture.client.state().settlement_opened_at;
        settled.fixture.env.ledger().set_timestamp(opened + claim);

        let before = settled.token.balance(&organizer);
        let swept = settled.fixture.client.sweep_unclaimed(&defi(), &1);

        assert_eq!(swept, 2_000);
        assert_eq!(settled.token.balance(&organizer), before + 2_000);
    }

    #[test]
    fn a_prize_that_was_paid_cannot_also_be_swept() {
        let settled = Settled::open();
        settled
            .fixture
            .client
            .settle_prize(&payments(), &1, &settled.winner(&payments(), 1));

        let claim = settled
            .fixture
            .client
            .constitution()
            .discretion
            .prize_claim_period;
        let opened = settled.fixture.client.state().settlement_opened_at;
        settled.fixture.env.ledger().set_timestamp(opened + claim);

        assert_eq!(
            settled
                .fixture
                .client
                .try_sweep_unclaimed(&payments(), &1)
                .err(),
            Some(Ok(Error::PrizeAlreadyPaid))
        );
    }

    /// The invariant the vault exists to hold: what went in either reached a
    /// winner or came back, and nothing is stranded.
    #[test]
    fn the_vault_empties_exactly_once_the_hackathon_closes() {
        let settled = Settled::open();
        assert_eq!(settled.vault.balance(), 10_000);

        settled
            .fixture
            .client
            .settle_prize(&payments(), &1, &settled.winner(&payments(), 1));
        settled
            .fixture
            .client
            .settle_prize(&payments(), &2, &settled.winner(&payments(), 2));

        let claim = settled
            .fixture
            .client
            .constitution()
            .discretion
            .prize_claim_period;
        let opened = settled.fixture.client.state().settlement_opened_at;
        settled.fixture.env.ledger().set_timestamp(opened + claim);
        settled.fixture.client.sweep_unclaimed(&defi(), &1);

        settled.fixture.client.complete();

        assert_eq!(settled.vault.balance(), 0);
    }

    #[test]
    fn a_closed_hackathon_cannot_be_closed_again() {
        let settled = Settled::open();
        settle_everything(&settled);
        settled.fixture.client.complete();

        assert_eq!(
            settled.fixture.client.try_complete().err(),
            Some(Ok(Error::WrongPhase))
        );
    }
}

/// Fund conservation, stated as invariants rather than as single steps.
///
/// The vault has no administrator and no withdrawal function, so every unit
/// that goes in has to leave through a route the rules named or not leave at
/// all. These tests count both sides of that sentence.
mod conservation {
    use super::*;

    use soroban_sdk::token::StellarAssetClient;

    fn defi() -> Symbol {
        symbol_short!("defi")
    }

    /// Adds to the pool from a fresh sponsor, the way a late top up arrives.
    fn top_up(settled: &Settled, amount: i128) {
        let asset = settled.fixture.client.constitution().prize_asset;
        let sponsor = Address::generate(&settled.fixture.env);

        StellarAssetClient::new(&settled.fixture.env, &asset).mint(&sponsor, &amount);
        settled.vault.deposit(&sponsor, &amount);
    }

    /// Runs the settlement to its end: both payments positions paid, the
    /// unentered defi position swept once its claim period runs out.
    fn settle_everything(settled: &Settled) {
        settled
            .fixture
            .client
            .settle_prize(&payments(), &1, &settled.winner(&payments(), 1));
        settled
            .fixture
            .client
            .settle_prize(&payments(), &2, &settled.winner(&payments(), 2));

        let claim = settled
            .fixture
            .client
            .constitution()
            .discretion
            .prize_claim_period;
        let opened = settled.fixture.client.state().settlement_opened_at;
        settled.fixture.env.ledger().set_timestamp(opened + claim);

        settled.fixture.client.sweep_unclaimed(&defi(), &1);
    }

    /// The invariant in full. Every unit deposited is either sitting in the
    /// vault or in an address the rules sent it to, and never in both places
    /// and never in neither.
    #[test]
    fn the_pool_equals_what_went_in_minus_what_was_paid_out() {
        let settled = Settled::open();
        let organizer = settled.fixture.organizer.clone();
        let first = settled.captain(settled.teams.get(0).unwrap());
        let second = settled.captain(settled.teams.get(1).unwrap());

        let deposited = 10_000i128;
        assert_eq!(settled.vault.balance(), deposited);

        settle_everything(&settled);

        let paid_out = settled.token.balance(&first)
            + settled.token.balance(&second)
            + settled.token.balance(&organizer);

        assert_eq!(paid_out, deposited);
        assert_eq!(settled.vault.balance(), deposited - paid_out);
    }

    /// Each payout moves exactly the amount the locked prize table names, out
    /// of the vault and into one account. A payment that took a different sum
    /// from the pool than it delivered would break the invariant without any
    /// single balance looking wrong.
    #[test]
    fn each_payout_takes_from_the_pool_exactly_what_it_delivers() {
        let settled = Settled::open();

        for (rank, amount) in [(1u32, 5_000i128), (2, 3_000)] {
            let captain = settled.captain(
                settled
                    .fixture
                    .client
                    .ranking(&payments())
                    .iter()
                    .find(|placement| placement.rank == rank)
                    .unwrap()
                    .team,
            );

            let pool = settled.vault.balance();
            let held = settled.token.balance(&captain);

            assert_eq!(
                settled
                    .fixture
                    .client
                    .settle_prize(&payments(), &rank, &captain),
                amount
            );
            assert_eq!(settled.vault.balance(), pool - amount);
            assert_eq!(settled.token.balance(&captain), held + amount);
        }
    }

    /// A refused payout has to be a payout that did not happen. If the pool
    /// moved before the check that turned the call down, the money would be
    /// gone and the position would still read as owed.
    #[test]
    fn a_refused_payout_leaves_the_pool_where_it_was() {
        let settled = Settled::through_finalization();
        let pool = settled.vault.balance();

        // The safety window has not run out, so settlement is not open yet.
        assert!(settled
            .fixture
            .client
            .try_settle_prize(&payments(), &1, &settled.winner(&payments(), 1))
            .is_err());
        assert_eq!(settled.vault.balance(), pool);

        let opened = Settled::open();
        opened
            .fixture
            .client
            .settle_prize(&payments(), &1, &opened.winner(&payments(), 1));
        let after_paying = opened.vault.balance();

        assert!(opened
            .fixture
            .client
            .try_settle_prize(&payments(), &1, &opened.winner(&payments(), 1))
            .is_err());
        assert_eq!(
            opened.vault.balance(),
            after_paying,
            "a second attempt at a paid position moves nothing"
        );
    }

    /// A top up arriving mid event raises the pool and nothing else. It does
    /// not raise what any winner is owed, because the prize table was locked
    /// before anybody entered.
    #[test]
    fn a_top_up_raises_the_pool_without_raising_any_prize() {
        let settled = Settled::open();
        let first = settled.captain(settled.teams.get(0).unwrap());

        top_up(&settled, 2_500);
        assert_eq!(settled.vault.balance(), 12_500);

        assert_eq!(
            settled
                .fixture
                .client
                .settle_prize(&payments(), &1, &settled.winner(&payments(), 1)),
            5_000
        );
        assert_eq!(settled.token.balance(&first), 5_000);
        assert_eq!(settled.vault.balance(), 7_500);
    }

    /// A pool larger than the prize table has nowhere to go, and the hackathon
    /// closes with the surplus still in the vault.
    ///
    /// This is a real gap rather than a design choice, and it is written down
    /// in the roadmap's deferred table. Every route out of the vault is tied to
    /// a prize position, so money deposited beyond the table is stranded: the
    /// sweep only reaches positions the table names, and there is no
    /// withdrawal function by design. The invariant itself still holds, which
    /// is why this test asserts the surplus exactly rather than pretending the
    /// vault empties.
    #[test]
    fn a_surplus_beyond_the_prize_table_has_no_route_out_yet() {
        let settled = Settled::open();

        top_up(&settled, 2_500);
        settle_everything(&settled);
        settled.fixture.client.complete();

        assert_eq!(settled.fixture.client.phase(), Phase::Completed);
        assert_eq!(
            settled.vault.balance(),
            2_500,
            "the surplus stays in the vault; no route reaches it"
        );
    }
}

/// A prize reaching a whole team rather than stopping at its captain.
///
/// This is the difference between a receipt that shows who built the project
/// and one that shows who was paid for it. The contract used to hand the lot to
/// the captain and leave the rest to a promise made off the platform; now every
/// member is paid directly and the page can show the last hop of the money.
mod shared_prizes {
    use super::*;

    /// The three people who won the payments track.
    fn winners(settled: &Settled) -> Vec<Address> {
        let team = settled.winner_team(&payments(), 1);

        settled.fixture.client.team_by_id(&team).members
    }

    /// Five thousand between three does not divide, which is the case worth
    /// building the test around.
    const FIRST_PRIZE: i128 = 5_000;

    #[test]
    fn every_member_takes_an_equal_share() {
        let settled = Settled::open_with(3);
        let members = winners(&settled);

        for index in 0..members.len() {
            let member = members.get(index).unwrap();
            let share = settled
                .fixture
                .client
                .settle_prize(&payments(), &1, &member);

            // Two of the three take one unit more, because five thousand does
            // not divide by three and the remainder is spread rather than kept.
            assert!(share == 1_667 || share == 1_666, "share was {share}");
            assert_eq!(settled.token.balance(&member), share);
        }
    }

    /// The whole prize leaves the vault. A split that quietly kept the
    /// remainder back would strand money nobody could reach.
    #[test]
    fn the_shares_add_up_to_the_prize_exactly() {
        let settled = Settled::open_with(3);
        let members = winners(&settled);
        let before = settled.vault.balance();

        let mut paid = 0i128;
        for index in 0..members.len() {
            paid +=
                settled
                    .fixture
                    .client
                    .settle_prize(&payments(), &1, &members.get(index).unwrap());
        }

        assert_eq!(paid, FIRST_PRIZE);
        assert_eq!(settled.vault.balance(), before - FIRST_PRIZE);
    }

    /// The captain is a member like any other. Being able to admit people is
    /// not a claim on the money.
    #[test]
    fn the_captain_takes_no_more_than_anybody_else() {
        let settled = Settled::open_with(3);
        let members = winners(&settled);
        let captain = settled.captain(settled.winner_team(&payments(), 1));

        let mut shares = Vec::new(&settled.fixture.env);
        for index in 0..members.len() {
            shares.push_back(settled.fixture.client.settle_prize(
                &payments(),
                &1,
                &members.get(index).unwrap(),
            ));
        }

        assert_eq!(members.get(0).unwrap(), captain, "the captain enters first");

        let highest = shares.iter().max().unwrap();
        let lowest = shares.iter().min().unwrap();
        assert_eq!(highest - lowest, 1, "nobody is more than a unit better off");
    }

    /// One member at a time, because a member whose account cannot receive the
    /// asset takes the whole transaction down with them. Paid separately they
    /// block only themselves; paid together they would freeze their teammates
    /// exactly as an unprepared winner used to freeze the other positions.
    #[test]
    fn a_position_stays_open_until_the_last_share_has_gone() {
        let settled = Settled::open_with(3);
        let members = winners(&settled);

        settled
            .fixture
            .client
            .settle_prize(&payments(), &1, &members.get(0).unwrap());
        assert!(!settled.fixture.client.is_paid(&payments(), &1));

        settled
            .fixture
            .client
            .settle_prize(&payments(), &1, &members.get(1).unwrap());
        assert!(!settled.fixture.client.is_paid(&payments(), &1));

        settled
            .fixture
            .client
            .settle_prize(&payments(), &1, &members.get(2).unwrap());
        assert!(settled.fixture.client.is_paid(&payments(), &1));
    }

    #[test]
    fn a_member_cannot_be_paid_their_share_twice() {
        let settled = Settled::open_with(3);
        let member = winners(&settled).get(0).unwrap();

        settled
            .fixture
            .client
            .settle_prize(&payments(), &1, &member);

        assert_eq!(
            settled
                .fixture
                .client
                .try_settle_prize(&payments(), &1, &member)
                .err(),
            Some(Ok(Error::PrizeAlreadyPaid))
        );
    }

    /// A share belongs to the team that won it. Somebody who merely names the
    /// position gets nothing.
    #[test]
    fn somebody_outside_the_team_has_no_share_to_take() {
        let settled = Settled::open_with(3);
        let stranger = Address::generate(&settled.fixture.env);

        assert_eq!(
            settled
                .fixture
                .client
                .try_settle_prize(&payments(), &1, &stranger)
                .err(),
            Some(Ok(Error::NotTeamMember))
        );
    }

    /// The hackathon cannot close while one member is still owed, which is the
    /// same promise the product already made per position, now made per person.
    #[test]
    fn the_hackathon_cannot_close_while_a_share_is_still_owed() {
        let settled = Settled::open_with(3);
        let members = winners(&settled);

        settled
            .fixture
            .client
            .settle_prize(&payments(), &1, &members.get(0).unwrap());

        assert_eq!(
            settled.fixture.client.try_complete().err(),
            Some(Ok(Error::SettlementIncomplete))
        );
    }

    /// A member who never comes for their share does not hold the event open
    /// forever, and the ones who did come keep what they took.
    #[test]
    fn a_share_nobody_came_for_goes_back_without_touching_the_others() {
        let settled = Settled::open_with(3);
        let members = winners(&settled);
        let organizer = settled.fixture.organizer.clone();

        let collected = members.get(0).unwrap();
        let taken = settled
            .fixture
            .client
            .settle_prize(&payments(), &1, &collected);

        let claim = settled
            .fixture
            .client
            .constitution()
            .discretion
            .prize_claim_period;
        let opened = settled.fixture.client.state().settlement_opened_at;
        settled.fixture.env.ledger().set_timestamp(opened + claim);

        let before = settled.token.balance(&organizer);
        let mut swept = 0i128;
        for index in 1..members.len() {
            swept +=
                settled
                    .fixture
                    .client
                    .sweep_share(&payments(), &1, &members.get(index).unwrap());
        }

        assert_eq!(taken + swept, FIRST_PRIZE);
        assert_eq!(settled.token.balance(&organizer), before + swept);
        assert_eq!(
            settled.token.balance(&collected),
            taken,
            "the member who came keeps what they took"
        );
        assert!(settled.fixture.client.is_paid(&payments(), &1));
    }
}
