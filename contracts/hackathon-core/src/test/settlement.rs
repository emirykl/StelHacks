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
        let fixture = Fixture::funded_and_open();
        let env = fixture.env.clone();
        let schedule = fixture.client.state().schedule;

        env.ledger()
            .set_timestamp(schedule.registration_opens_at + 3_600);

        let mut teams = Vec::new(&env);
        teams.push_back(Self::enter(&fixture, 1));
        teams.push_back(Self::enter(&fixture, 2));

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

        fixture.client.finalize_results();

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
        let settled = Settled::through_finalization();
        let hold = 24 * 60 * 60;
        let now = settled.fixture.client.state().finalized_at + hold;

        settled.fixture.env.ledger().set_timestamp(now);
        settled.fixture.client.open_settlement();

        settled
    }

    fn enter(fixture: &Fixture, digest: u8) -> u32 {
        let captain = Address::generate(&fixture.env);
        fixture.client.apply(&captain);
        let organizer = fixture.organizer.clone();
        fixture.client.approve_application(&organizer, &captain);

        let team = fixture.client.create_team(&captain);
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
            .try_settle_prize(&payments(), &1)
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

    let paid = settled.fixture.client.settle_prize(&payments(), &1);

    assert_eq!(paid, 5_000);
    assert_eq!(settled.token.balance(&captain), 5_000);
    assert_eq!(settled.vault.balance(), 5_000);
    assert!(settled.fixture.client.is_paid(&payments(), &1));
}

#[test]
fn the_runner_up_is_paid_their_own_position() {
    let settled = Settled::open();
    let second = settled.captain(settled.teams.get(1).unwrap());

    settled.fixture.client.settle_prize(&payments(), &2);

    assert_eq!(settled.token.balance(&second), 3_000);
}

#[test]
fn a_position_cannot_be_paid_twice() {
    let settled = Settled::open();
    settled.fixture.client.settle_prize(&payments(), &1);

    assert_eq!(
        settled
            .fixture
            .client
            .try_settle_prize(&payments(), &1)
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
    settled.fixture.client.settle_prize(&payments(), &1);

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
            .try_settle_prize(&payments(), &1)
            .err(),
        Some(Ok(Error::SettlementPaused))
    );

    settled.fixture.client.resume_settlement(&reason);
    settled.fixture.client.settle_prize(&payments(), &1);

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
            .try_settle_prize(&payments(), &9)
            .err(),
        Some(Ok(Error::PrizeTiersInvalid))
    );
}

/// The vault only ever gives up what the prize table says.
#[test]
fn the_pool_falls_by_exactly_the_prize_that_was_paid() {
    let settled = Settled::open();
    let before = settled.vault.balance();

    settled.fixture.client.settle_prize(&payments(), &1);
    settled.fixture.client.settle_prize(&payments(), &2);

    assert_eq!(settled.vault.balance(), before - 8_000);
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
            Some(Ok(Error::NoAwardAlreadyOpen))
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
            Some(Ok(Error::NoAwardAlreadyResolved))
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
        settled.fixture.client.settle_prize(&payments(), &1);

        assert_eq!(settled.token.balance(&captain), 5_000);
    }
}
