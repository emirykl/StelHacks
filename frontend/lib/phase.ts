/**
 * The phases, in the contract's own words.
 *
 * Kept out of `chain.ts` because these are not read from anywhere: they are the
 * vocabulary the contract compiled, and anything that names a phase needs them
 * without needing a database client.
 */

/** The phases, numbered as the contract numbers them. */
export const PHASES = [
  "Draft",
  "Funding",
  "Open",
  "Screening",
  "Judging",
  "Reveal",
  "Finalization",
  "Settlement",
  "Completed",
  "Cancelled",
] as const;

export function phaseName(phase: number | null): string {
  return phase === null ? "Not published yet" : (PHASES[phase] ?? "Unknown");
}

/**
 * The same run of events, named the way an organizer would name them.
 *
 * Nine phases is what the contract needs. Several of them are one job to the
 * person running the event: drafting and funding are both setup, judging and
 * the reveal are both judging. These are the names that go on the strip at the
 * top of the panel.
 *
 * Named rather than numbered, and that replaced a counter. "Step 3 of 6" beside
 * a phase called "Screening" is two vocabularies for one fact, and the number
 * is the half that tells nobody anything: it can only be understood by somebody
 * who already knows what the six are.
 */
export const JOURNEY = [
  { title: "Setup", phases: [0, 1] },
  { title: "Sign-ups", phases: [2] },
  { title: "Entry check", phases: [3] },
  { title: "Judging", phases: [4, 5] },
  { title: "Results", phases: [6] },
  { title: "Payouts", phases: [7, 8] },
] as const;

/** Which stage a phase falls in, counted from one. */
export function stepOf(phase: number | null): number {
  if (phase === null) {
    return 1;
  }

  const at = JOURNEY.findIndex((step) => (step.phases as readonly number[]).includes(phase));

  return at === -1 ? JOURNEY.length : at + 1;
}
