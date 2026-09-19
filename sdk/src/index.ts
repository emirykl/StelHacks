/**
 * Read, verify and rebuild a StelHacks hackathon result from chain data alone.
 *
 * The package's reason for existing is that nobody should have to trust the
 * reference application to know who won. Everything here works from what the
 * contracts published: the locked rules, the sealed roots, the revealed
 * scorecards and ballots, and the ranking derived from them.
 *
 * The digests it computes are checked against the same committed fixtures the
 * contract's own tests use, so a value hashed here is the value the chain
 * stored, and neither side can drift without a suite going red.
 */

export * as merkle from "./merkle.js";
export {
  encode,
  hashConstitution,
  hashSubmissionMetadata,
  scorecardLeaf,
  ballotLeaf,
} from "./hashing.js";
export { validateSubmission, type SubmissionProblem } from "./submission.js";
export { toHex, fromHex } from "./hex.js";
export { spec } from "./spec.js";
export type { Digest } from "./merkle.js";

export { Client as HackathonCore } from "hackathon-core";
export { Client as PrizeVault } from "prize-vault";
export type {
  Constitution,
  DiscretionPolicy,
  ExtensionPolicy,
  HackathonState,
  JudgeAssignment,
  Placement,
  PrizeTier,
  Schedule,
  Scorecard,
  Submission,
  SubmissionMetadata,
  SubmissionRequirements,
  Track,
  VotePolicy,
} from "hackathon-core";
