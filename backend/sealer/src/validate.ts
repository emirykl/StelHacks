import type { Scorecard, VoteChoice } from "@stelhacks/sdk";

/**
 * Checking what arrived before believing any of it.
 *
 * These routes are open to whoever can reach them, so a body is a claim rather
 * than a value. Everything below is narrow on purpose: a field of the wrong
 * shape is refused here rather than reaching a signature check that would have
 * refused it anyway, because a clear four hundred is a better answer to a judge
 * with a typo than a signature failure they cannot act on.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function contractOf(body: Record<string, unknown>): string | null {
  const contract = body["contract"];

  return typeof contract === "string" && /^C[A-Z2-7]{55}$/.test(contract) ? contract : null;
}

export function isScorecard(value: unknown): value is Scorecard {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value["judge"] === "string" &&
    typeof value["team"] === "number" &&
    Array.isArray(value["scores"]) &&
    value["scores"].every(
      (entry) =>
        isRecord(entry) &&
        typeof entry["criterion"] === "string" &&
        typeof entry["score"] === "number",
    )
  );
}


/**
 * A ballot, checked for shape rather than for the rules it has to satisfy.
 *
 * The size of a ballot and how far it may be spread are frozen in the
 * constitution, so they are read from the chain and checked in `server.ts`.
 * What is here is what a body has to be before any of that is worth asking:
 * whole positive numbers, each project named once, in the ascending order the
 * contract hashes over. A ballot in another order would seal a digest the
 * contract cannot reproduce, and the voter would find that out at the reveal
 * rather than now.
 */
export function isBallot(value: unknown): value is VoteChoice[] {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  let highest = 0;

  for (const choice of value) {
    if (!isRecord(choice)) {
      return false;
    }

    const { team, weight } = choice;

    if (!Number.isInteger(team) || !Number.isInteger(weight)) {
      return false;
    }
    if ((team as number) <= highest || (weight as number) < 1) {
      return false;
    }

    highest = team as number;
  }

  return true;
}
