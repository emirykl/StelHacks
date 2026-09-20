//! Outside money joining a prize pool that is already frozen.
//!
//! The vault always took deposits from anyone. What these tests are about is
//! the half that was missing: money that arrives after the lock now has a
//! position to land on, an owner who can be paid it back, and a door the
//! organizer had to open before anybody started building.

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{symbol_short, Address, BytesN, Symbol};

use crate::constitution::SponsorshipPolicy;
use crate::errors::Error;
use crate::phase::Phase;
use crate::sponsorship::MAX_SPONSORSHIPS;
use crate::test::Fixture;

use prize_vault::PrizeVaultClient;
use soroban_sdk::token::{StellarAssetClient, TokenClient};

/// A published hackathon whose rules let sponsors in.
///
/// The sample constitution already opens the door, so this is
/// `funded_and_open` under another name; it is spelled out here so a reader of
/// these tests does not have to go and check that.
fn open() -> Fixture {
    Fixture::funded_and_open()
}

/// The same hackathon with the door shut, which is the default an organizer
/// gets by not thinking about it.
fn shut() -> Fixture {
    Fixture::funded_and_open_with(|constitution| {
        constitution.sponsorship = SponsorshipPolicy::closed(symbol_short!("payments"));
    })
}

/// A wallet holding enough of the prize asset to sponsor with.
fn sponsor_holding(fixture: &Fixture, amount: i128) -> Address {
    let who = Address::generate(&fixture.env);
    let asset = fixture.client.constitution().prize_asset;

    StellarAssetClient::new(&fixture.env, &asset).mint(&who, &amount);

    who
}

fn token(fixture: &Fixture) -> TokenClient<'static> {
    TokenClient::new(&fixture.env, &fixture.client.constitution().prize_asset)
}

fn vault(fixture: &Fixture) -> PrizeVaultClient<'static> {
    PrizeVaultClient::new(&fixture.env, &fixture.client.vault())
}

fn note(fixture: &Fixture) -> BytesN<32> {
    BytesN::from_array(&fixture.env, &[9u8; 32])
}

fn payments() -> Symbol {
    symbol_short!("payments")
}

/// Moves the clock to a moment inside the open window, where a sponsor would
/// realistically arrive.
fn during_the_event(fixture: &Fixture) {
    let opens_at = fixture.client.state().schedule.registration_opens_at;
    fixture.env.ledger().set_timestamp(opens_at + 3_600);
}

/// The whole point of the feature, in one assertion: a position that was frozen
/// at five thousand is worth six after somebody adds a thousand to it.
#[test]
fn a_contribution_grows_the_position_it_names() {
    let fixture = open();
    during_the_event(&fixture);

    assert_eq!(fixture.client.payable(&payments(), &1), 5_000);

    let sponsor = sponsor_holding(&fixture, 1_050);
    let worth = fixture
        .client
        .sponsor_tier(&sponsor, &payments(), &1, &1_000, &note(&fixture));

    assert_eq!(worth, 6_000);
    assert_eq!(fixture.client.payable(&payments(), &1), 6_000);

    // The other positions are untouched. Money aimed at one place landing in
    // two would make the prize table unreadable.
    assert_eq!(fixture.client.payable(&payments(), &2), 3_000);
    assert_eq!(fixture.client.payable(&symbol_short!("defi"), &1), 2_000);
}

/// The cut is charged on top, as it is everywhere else in this contract. A
/// sponsor announcing a thousand pays one thousand and fifty, and the winner is
/// paid the thousand. Taking it out of the contribution instead would make the
/// sponsor's announced bounty and the winner's payment two different numbers.
#[test]
fn the_platform_cut_is_charged_on_top_of_the_contribution() {
    let fixture = open();
    during_the_event(&fixture);

    let before = vault(&fixture).balance();
    let sponsor = sponsor_holding(&fixture, 1_050);

    fixture
        .client
        .sponsor_tier(&sponsor, &payments(), &1, &1_000, &note(&fixture));

    // Five percent of a thousand, paid by the sponsor rather than taken from
    // the prize.
    assert_eq!(fixture.client.sponsored_fee(), 50);
    assert_eq!(fixture.client.payable(&payments(), &1), 6_000);

    assert_eq!(token(&fixture).balance(&sponsor), 0);
    assert_eq!(vault(&fixture).balance(), before + 1_050);
}

/// Every contribution is a record, not just a number added to a total. The wall
/// of names, the refund on a cancellation and the reader asking whose money is
/// behind a prize all need the list, and a sum could answer none of them.
#[test]
fn a_contribution_leaves_a_record_naming_who_paid_it() {
    let fixture = open();
    during_the_event(&fixture);

    assert_eq!(fixture.client.sponsorship_count(), 0);

    let sponsor = sponsor_holding(&fixture, 1_050);
    fixture
        .client
        .sponsor_tier(&sponsor, &payments(), &1, &1_000, &note(&fixture));

    assert_eq!(fixture.client.sponsorship_count(), 1);

    let filed = fixture.client.sponsorship(&0);

    assert_eq!(filed.sponsor, sponsor);
    assert_eq!(filed.track, payments());
    assert_eq!(filed.rank, 1);
    assert_eq!(filed.amount, 1_000);
    assert_eq!(filed.fee, 50);
    assert_eq!(filed.note, note(&fixture));
}

