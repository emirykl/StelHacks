/**
 * Turning a filled in form into the exact bytes the contract would produce.
 *
 * The constitution is the one object in this product where being slightly
 * wrong is not recoverable. It is hashed at the lock and frozen; a weight in
 * the wrong field or an amount off by a decimal place cannot be corrected
 * afterwards, and the digest on every page will faithfully attest to it.
 *
 * So nothing here writes an XDR layout by hand. Encoding goes through the
 * contract's own published interface, which is generated from the wasm the
 * contract was compiled to. A field renamed in Rust stops matching here rather
 * than quietly encoding into the wrong slot.
 */

import entries from "./contract-spec.json";

/** Weights are basis points and a rubric has to add up to exactly this. */
export const WEIGHT_TOTAL_BPS = 10_000;

export interface Criterion {
  id: string;
  weightBps: number;
}

export interface Prize {
  rank: number;
  /** In whole units of the prize asset, as a person types it. */
  amount: string;
}

export interface Track {
  id: string;
  criteria: Criterion[];
  prizes: Prize[];
  noAwardAllowed: boolean;
}

export interface Judge {
  address: string;
  /**
   * Which tracks this judge scores, and it may not be empty.
   *
   * The contract refuses a judge with no assignment rather than reading it as
   * every track, because a judge who can score nothing is a judge whose
   * absence breaks a quorum for projects that did nothing wrong.
   */
  tracks: string[];
}

export interface Draft {
  metadataHash: Uint8Array;
  prizeAsset: string;
  tracks: Track[];
  judges: Judge[];
  judgeQuorum: number;
  /** Seconds since the epoch. The contract checks that these run in order. */
  schedule: {
    registrationOpensAt: number;
    registrationClosesAt: number;
    submissionOpensAt: number;
    submissionClosesAt: number;
    screeningClosesAt: number;
    judgingClosesAt: number;
  };
  /**
   * Which links a submission has to carry.
   *
   * Announced rather than enforced, and worth being precise about: the contract
   * takes one link and a digest, and never reads these flags. They are a rule
   * the organizer publishes before anybody enters, the submission form holds
   * teams to, and screening is the place a breach is acted on.
   */
  requires: { repository: boolean; demoVideo: boolean; liveUrl: boolean };
  /** Whether one person may be on more than one team. */
  multiTeamAllowed: boolean;
  maxTeamSize: number;
  /**
   * Seconds to wait between the ranking and the first payment, zero for none.
   *
   * Asked rather than assumed. This was fixed at a day, which is a sensible
   * default and was invisible: nothing in the form mentioned it, and the first
   * an organizer heard of it was the contract refusing to open settlement a
   * minute after they had finished judging.
   */
  settlementDelay: number;
  /**
   * What the platform takes, decided from the organizer's tier before the form
   * opened and frozen into the document at the lock like everything else.
   *
   * Carried on the draft rather than read here, because this file has no
   * session and the rate belongs to a person rather than to an event. A default
   * would be the wrong shape twice over: it would quote somebody a price the
   * server never agreed, and it would be the one number in this object that
   * could be different from what was shown.
   */
  platformFee: PlatformFee;
}

/** Where the cut goes and how much of it there is. */
export interface PlatformFee {
  collector: string;
  bps: number;
}

/**
 * The fee this deployment can actually charge, or nothing when it cannot.
 *
 * Null is returned rather than a zero rate when a rate was asked for and no
 * collector is configured, and the difference matters. Quietly falling back to
 * charging nothing would be a deployment silently giving its revenue away and
 * looking identical to one that meant to. The wizard refuses to create instead,
 * which is loud, recoverable, and happens before anything is on chain.
 *
 * A rate of zero needs no collector, but the field is not optional in the
 * document, so the organizer's own address stands in. Nothing is ever sent to
 * it: the contract only pays when the rate is above zero.
 */
