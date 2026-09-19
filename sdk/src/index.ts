/**
 * Read, verify and rebuild a StelHacks hackathon result from chain data alone.
 *
 * The package's reason for existing is that nobody should have to trust the
 * reference application to know who won. Everything here works from what the
 * contracts published: the locked rules, the sealed roots, the revealed
 * scorecards and ballots, and the ranking derived from them.
 */

export * as merkle from "./merkle.js";
export { toHex, fromHex } from "./hex.js";
export type { Digest } from "./merkle.js";