/// The door has to have been opened before the lock. An organizer who left this
/// shut cannot be talked into it afterwards, which is the same line every other
/// discretionary power in this contract sits behind.
#[test]
fn a_hackathon_that_never_opened_the_door_takes_nothing() {
    let fixture = shut();
    during_the_event(&fixture);

    let sponsor = sponsor_holding(&fixture, 1_050);

    assert_eq!(
        fixture
            .client
            .try_sponsor_tier(&sponsor, &payments(), &1, &1_000, &note(&fixture))
            .err(),
        Some(Ok(Error::SponsorshipRefused))
    );

    assert_eq!(fixture.client.payable(&payments(), &1), 5_000);
    assert_eq!(fixture.client.sponsorship_count(), 0);
}

/// The floor keeps the wall readable. Without it anybody who wanted the list of
/// sponsors to be useless could bury it under a hundred contributions of one
/// stroop each.
#[test]
fn a_contribution_under_the_announced_floor_is_refused() {
    let fixture = open();
    during_the_event(&fixture);

    let sponsor = sponsor_holding(&fixture, 1_050);

    assert_eq!(
        fixture
            .client
            .try_sponsor_tier(&sponsor, &payments(), &1, &99, &note(&fixture))
            .err(),
        Some(Ok(Error::SponsorshipRefused)),
        "the sample rules set the floor at a hundred"
    );

    // The floor itself is allowed. An inclusive bound written as an exclusive
    // one would refuse the exact amount the rules invited.
    fixture
        .client
        .sponsor_tier(&sponsor, &payments(), &1, &100, &note(&fixture));

    assert_eq!(fixture.client.payable(&payments(), &1), 5_100);
}

/// Aiming at a position the table does not have would be money with nowhere to
/// go, which is the whole problem this feature exists to remove.
#[test]
fn a_position_that_is_not_in_the_table_cannot_be_sponsored() {
    let fixture = open();
    during_the_event(&fixture);

    let sponsor = sponsor_holding(&fixture, 1_050);

    assert_eq!(
        fixture
            .client
            .try_sponsor_tier(&sponsor, &payments(), &9, &1_000, &note(&fixture))
            .err(),
        Some(Ok(Error::NotFound)),
        "the payments track pays two positions, not nine"
    );

    assert_eq!(
        fixture
            .client
            .try_sponsor_tier(
                &sponsor,
                &symbol_short!("ghost"),
                &1,
                &1_000,
                &note(&fixture)
            )
            .err(),
        Some(Ok(Error::NotFound))
    );
}

/// The near end of the window.
///
/// Before publication the pool is measured against `required_funding`, and a
/// contribution counted toward that check would let an organizer open a
/// hackathon whose prize table their own money does not cover.
#[test]
fn nothing_can_be_sponsored_before_the_doors_open() {
    let fixture = Fixture::locked_with_asset();
    let sponsor = Address::generate(&fixture.env);

    assert_eq!(fixture.client.phase(), Phase::Funding);
    assert_eq!(
        fixture
            .client
            .try_sponsor_tier(&sponsor, &payments(), &1, &1_000, &note(&fixture))
            .err(),
        Some(Ok(Error::WrongPhase))
    );
}

/// The far end of it, and the one that matters.
///
/// Money arriving after the ranking is closed is money aimed at a person rather
/// than at a position, and a sponsor who could wait until the winner was known
/// would be paying a name.
#[test]
fn nothing_can_be_sponsored_once_the_ranking_is_closed() {
    let fixture = open();
    let schedule = fixture.client.state().schedule;
    let sponsor = sponsor_holding(&fixture, 1_050);

    // Carried to the reveal, where a contribution is still welcome.
    fixture
        .env
        .ledger()
        .set_timestamp(schedule.submission_closes_at + 1);
    fixture.client.advance_phase();
    fixture
        .env
        .ledger()
        .set_timestamp(schedule.screening_closes_at + 1);
    fixture.client.advance_phase();
    fixture
        .env
        .ledger()
        .set_timestamp(schedule.judging_closes_at + 1);
    fixture.client.advance_phase();

    assert_eq!(fixture.client.phase(), Phase::Reveal);
    fixture
        .client
        .sponsor_tier(&sponsor, &payments(), &1, &1_000, &note(&fixture));

    fixture.client.finalize_results();

    let late = sponsor_holding(&fixture, 1_050);
    assert_eq!(
        fixture
            .client
            .try_sponsor_tier(&late, &payments(), &1, &1_000, &note(&fixture))
            .err(),
        Some(Ok(Error::WrongPhase))
    );
}

