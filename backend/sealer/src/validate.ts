import type { Scorecard } from "@stelhacks/sdk";

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

