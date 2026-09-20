/**
 * What a judge has already handed in, kept in their own browser.
 *
 * Reopening the scoring page showed an empty form for a project that had been
 * scored an hour earlier, which reads as work undone. The reason is the whole
 * design working: a card is sealed the moment it is filed, the service holds
 * tlock ciphertext it cannot open until the judging deadline, and nothing on
 * the network can say what a judge gave. There was nobody left to ask.
 *
 * So the judge's own browser keeps the copy. Two things it is not:
 *
 *   It is not evidence. The receipt is what proves the service took the card,
 *   and the inclusion proof is what shows it was counted. This is a note to
 *   self and is labelled as one everywhere it is read.
 *
 *   It is not the guard against scoring twice. The service refuses a second
 *   card for the same project whatever this file says, which is why a judge
 *   arriving on a different machine is safe rather than merely unlucky — they
 *   see an empty form and the service turns the duplicate away.
 *
 * Kept per contract and per judge, so two judges sharing a machine never read
 * each other's marks back.
 */

import type { Receipt } from "./judge";

export interface SealedCard {
  receipt: Receipt;
  leaf: string;
  /** What the judge typed, per criterion, on the rubric's own scale. */
  marks: Record<string, number>;
}

const VERSION = "stelhacks.judged.v1";

function keyFor(contract: string, judge: string): string {
  return `${VERSION}:${contract}:${judge}`;
}

/** Every card this judge has filed against this hackathon, by team. */
export function sealedCardsOf(contract: string, judge: string): Record<number, SealedCard> {
  /* Storage throws rather than returning null in a browser that has it
     disabled, and a judge whose browser will not remember anything should get
     the form rather than an error on a page about scoring. */
  try {
    const written = window.localStorage.getItem(keyFor(contract, judge));

    if (written === null) {
      return {};
    }

    const parsed = JSON.parse(written) as Record<number, SealedCard>;

    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Keep one, alongside whatever was already there. */
export function rememberCard(
  contract: string,
  judge: string,
  team: number,
  card: SealedCard,
): void {
  try {
    const kept = { ...sealedCardsOf(contract, judge), [team]: card };

    window.localStorage.setItem(keyFor(contract, judge), JSON.stringify(kept));
  } catch {
    /* Nothing to do and nothing worth saying. The card is filed either way;
       what is lost is the page remembering it after a reload. */
  }
}