/// A cancelled event earned nothing, so the sponsor gets the prize and the fee
/// back. Handing somebody else's contribution to the organizer of an event that
/// did not happen was never defensible; before there was a deposit ledger it
/// was simply what happened.
#[test]
fn a_cancelled_hackathon_pays_its_sponsors_back_before_its_organizer() {
    let fixture = open();
    let organizer = fixture.organizer.clone();
    during_the_event(&fixture);

    let sponsor = sponsor_holding(&fixture, 1_050);
    fixture
        .client
        .sponsor_tier(&sponsor, &payments(), &1, &1_000, &note(&fixture));

    fixture.client.open_cancellation(&note(&fixture));
    for index in 0..2u32 {
        let judge = fixture
            .client
            .constitution()
            .judges
            .get(index)
            .unwrap()
            .judge;
        fixture.client.approve_cancellation(&judge);
    }

    let returned = fixture.client.resolve_cancellation();

    assert_eq!(fixture.client.phase(), Phase::Cancelled);
    assert_eq!(
        token(&fixture).balance(&sponsor),
        1_050,
        "the prize and the cut both go back"
    );
    assert_eq!(
        token(&fixture).balance(&organizer),
        10_500,
        "and the organizer still gets exactly what they put in"
    );
    assert_eq!(returned, 11_550);
    assert_eq!(vault(&fixture).balance(), 0, "the vault empties completely");
}

/// The cap is what makes the refund above possible. An unbounded list is an
/// event that can grow past the point where every sponsor fits in the one
/// invocation that pays them back, and a cancellation nobody can complete is
/// money stranded by the call meant to release it.
#[test]
fn a_hackathon_stops_taking_contributions_at_the_cap() {
    let fixture = open();
    during_the_event(&fixture);

    let sponsor = sponsor_holding(&fixture, 105 * (MAX_SPONSORSHIPS as i128 + 1));

    for _ in 0..MAX_SPONSORSHIPS {
        fixture
            .client
            .sponsor_tier(&sponsor, &payments(), &1, &100, &note(&fixture));
    }

    assert_eq!(fixture.client.sponsorship_count(), MAX_SPONSORSHIPS);
    assert_eq!(
        fixture
            .client
            .try_sponsor_tier(&sponsor, &payments(), &1, &100, &note(&fixture))
            .err(),
        Some(Ok(Error::SponsorshipRefused))
    );
}

/// Contributions accumulate rather than replace. Two sponsors behind one
/// position is the case the feature is actually for, and a second call that
/// overwrote the first would quietly lose somebody's money.
#[test]
fn several_sponsors_can_stand_behind_one_position() {
    let fixture = open();
    during_the_event(&fixture);

    let first = sponsor_holding(&fixture, 1_050);
    let second = sponsor_holding(&fixture, 2_100);

    fixture
        .client
        .sponsor_tier(&first, &payments(), &1, &1_000, &note(&fixture));
    fixture
        .client
        .sponsor_tier(&second, &payments(), &1, &2_000, &note(&fixture));

    assert_eq!(fixture.client.payable(&payments(), &1), 8_000);
    assert_eq!(fixture.client.sponsorship_count(), 2);
    assert_eq!(fixture.client.sponsored_fee(), 150);
}

/// One contribution aimed at a whole track rather than at one place in it.
///
/// The case the picker could not express. Somebody with a hundred dollars and
/// goodwill wants the prizes to be bigger, and `sponsor_tier` made them name
/// which one of the winners benefits — a decision about strangers, taken by
/// pressing the top row.
mod spread {
    use super::*;

    use soroban_sdk::vec;

    use crate::constitution::PrizeTier;
    use crate::sponsorship::Split;

    /// The whole point: money typed once reaches every place in the track, and
    /// leaves the tracks it was not aimed at alone.
    #[test]
    fn a_contribution_spread_over_a_track_reaches_every_place_in_it() {
        let fixture = open();
        during_the_event(&fixture);

        let sponsor = sponsor_holding(&fixture, 1_050);
        let worth = fixture.client.sponsor_places(
            &sponsor,
            &payments(),
            &1_000,
            &Split::Evenly,
            &note(&fixture),
        );

        assert_eq!(fixture.client.payable(&payments(), &1), 5_500);
        assert_eq!(fixture.client.payable(&payments(), &2), 3_500);
        assert_eq!(worth, 9_000, "the track as a whole, not one position");

        assert_eq!(
            fixture.client.payable(&symbol_short!("defi"), &1),
            2_000,
            "a track nobody aimed at is untouched"
        );
    }

    /// An even split is even in money, not in proportion. The gap between
    /// first and second narrows, and that is the thing being chosen.
    #[test]
    fn an_even_split_gives_the_same_money_to_every_place() {
        let fixture = open();
        during_the_event(&fixture);

        let sponsor = sponsor_holding(&fixture, 2_100);
        fixture.client.sponsor_places(
            &sponsor,
            &payments(),
            &2_000,
            &Split::Evenly,
            &note(&fixture),
        );

        let first = fixture.client.payable(&payments(), &1) - 5_000;
        let second = fixture.client.payable(&payments(), &2) - 3_000;

        assert_eq!(first, second);
        assert_eq!(first, 1_000);
    }

