import { describe, expect, it } from "vitest";

import { carryForward, orderProblem, type Moveable } from "./schedule";

/**
 * The two rules an organizer meets when a hackathon runs late.
 *
 * Both exist because the contract answers the same questions far too late. It
 * revalidates the whole schedule after a move and refuses with a number, which
 * reaches somebody as a failed transaction minutes after they signed for it.
 * These are the same conditions, asked while the date is still being typed.
 */

const HOUR = 3_600;
const DAY = 24 * HOUR;

/** A running hackathon, with the vote enabled and nothing passed yet. */
function schedule(): Moveable[] {
  return [
    { at: 0, name: "Sign-ups close", moment: 10 * DAY, timesMoved: 0, secondsAdded: 0 },
    { at: 1, name: "Build deadline", moment: 12 * DAY, timesMoved: 0, secondsAdded: 0 },
    { at: 2, name: "Entry check ends", moment: 14 * DAY, timesMoved: 0, secondsAdded: 0 },
    { at: 3, name: "Judging ends", moment: 18 * DAY, timesMoved: 0, secondsAdded: 0 },
    { at: 4, name: "Community vote closes", moment: 17 * DAY, timesMoved: 0, secondsAdded: 0 },
    { at: 5, name: "Community vote opens", moment: 14 * DAY, timesMoved: 0, secondsAdded: 0 },
  ];
}

describe("telling an organizer a moment will be refused", () => {
  it("takes a build deadline that stays inside its window", () => {
    expect(orderProblem(1, 13 * DAY, schedule())).toBeNull();
  });

  it("refuses a build deadline pushed past the entry check", () => {
    expect(orderProblem(1, 15 * DAY, schedule())).toMatch(/entry check/i);
  });

  /**
   * The contract allows these two to land on the same moment, so the warning
   * has to as well. A check stricter than the thing it is warning about sends
   * somebody looking for a problem that is not there.
   */
  it("allows sign-ups to close exactly on the build deadline", () => {
    expect(orderProblem(0, 12 * DAY, schedule())).toBeNull();
  });

  it("refuses sign-ups closing after the build deadline", () => {
    expect(orderProblem(0, 13 * DAY, schedule())).toMatch(/build deadline/i);
  });

  /**
   * The case that made the vote's opening movable in the first place: a vote
   * cannot open before the round it follows has finished.
   */
  it("refuses a vote that opens before the entry check ends", () => {
    expect(orderProblem(5, 13 * DAY, schedule())).toMatch(/entry check/i);
  });

  it("refuses a vote that closes after judging has ended", () => {
    expect(orderProblem(4, 19 * DAY, schedule())).toMatch(/judging/i);
  });

  it("allows a vote that closes exactly when judging does", () => {
    expect(orderProblem(4, 18 * DAY, schedule())).toBeNull();
  });
});

describe("carrying a move through to the deadlines after it", () => {
  const now = 9 * DAY;

  it("moves everything later by the same amount, keeping the gaps", () => {
    const moves = carryForward(1, 13 * DAY, schedule(), now);

    expect(moves).toEqual([
      { deadline: 1, movedTo: 13 * DAY },
      { deadline: 2, movedTo: 15 * DAY },
      { deadline: 5, movedTo: 15 * DAY },
      { deadline: 4, movedTo: 18 * DAY },
      { deadline: 3, movedTo: 19 * DAY },
    ]);
  });

  /**
   * Ordered by the moment each deadline holds rather than by its number. The
   * vote sits between the entry check and the end of judging while being
   * numbered after both, so numbering would put the run out of sequence.
   */
  it("leaves sign-ups alone when a later deadline is the one moving", () => {
    const moves = carryForward(1, 13 * DAY, schedule(), now);

    expect(moves.some((move) => move.deadline === 0)).toBe(false);
  });

  /**
   * A deadline that has passed cannot be moved at all, and naming it would
   * take the whole run down with it.
   */
  it("leaves a deadline that has already passed out of the run", () => {
    const moves = carryForward(1, 13 * DAY, schedule(), 13 * DAY - HOUR);

    expect(moves.some((move) => move.deadline === 2)).toBe(true);
    expect(moves.some((move) => move.deadline === 0)).toBe(false);
  });

  /** A hackathon with no community vote has no vote moments to move. */
  it("skips the vote when the rules never enabled one", () => {
    const withoutVote = schedule().map((deadline) =>
      deadline.at === 4 || deadline.at === 5 ? { ...deadline, moment: 0 } : deadline,
    );

    const moves = carryForward(1, 13 * DAY, withoutVote, now);

    expect(moves.map((move) => move.deadline)).toEqual([1, 2, 3]);
  });

  it("does nothing when the moment is not actually later", () => {
    expect(carryForward(1, 11 * DAY, schedule(), now)).toEqual([]);
  });
});