export function feeFor(bps: number, organizer: string): PlatformFee | null {
  const collector = process.env["NEXT_PUBLIC_PLATFORM_FEE_COLLECTOR"];

  if (bps === 0) {
    return { collector: collector ?? organizer, bps: 0 };
  }

  return collector === undefined || collector.length !== 56 ? null : { collector, bps };
}

/**
 * The decimals of the prize asset.
 *
 * Amounts on chain are integers in the smallest unit, and both XLM and USDC on
 * Stellar carry seven. Somebody typing "10000" means ten thousand tokens, and
 * sending ten thousand stroops instead would fund a hackathon with a tenth of a
 * cent while every page reported it as funded.
 */
const DECIMALS = 7;

export function toSmallestUnit(amount: string): bigint {
  const [whole, fraction = ""] = amount.trim().split(".");
  const padded = fraction.padEnd(DECIMALS, "0").slice(0, DECIMALS);

  return BigInt(`${whole || "0"}${padded}`);
}

/** What the whole prize table adds up to, which is what the vault must hold. */
export function totalPrize(tracks: Track[]): bigint {
  return tracks.reduce(
    (sum, track) =>
      track.prizes.reduce((inner, prize) => inner + toSmallestUnit(prize.amount), sum),
    BigInt(0),
  );
}

let cached: import("@stellar/stellar-sdk/contract").Spec | null = null;

async function spec() {
  if (cached === null) {
    const { Spec } = await import("@stellar/stellar-sdk/contract");
    cached = new Spec(entries as string[]);
  }

  return cached;
}

/**
 * The arguments for `create`, encoded.
 *
 * Everything the form does not ask about is filled in here with the value the
 * contract treats as "not used", rather than being left out. An absent field is
 * an encoding error; a deliberate default is a decision, and each one below
 * says which.
 */