    /// A weighted split leaves the table's own shape alone. Five to three
    /// going in is five to three coming out, which is what an organizer who
    /// wrote that table meant by it.
    #[test]
    fn a_weighted_split_keeps_the_shape_of_the_table() {
        let fixture = open();
        during_the_event(&fixture);

        let sponsor = sponsor_holding(&fixture, 840);
        fixture.client.sponsor_places(
            &sponsor,
            &payments(),
            &800,
            &Split::ByWorth,
            &note(&fixture),
        );

        assert_eq!(fixture.client.payable(&payments(), &1), 5_500);
        assert_eq!(fixture.client.payable(&payments(), &2), 3_300);
    }

    /// The weight is what a place is worth now, not what it froze at. A
    /// sponsor reading the prize table sees the numbers other sponsors have
    /// already grown, and a proportion taken over different numbers from the
    /// ones on screen would be a split nobody asked for.
    #[test]
    fn a_weighted_split_follows_what_a_place_is_worth_today() {
        let fixture = open();
        during_the_event(&fixture);

        let first = sponsor_holding(&fixture, 5_250);
        fixture
            .client
            .sponsor_tier(&first, &payments(), &2, &5_000, &note(&fixture));

        // 5,000 against 8,000 now, so a weighted thirteen hundred goes five to
        // eight rather than the five to three the frozen table would have said.
        let second = sponsor_holding(&fixture, 1_365);
        fixture.client.sponsor_places(
            &second,
            &payments(),
            &1_300,
            &Split::ByWorth,
            &note(&fixture),
        );

        assert_eq!(fixture.client.payable(&payments(), &1), 5_500);
        assert_eq!(fixture.client.payable(&payments(), &2), 8_800);
    }

    /// Integer division does not divide. Whatever it cannot place goes to the
    /// best position rather than nowhere, because money the vault took and no
    /// position was credited with is money settlement cannot pay out.
    #[test]
    fn a_split_that_does_not_come_out_even_still_places_every_stroop() {
        let fixture = open();
        during_the_event(&fixture);

        let sponsor = sponsor_holding(&fixture, 106);
        fixture
            .client
            .sponsor_places(&sponsor, &payments(), &101, &Split::Evenly, &note(&fixture));

        let first = fixture.client.payable(&payments(), &1) - 5_000;
        let second = fixture.client.payable(&payments(), &2) - 3_000;

        assert_eq!(first + second, 101, "nothing fell off the end");
        assert_eq!(first, 51, "and the odd stroop went to the best place");
    }

    /// One line on the wall, not one per place.
    ///
    /// `MAX_SPONSORSHIPS` bounds the list a cancellation walks inside a single
    /// invocation. Filing a four place table as four contributions would empty
    /// that allowance four times as fast for one person's hundred dollars, and
    /// would print their name four times to say one thing.
    #[test]
    fn a_spread_contribution_files_as_one_line_on_the_wall() {
        let fixture = open();
        during_the_event(&fixture);

        let sponsor = sponsor_holding(&fixture, 1_050);
        fixture.client.sponsor_places(
            &sponsor,
            &payments(),
            &1_000,
            &Split::Evenly,
            &note(&fixture),
        );

        assert_eq!(fixture.client.sponsorship_count(), 1);

        let filed = fixture.client.sponsorship(&0);
        assert_eq!(filed.sponsor, sponsor);
        assert_eq!(filed.amount, 1_000, "the whole of it, not a slice");
        assert_eq!(
            filed.rank, 0,
            "no rank, because it was not aimed at a position"
        );
    }

    /// The cut is charged on the contribution, once, exactly as it is on a
    /// contribution aimed at one place. A sponsor spreading a thousand pays
    /// one thousand and fifty, and the track grows by the thousand.
    #[test]
    fn the_cut_on_a_spread_contribution_is_taken_on_the_whole_of_it() {
        let fixture = open();
        during_the_event(&fixture);

        let sponsor = sponsor_holding(&fixture, 1_050);
        fixture.client.sponsor_places(
            &sponsor,
            &payments(),
            &1_000,
            &Split::Evenly,
            &note(&fixture),
        );

        assert_eq!(token(&fixture).balance(&sponsor), 0);
        assert_eq!(fixture.client.sponsored_fee(), 50);
        assert_eq!(
            fixture.client.payable(&payments(), &1) + fixture.client.payable(&payments(), &2),
            9_000,
            "the prizes grew by the contribution, not by the contribution less the cut"
        );
    }

    /// The floor is measured against the contribution rather than against the
    /// slices. It exists to keep the wall readable and the wall shows one line
    /// per contribution, so a table with more places must not be harder to
    /// sponsor than one with fewer.
    #[test]
    fn the_floor_is_measured_against_the_whole_contribution() {
        let fixture = open();
        during_the_event(&fixture);

        // A hundred over two places is fifty each, and fifty is under the
        // announced floor. The hundred is not.
        let sponsor = sponsor_holding(&fixture, 105);
        fixture
            .client
            .sponsor_places(&sponsor, &payments(), &100, &Split::Evenly, &note(&fixture));

        assert_eq!(fixture.client.payable(&payments(), &1), 5_050);
        assert_eq!(fixture.client.payable(&payments(), &2), 3_050);
    }

