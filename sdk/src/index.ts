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
export {
  signScorecard,
  signedPayload,
  signBallot,
  verifySealed,
  verifyScorecard,
  verifyBallot,
  type SealedSignature,
} from "./signing.js";
export {
  decodeEvent,
  decodeEvents,
  knownEvents,
  type DecodedEvent,
  type UnknownEvent,
  type RawEvent,
} from "./events.js";
export {
  rankTrack,
  compare,
  communityScore,
  finalScore,
  average,
  DecidedBy,
  MAX_CRITERION_SCORE,
  MAX_WEIGHTED_SCORE,
  VOTE_SPLIT_TOTAL_BPS,
  WEIGHT_TOTAL_BPS,
  type Candidate,
  type ProjectData,
  type Tally,
} from "./results.js";
export { validateSubmission, type SubmissionProblem } from "./submission.js";
export { toHex, fromHex } from "./hex.js";
export { spec } from "./spec.js";
export type { Digest } from "./merkle.js";

export { Client as HackathonCore } from "hackathon-core";
export { Client as PrizeVault } from "prize-vault";
/* A value rather than a type, because a phase read off the chain arrives as a
   number and the name is what anybody reading a log or a page wants. */
export { Phase } from "hackathon-core";
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
  VoteChoice,
  VotePolicy,
} from "hackathon-core";