export async function createArgs(organizer: string, draft: Draft) {
  const encoder = await spec();

  const constitution = {
    /* Two since the platform fee joined the document. A contract built against
       version one does not have the field and will refuse this. */
    version: 2,
    metadata_hash: Buffer.from(draft.metadataHash),
    prize_asset: draft.prizeAsset,

    tracks: draft.tracks.map((track) => ({
      id: track.id,
      criteria: track.criteria.map((criterion) => ({
        id: criterion.id,
        weight_bps: criterion.weightBps,
      })),
      no_award_allowed: track.noAwardAllowed,
    })),

    judges: draft.judges.map((judge) => ({
      judge: judge.address,
      /* Falling back to every track rather than sending an empty list, which
         the contract refuses. A small event wants every judge on everything,
         and that is what the form means when it asks for no assignment. */
      tracks: judge.tracks.length > 0 ? judge.tracks : draft.tracks.map((track) => track.id),
    })),

    judge_quorum: draft.judgeQuorum,

    /* Easy mode, which is the one that is built. It names the address allowed
       to publish the sealed roots; the organizer seals their own event until
       there is a service to do it for them. Strict is in the roadmap's
       deferred table rather than half implemented here. */
    judging_mode: { tag: "Easy", values: [organizer] },

    /* No community vote by default: it needs an eligibility snapshot, and an
       organizer who has not asked for one should not silently get a weighting
       they did not choose. */
    vote: { judge_bps: WEIGHT_TOTAL_BPS, community_bps: 0 },

    /* Public. Written as a number because a Soroban enum whose variants carry
       no payload is a `u32` on the wire, unlike the ones that do. */
    visibility: 0,

    submission_requirements: {
      repository_required: draft.requires.repository,
      demo_video_required: draft.requires.demoVideo,
      live_url_required: draft.requires.liveUrl,
    },

    teams: {
      max_size: draft.maxTeamSize,
      multi_team_allowed: draft.multiTeamAllowed,
    },

    prize_tiers: draft.tracks.flatMap((track) =>
      track.prizes.map((prize) => ({
        track: track.id,
        rank: prize.rank,
        amount: toSmallestUnit(prize.amount),
      })),
    ),

    /* Charged on top of the table above, never out of it: the vault has to hold
       the prizes plus this before registration opens, and a winner is paid the
       number their position announced. It goes into the same hashed document as
       the rubric so that a participant reading the rules before they register
       reads our cut too, and so that we cannot change it afterwards any more
       than the organizer can change the prizes. */
    platform_fee: {
      collector: draft.platformFee.collector,
      bps: draft.platformFee.bps,
    },

    /* The chain the contract walks when two projects tie. Highest single
       criterion first, then who submitted earlier, which is the only tie break
       that cannot be influenced after the fact. */
    tie_break: [
      { tag: "JudgeScore", values: undefined },
      { tag: "Criterion", values: [draft.tracks[0]?.criteria[0]?.id ?? "impact"] },
      { tag: "SubmissionOrder", values: undefined },
    ],

    discretion: {
      /* One judge has to sign off on a disqualification, and the person
         disqualified gets a day to answer before the ranking is computed. */
      disqualification_threshold: 1,
      appeal_window: BigInt(86_400),

      /* A gap between the ranking and the first payment, so a mistake can be
         caught while the money is still in the vault. Zero is a real answer and
         the one a test event wants, so it becomes `Immediate` rather than a
         safety window of no seconds: the contract has a tag for owing no wait
         and a window that elapses instantly is a worse way to say it. */
      settlement:
        draft.settlementDelay > 0
          ? { tag: "SafetyWindow", values: [BigInt(draft.settlementDelay)] }
          : { tag: "Immediate", values: undefined },

      /* Thirty days to claim, then whatever is unclaimed goes back rather than
         sitting in a contract nobody can empty. */
      prize_claim_period: BigInt(30 * 86_400),

      /* Back to the organizer. Depositors would be the right route for a
         sponsored event and is in the roadmap's deferred table; choosing it
         here without the accounting behind it would promise a refund the
         contract cannot work out how to split. */
      unclaimed_refund: 0,
      no_award_refund: 0,

      cancellation_threshold: 1,
      cancellation_refund: 0,
    },

    schedule: {
      registration_opens_at: BigInt(draft.schedule.registrationOpensAt),
      registration_closes_at: BigInt(draft.schedule.registrationClosesAt),
      submission_opens_at: BigInt(draft.schedule.submissionOpensAt),
      submission_closes_at: BigInt(draft.schedule.submissionClosesAt),
      screening_closes_at: BigInt(draft.schedule.screeningClosesAt),
      judging_closes_at: BigInt(draft.schedule.judgingClosesAt),

      /* No community vote, so its window is the judging deadline rather than
         zero: the contract checks that every timestamp runs in order, and a
         zero in the middle of the sequence is a schedule that goes backwards. */
      community_vote_opens_at: BigInt(draft.schedule.judgingClosesAt),
      community_vote_closes_at: BigInt(draft.schedule.judgingClosesAt),
    },

    extensions: {
      max_extensions_per_deadline: 1,
      max_total_seconds_per_deadline: BigInt(172_800),
    },
  };

  return encoder.funcArgsToScVals("create", { organizer, constitution });
}

/**
 * The same document, for replacing the rules of a hackathon that already exists.
 *
 * `configure` takes the constitution and nothing else: the contract already
 * knows who the organizer is and checks the signature against that rather than
 * against anything the caller passes. It also refuses once the rules are
 * locked, which is what keeps this from being a way around the freeze.
 *
 * Built by calling `createArgs` and dropping the organizer rather than by
 * assembling the document a second time. Two copies of a sixteen field
 * constitution is two places for a field to be forgotten, and the one that is
 * only reachable from the edit path is the one nobody would notice.
 */
export async function configureArgs(organizer: string, draft: Draft) {
  const [, constitution] = await createArgs(organizer, draft);

  return [constitution];
}