    /// Every other refusal `sponsor_tier` makes, this one makes too. The two
    /// paths share the gate precisely so a rule cannot end up enforced on one
    /// and not the other.
    #[test]
    fn a_spread_contribution_passes_the_same_gate_as_a_single_one() {
        let shut = shut();
        during_the_event(&shut);

        let refused = sponsor_holding(&shut, 1_050);
        assert_eq!(
            shut.client
                .try_sponsor_places(&refused, &payments(), &1_000, &Split::Evenly, &note(&shut))
                .err(),
            Some(Ok(Error::SponsorshipRefused)),
            "a door that was never opened"
        );

        let open = open();
        during_the_event(&open);

        let stingy = sponsor_holding(&open, 105);
        assert_eq!(
            open.client
                .try_sponsor_places(&stingy, &payments(), &99, &Split::Evenly, &note(&open))
                .err(),
            Some(Ok(Error::SponsorshipRefused)),
            "under the announced floor"
        );
    }

    /// A track that is not in the table is money with nowhere to go, which is
    /// the whole problem this feature exists to remove.
    #[test]
    fn a_track_nobody_is_running_cannot_be_spread_over() {
        let fixture = open();
        during_the_event(&fixture);

        let sponsor = sponsor_holding(&fixture, 1_050);
        assert_eq!(
            fixture
                .client
                .try_sponsor_places(
                    &sponsor,
                    &symbol_short!("nope"),
                    &1_000,
                    &Split::Evenly,
                    &note(&fixture)
                )
                .err(),
            Some(Ok(Error::NotFound))
        );
    }

    /// The same table and the same two answers as `sharesOf` in the browser.
    ///
    /// That function is what a sponsor is shown before they sign, and this is
    /// what actually moves their money a second later. They are two hand
    /// written copies of one division, in two languages, and the only thing
    /// keeping them honest is that both are pinned to the same figures. If
    /// this test has to change, `frontend/lib/sponsor.test.ts` changes with
    /// it or the page starts quoting a split the chain does not make.
    #[test]
    fn the_split_matches_the_one_the_browser_quotes() {
        // A fixture each, because the second contribution would otherwise be
        // dividing a table the first one had already grown, and the whole
        // point is that both sides divide the same numbers.
        let evenly = four_places();
        during_the_event(&evenly);

        let one = sponsor_holding(&evenly, 105);
        evenly
            .client
            .sponsor_places(&one, &payments(), &100, &Split::Evenly, &note(&evenly));

        assert_eq!(evenly.client.payable(&payments(), &1), 3_025);
        assert_eq!(evenly.client.payable(&payments(), &2), 2_025);
        assert_eq!(evenly.client.payable(&payments(), &3), 1_525);
        assert_eq!(evenly.client.payable(&payments(), &4), 1_025);

        // Seven and a half thousand across the four, so a hundred by worth is
        // forty, twenty six, twenty and thirteen — ninety nine — and the odd
        // stroop of the division lands on first place.
        let by_worth = four_places();
        during_the_event(&by_worth);

        let two = sponsor_holding(&by_worth, 105);
        by_worth
            .client
            .sponsor_places(&two, &payments(), &100, &Split::ByWorth, &note(&by_worth));

        assert_eq!(by_worth.client.payable(&payments(), &1), 3_041);
        assert_eq!(by_worth.client.payable(&payments(), &2), 2_026);
        assert_eq!(by_worth.client.payable(&payments(), &3), 1_520);
        assert_eq!(by_worth.client.payable(&payments(), &4), 1_013);
    }

    /// The table in `frontend/lib/sponsor.test.ts`, to the stroop.
    fn four_places() -> Fixture {
        Fixture::funded_and_open_with(|constitution| {
            constitution.prize_tiers = vec![
                &constitution.prize_tiers.env(),
                PrizeTier {
                    track: payments(),
                    rank: 1,
                    amount: 3_000,
                },
                PrizeTier {
                    track: payments(),
                    rank: 2,
                    amount: 2_000,
                },
                PrizeTier {
                    track: payments(),
                    rank: 3,
                    amount: 1_500,
                },
                PrizeTier {
                    track: payments(),
                    rank: 4,
                    amount: 1_000,
                },
            ];
        })
    }

    /// A cancelled event earned nothing, and a contribution with no rank on it
    /// is still a contribution somebody made. The refund walks the same list
    /// whatever the money was aimed at.
    #[test]
    fn a_cancelled_hackathon_pays_a_spread_contribution_back_whole() {
        let fixture = open();
        during_the_event(&fixture);

        let sponsor = sponsor_holding(&fixture, 1_050);
        fixture.client.sponsor_places(
            &sponsor,
            &payments(),
            &1_000,
            &Split::Evenly,
            &note(&fixture),
        );

        fixture.client.open_cancellation(&note(&fixture));
        for index in 0..2u32 {
            let judge = fixture
                .client
                .constitution()
                .judges
                .get(index)
                .unwrap()
                .judge;
            fixture.client.approve_cancellation(&judge);
        }

        fixture.client.resolve_cancellation();

        assert_eq!(
            token(&fixture).balance(&sponsor),
            1_050,
            "the prize and the cut both go back"
        );
        assert_eq!(vault(&fixture).balance(), 0);
    }
}

