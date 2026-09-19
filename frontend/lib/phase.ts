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