/// A sponsor asking for a track of their own, rather than adding to one that
/// already exists.
mod tracks {
    use super::*;

    use soroban_sdk::{vec, Vec};

    use crate::constitution::PrizeTier;
    use crate::hashing::scorecard_leaf;
    use crate::scorecard::{CriterionScore, Scorecard};
    use crate::sponsorship::TrackStatus;
    use crate::test::build_tree;

    use soroban_sdk::String;

    fn extra() -> Symbol {
        symbol_short!("extra")
    }

    /// One position paying two thousand, which is the shape a sponsor track
    /// takes when the sponsor only cares about a winner.
    fn one_position(fixture: &Fixture, amount: i128) -> Vec<PrizeTier> {
        vec![
            &fixture.env,
            PrizeTier {
                track: extra(),
                rank: 1,
                amount,
            },
        ]
    }

    /// A sponsor who has proposed a two thousand track and been accepted.
    fn accepted(fixture: &Fixture) -> Address {
        let sponsor = sponsor_holding(fixture, 2_100);

        fixture.client.propose_track(
            &sponsor,
            &extra(),
            &one_position(fixture, 2_000),
            &note(fixture),
        );
        fixture.client.accept_track(&extra());

        sponsor
    }

    /// The money arrives with the request, so the organizer is never asked to
    /// accept a track that might turn out to have nothing behind it.
    #[test]
    fn a_proposal_pays_before_it_asks() {
        let fixture = open();
        during_the_event(&fixture);

        let before = vault(&fixture).balance();
        let sponsor = sponsor_holding(&fixture, 2_100);

        fixture.client.propose_track(
            &sponsor,
            &extra(),
            &one_position(&fixture, 2_000),
            &note(&fixture),
        );

        let asked = fixture.client.sponsor_track(&extra());

        assert_eq!(asked.status, TrackStatus::Proposed);
        assert_eq!(asked.sponsor, sponsor);
        assert_eq!(asked.total(), 2_000);
        assert_eq!(asked.fee, 100);
        assert_eq!(vault(&fixture).balance(), before + 2_100);
        assert_eq!(token(&fixture).balance(&sponsor), 0);
    }

    /// Paying is not a way in. A track carries the event's name as much as the
    /// sponsor's, and a proposal that opened itself would be selling the
    /// organizer's reputation by the bounty.
    #[test]
    fn a_proposed_track_is_not_open_until_the_organizer_says_so() {
        let fixture = open();
        during_the_event(&fixture);

        let sponsor = sponsor_holding(&fixture, 2_100);
        fixture.client.propose_track(
            &sponsor,
            &extra(),
            &one_position(&fixture, 2_000),
            &note(&fixture),
        );

        let captain = Address::generate(&fixture.env);
        let organizer = fixture.organizer.clone();
        fixture.client.apply(&captain);
        fixture.client.approve_application(&organizer, &captain);
        let team = fixture.client.create_team(&captain);

        assert_eq!(
            fixture
                .client
                .try_submit_project(
                    &captain,
                    &team,
                    &extra(),
                    &BytesN::from_array(&fixture.env, &[1u8; 32]),
                    &String::from_str(&fixture.env, "ipfs://cid"),
                )
                .err(),
            Some(Ok(Error::NotFound)),
            "a track still waiting on an answer takes no entries"
        );

        fixture.client.accept_track(&extra());

        fixture.client.submit_project(
            &captain,
            &team,
            &extra(),
            &BytesN::from_array(&fixture.env, &[1u8; 32]),
            &String::from_str(&fixture.env, "ipfs://cid"),
        );

        assert_eq!(fixture.client.submission(&team).track, extra());
    }

    /// Turning one down and returning the money are the same call, so there is
    /// no state where a sponsor has been told no and the contract is still
    /// holding what they paid.
    #[test]
    fn declining_hands_the_money_straight_back() {
        let fixture = open();
        during_the_event(&fixture);

        let before = vault(&fixture).balance();
        let sponsor = sponsor_holding(&fixture, 2_100);

        fixture.client.propose_track(
            &sponsor,
            &extra(),
            &one_position(&fixture, 2_000),
            &note(&fixture),
        );

        assert_eq!(fixture.client.decline_track(&extra()), 2_100);

        assert_eq!(token(&fixture).balance(&sponsor), 2_100);
        assert_eq!(vault(&fixture).balance(), before);
        assert_eq!(
            fixture.client.sponsor_track(&extra()).status,
            TrackStatus::Declined
        );
    }

    /// An answered proposal is answered. Accepting one that was declined would
    /// open a track whose money has already gone home.
    #[test]
    fn a_track_cannot_be_decided_twice() {
        let fixture = open();
        during_the_event(&fixture);

        let sponsor = sponsor_holding(&fixture, 2_100);
        fixture.client.propose_track(
            &sponsor,
            &extra(),
            &one_position(&fixture, 2_000),
            &note(&fixture),
        );
        fixture.client.decline_track(&extra());

        assert_eq!(
            fixture.client.try_accept_track(&extra()).err(),
            Some(Ok(Error::SponsorshipRefused))
        );
    }

    /// Every ranking, scorecard and payment in this contract is keyed by the
    /// track's name, so two competitions answering to one name would be two
    /// competitions sharing a ranking.
    #[test]
    fn a_name_already_in_use_is_refused() {
        let fixture = open();
        during_the_event(&fixture);

        let sponsor = sponsor_holding(&fixture, 4_200);

        assert_eq!(
            fixture
                .client
                .try_propose_track(
                    &sponsor,
                    &payments(),
                    &vec![
                        &fixture.env,
                        PrizeTier {
                            track: payments(),
                            rank: 1,
                            amount: 2_000,
                        },
                    ],
                    &note(&fixture),
                )
                .err(),
            Some(Ok(Error::SponsorshipRefused)),
            "a frozen track's name is taken"
        );

        fixture.client.propose_track(
            &sponsor,
            &extra(),
            &one_position(&fixture, 2_000),
            &note(&fixture),
        );

        assert_eq!(
            fixture
                .client
                .try_propose_track(
                    &sponsor,
                    &extra(),
                    &one_position(&fixture, 2_000),
                    &note(&fixture),
                )
                .err(),
            Some(Ok(Error::SponsorshipRefused)),
            "and so is one already asked for"
        );
    }

    /// The allowance was announced before the lock, and a refused proposal
    /// gives its slot back so a sponsor cannot hold the allowance open with
    /// requests nobody answered.
    #[test]
    fn the_announced_allowance_is_what_bounds_the_new_tracks() {
        let fixture = Fixture::funded_and_open_with(|constitution| {
            constitution.sponsorship.max_new_tracks = 1;
        });
        during_the_event(&fixture);

        let sponsor = sponsor_holding(&fixture, 6_300);
        let second = symbol_short!("second");

        fixture.client.propose_track(
            &sponsor,
            &extra(),
            &one_position(&fixture, 2_000),
            &note(&fixture),
        );

        assert_eq!(
            fixture
                .client
                .try_propose_track(
                    &sponsor,
                    &second,
                    &vec![
                        &fixture.env,
                        PrizeTier {
                            track: second.clone(),
                            rank: 1,
                            amount: 2_000,
                        },
                    ],
                    &note(&fixture),
                )
                .err(),
            Some(Ok(Error::SponsorshipRefused)),
            "the one slot is spoken for while the first is unanswered"
        );

        fixture.client.decline_track(&extra());

        fixture.client.propose_track(
            &sponsor,
            &second,
            &vec![
                &fixture.env,
                PrizeTier {
                    track: second.clone(),
                    rank: 1,
                    amount: 2_000,
                },
            ],
            &note(&fixture),
        );

        assert_eq!(
            fixture.client.sponsor_track(&second).status,
            TrackStatus::Proposed
        );
    }

    /// A hackathon whose rules never allowed sponsored tracks refuses one
    /// however much money arrives with it.
    #[test]
    fn a_hackathon_that_allows_no_new_tracks_refuses_one() {
        let fixture = shut();
        during_the_event(&fixture);

        let sponsor = sponsor_holding(&fixture, 2_100);

        assert_eq!(
            fixture
                .client
                .try_propose_track(
                    &sponsor,
                    &extra(),
                    &one_position(&fixture, 2_000),
                    &note(&fixture),
                )
                .err(),
            Some(Ok(Error::SponsorshipRefused))
        );
    }

    /// A project names one track, so a track opened after the last entry landed
    /// would be a bounty no entry could ever reach.
    #[test]
    fn no_track_can_be_opened_once_building_has_stopped() {
        let fixture = open();
        let schedule = fixture.client.state().schedule;

        fixture
            .env
            .ledger()
            .set_timestamp(schedule.submission_closes_at + 1);
        fixture.client.advance_phase();

        let sponsor = sponsor_holding(&fixture, 2_100);

        assert_eq!(
            fixture
                .client
                .try_propose_track(
                    &sponsor,
                    &extra(),
                    &one_position(&fixture, 2_000),
                    &note(&fixture),
                )
                .err(),
            Some(Ok(Error::WrongPhase))
        );
    }

    /// A proposal waiting on an answer when the event is called off gets its
    /// money back like everybody else.
    #[test]
    fn a_cancelled_hackathon_refunds_a_proposal_nobody_answered() {
        let fixture = open();
        during_the_event(&fixture);

        let sponsor = sponsor_holding(&fixture, 2_100);
        fixture.client.propose_track(
            &sponsor,
            &extra(),
            &one_position(&fixture, 2_000),
            &note(&fixture),
        );

        fixture.client.open_cancellation(&note(&fixture));
        for index in 0..2u32 {
            let judge = fixture
                .client
                .constitution()
                .judges
                .get(index)
                .unwrap()
                .judge;
            fixture.client.approve_cancellation(&judge);
        }
        fixture.client.resolve_cancellation();

        assert_eq!(token(&fixture).balance(&sponsor), 2_100);
        assert_eq!(vault(&fixture).balance(), 0);
    }

    /// The whole thing, end to end, and the assertion the feature exists for:
    /// a track a sponsor paid for, judged by the bench the rules froze, paying
    /// its winner out of the same vault as everything else.
    #[test]
    fn a_sponsored_track_is_judged_by_the_borrowed_bench_and_pays_its_winner() {
        let fixture = open();
        let env = fixture.env.clone();
        let schedule = fixture.client.state().schedule;
        during_the_event(&fixture);

        let sponsor = accepted(&fixture);

        // One team enters the sponsored track and nothing else.
        let organizer = fixture.organizer.clone();
        let captain = Address::generate(&env);
        fixture.client.apply(&captain);
        fixture.client.approve_application(&organizer, &captain);
        let team = fixture.client.create_team(&captain);
        fixture.client.submit_project(
            &captain,
            &team,
            &extra(),
            &BytesN::from_array(&env, &[1u8; 32]),
            &String::from_str(&env, "ipfs://cid"),
        );

        env.ledger()
            .set_timestamp(schedule.submission_closes_at + 1);
        fixture.client.advance_phase();
        env.ledger().set_timestamp(schedule.screening_closes_at + 1);
        fixture.client.advance_phase();

        /* The judges the constitution assigned to the borrowed track, and
        nobody else. The sponsor never named one and could not have. */
        let mut cards = Vec::new(&env);
        for index in 0..3u32 {
            let judge = fixture
                .client
                .constitution()
                .judges
                .get(index)
                .unwrap()
                .judge;

            cards.push_back(Scorecard {
                judge,
                team,
                scores: vec![
                    &env,
                    CriterionScore {
                        criterion: symbol_short!("technical"),
                        score: 90,
                    },
                    CriterionScore {
                        criterion: symbol_short!("novelty"),
                        score: 80,
                    },
                ],
            });
        }

        let mut leaves = Vec::new(&env);
        for index in 0..cards.len() {
            leaves.push_back(scorecard_leaf(&env, &cards.get(index).unwrap()));
        }
        let (root, proofs) = build_tree(&env, &leaves);

        env.ledger().set_timestamp(schedule.judging_closes_at);
        fixture.client.publish_score_root(&root);

        env.ledger().set_timestamp(schedule.judging_closes_at + 1);
        fixture.client.advance_phase();

        for index in 0..cards.len() {
            fixture
                .client
                .reveal_score(&cards.get(index).unwrap(), &proofs.get(index).unwrap());
        }

        fixture.client.finalize_results();

        // The sponsored track was ranked alongside the frozen ones.
        assert_eq!(fixture.client.ranking(&extra()).len(), 1);
        assert_eq!(fixture.client.ranking(&extra()).get(0).unwrap().team, team);

        let hold = 24 * 60 * 60;
        env.ledger()
            .set_timestamp(fixture.client.state().finalized_at + hold);
        fixture.client.open_settlement();

        let paid = fixture.client.settle_prize(&extra(), &1, &captain);

        assert_eq!(paid, 2_000, "the bounty the sponsor put up");
        assert_eq!(token(&fixture).balance(&captain), 2_000);
        assert_eq!(token(&fixture).balance(&sponsor), 0);
    }

    /// A sponsored track nobody entered returns its bounty to the sponsor.
    ///
    /// The frozen tracks send an unclaimed position back to the organizer,
    /// because the organizer funded them. Sending a sponsor's bounty there too
    /// would pay the organizer for a competition somebody else bought and
    /// nobody entered.
    #[test]
    fn an_empty_sponsored_track_returns_its_bounty_to_the_sponsor() {
        let fixture = open();
        let env = fixture.env.clone();
        let schedule = fixture.client.state().schedule;
        during_the_event(&fixture);

        let sponsor = accepted(&fixture);
        let organizer = fixture.organizer.clone();

        env.ledger()
            .set_timestamp(schedule.submission_closes_at + 1);
        fixture.client.advance_phase();
        env.ledger().set_timestamp(schedule.screening_closes_at + 1);
        fixture.client.advance_phase();
        env.ledger().set_timestamp(schedule.judging_closes_at + 1);
        fixture.client.advance_phase();

        fixture.client.finalize_results();

        let hold = 24 * 60 * 60;
        env.ledger()
            .set_timestamp(fixture.client.state().finalized_at + hold);
        fixture.client.open_settlement();

        let claim = fixture.client.constitution().discretion.prize_claim_period;
        env.ledger()
            .set_timestamp(fixture.client.state().settlement_opened_at + claim);

        assert_eq!(fixture.client.sweep_unclaimed(&extra(), &1), 2_000);

        assert_eq!(token(&fixture).balance(&sponsor), 2_000);
        assert_eq!(
            token(&fixture).balance(&organizer),
            0,
            "the organizer is paid nothing out of a track they did not fund"
        );
    }
}
