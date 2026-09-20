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
import { CONSTITUTION_VERSION } from "./rules";

/** Weights are basis points and a rubric has to add up to exactly this. */
export const WEIGHT_TOTAL_BPS = 10_000;

/**
 * The collection service's own address, as the frozen rules will name it.
 *
 * Configured rather than discovered. What goes into the document has to be the
 * key the service actually signs with, and asking the service who it is would
 * be taking its word for the one fact the document exists to pin down.
 *
 * Absent on a deployment running no service, which is a real configuration and
 * not a mistake: the organizer seals their own event by hand there.
 */
export function sealerAddress(): string | null {
  const said = process.env["NEXT_PUBLIC_SEALER_ADDRESS"];

  return said !== undefined && /^G[A-Z2-7]{55}$/.test(said) ? said : null;
}

/**
 * What one wallet gets to place, and across how many projects.
 *
 * The contract's own defaults, repeated here because the form does not ask for
 * them yet and something has to be written into the document. Ten points over
 * at most three projects: ten divides the way people already think about a
 * shortlist without asking anybody to reason in percentages, and three is where
 * backing a field stops being a ballot and starts being a shrug.
 *
 * They are constants rather than fields on the draft for the same reason the
 * claim period is: a setting nobody has been offered a way to choose is a
 * setting with one value, and the honest place for it is here until the form
 * grows a control for it. Both are frozen into the constitution either way, so
 * a voter can read what their ballot is worth before the event opens.
 */
const VOTE_POWER = 10;
const MAX_CHOICES = 3;

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

/**
 * What one field of a submission is worth to the organizer.
 *
 * Three answers rather than two, mirroring `FieldRule` in the contract. A field
 * nobody has to fill in is still a field a team is shown; one that was never
 * asked for is not on their form at all, and a judge is never left reading an
 * empty row as a team that did not bother.
 */
export type FieldRule = "unasked" | "optional" | "required";

/** Everything a submission can carry, in the order a form asks for it. */
export interface SubmissionFields {
  repository: FieldRule;
  demoVideo: FieldRule;
  liveUrl: FieldRule;
  pitchDeck: FieldRule;
  deployedContract: FieldRule;
}

/**
 * The rules as the contract numbers them.
 *
 * A Soroban enum whose variants carry no payload is a `u32` on the wire, and
 * these are its discriminants in declaration order. Written out rather than
 * derived from the order of the union above, because a reordered union would
 * otherwise silently renumber every rule in a frozen document.
 */
const ON_THE_WIRE: Record<FieldRule, number> = {
  unasked: 0,
  optional: 1,
  required: 2,
};

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
  /**
   * Who may read the project write-ups stored by StelHacks.
   *
   * The discriminants are the contract's `ProjectVisibility` order:
   * public, approved participants, then organizers and judges only. The value
   * is frozen with the rest of the constitution so the organizer cannot open a
   * closed gallery after seeing what was submitted.
   */
  visibility: 0 | 1 | 2;
  /**
   * The crowd's share of the final score, in basis points.
   *
   * Zero is the standard hackathon and what the form opens on. Ten thousand is
   * decided entirely by the crowd, and anything between is a blend. The contract
   * puts no ceiling on it, because every participant was admitted one approval
   * at a time, so the electorate is a list somebody vetted rather than whoever
   * showed up.
   *
   * Above zero it costs a vote window, and the schedule has to make room for it
   * between the entry check and the end of judging.
   */
  communityBps: number;
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
   * What a submission has to carry.
   *
   * Announced rather than enforced, and worth being precise about: the contract
   * takes one link and a digest, and never reads these rules. They are a rule
   * the organizer publishes before anybody enters, the submission form holds
   * teams to, and screening is the place a breach is acted on.
   */
  requires: SubmissionFields;
  /**
   * Whether an application waits for the organizer or is admitted on arrival.
   *
   * Part of the frozen rules rather than a setting, so an organizer cannot shut
   * the door after seeing who applied, or open it on the morning of the vote.
   */
  openRegistration: boolean;
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
   * How far each deadline may slip, announced before anybody enters.
   *
   * Two numbers because the contract spends two: how many times one deadline
   * may move and how many seconds it may gain in total. They are per deadline
   * rather than shared, so a build window that slips does not quietly eat the
   * judging window's room.
   *
   * Zero and zero is a schedule that cannot move at all, which the contract
   * accepts and treats as final. Anything else has to have both.
   */
  extensions: { times: number; seconds: number };
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
  /**
   * Whether other people may put money into this hackathon's prizes.
   *
   * Frozen like everything else, and that is the whole weight of the field: an
   * organizer who opens it cannot shut it once somebody has started building,
   * and one who leaves it shut cannot be talked into it later by a sponsor with
   * a cheque. So the form asks before the lock or the answer is no forever.
   */
  sponsorship: Sponsorship;
}

/** Where the cut goes and how much of it there is. */
export interface PlatformFee {
  collector: string;
  bps: number;
}

/** How far outside money may reach into a hackathon after the rules freeze. */
export interface Sponsorship {
  /** Whether anyone may add to a prize already on the table. */
  topUps: boolean;
  /** How many tracks sponsors may open between them. Zero forbids them. */
  maxNewTracks: number;
  /** The least one contribution may carry, in whole units of the prize asset. */
  minBounty: string;
}

/**
 * What the form opens on: open to money, closed to new categories.
 *
 * Open, because the alternative is a hackathon nobody can ever help fund and no
 * way back. Taking money never costs a participant anything — the prize table
 * only grows, and every contribution is aimed at a position that was already
 * announced.
 *
 * Closed to new tracks, because a category is a change to the shape of the
 * competition rather than to its size, and an organizer should reach for that
 * deliberately rather than find they agreed to it by not reading a form.
 */
export const OPEN_TO_SPONSORS: Sponsorship = {
  topUps: true,
  maxNewTracks: 0,
  minBounty: "10",
};

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

/**
 * The contract's interface, built once and reused.
 *
 * Exported because sponsorship sends a prize table too, and a second copy of
 * this would be a second place the layout could be got wrong.
 */
export async function spec() {
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
    /* The shape this build writes, and it has to be the one `lib/rules.ts`
       reads. It was left at two when the submission rules widened the document
       to three, so every hackathon created here was written in a shape the
       listing then dropped as superseded: created successfully, invisible
       everywhere, and no error anywhere to say why. */
    version: CONSTITUTION_VERSION,
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

    /*
      Easy mode, which is the one that is built. It names the address allowed
      to publish the sealed roots, and that address has to be the collection
      service's: the service is what holds the cards and computes the root, and
      the contract asks the named address to authorize the call.

      It used to name the organizer, from a time before the service existed.
      That froze events whose judges had scored perfectly well — the cards were
      taken and the receipts were real, but nothing could ever put a root on
      chain, and a hackathon cannot leave Judging without one.

      The organizer is still the fallback for a deployment running no service
      at all, where they are genuinely the only party who can seal. The panel
      offers them the call by hand in that case, which is what makes this a
      fallback rather than the same trap with a different owner.
    */
    judging_mode: { tag: "Easy", values: [sealerAddress() ?? organizer] },

    /* The split the organizer chose. Zero for the crowd is the standard event
       and what the form opens on: a weighting nobody asked for should never
       arrive by default.

       The ballot's size goes with the split rather than beside it, because the
       contract refuses the two apart: an event with no community vote must
       carry no ballot size at all, since a document holding one for an event
       that takes no ballots reads to anybody checking it as a vote that was
       configured and then quietly switched off. */
    vote: {
      judge_bps: WEIGHT_TOTAL_BPS - draft.communityBps,
      community_bps: draft.communityBps,
      power: draft.communityBps > 0 ? VOTE_POWER : 0,
      max_choices: draft.communityBps > 0 ? MAX_CHOICES : 0,
    },

    /* Written as a number because a Soroban enum whose variants carry no
       payload is a `u32` on the wire, unlike the ones that do. */
    visibility: draft.visibility,

    submission_requirements: {
      repository: ON_THE_WIRE[draft.requires.repository],
      demo_video: ON_THE_WIRE[draft.requires.demoVideo],
      live_url: ON_THE_WIRE[draft.requires.liveUrl],
      pitch_deck: ON_THE_WIRE[draft.requires.pitchDeck],
      deployed_contract: ON_THE_WIRE[draft.requires.deployedContract],
    },

    /* Written as a number for the same reason `visibility` is: a Soroban enum
       whose variants carry no payload is a `u32` on the wire. One is the open
       policy, zero the reviewed one. */
    registration: draft.openRegistration ? 1 : 0,

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

    /* The sponsorship door, frozen with the rest. The contract reads
       `borrows_from` only where sponsored tracks are allowed, but it is sent
       unconditionally and pointed at a track that exists, because a field whose
       meaning depends on a neighbour is a field somebody will eventually read
       on its own. */
    sponsorship: {
      top_ups_allowed: draft.sponsorship.topUps,
      max_new_tracks: draft.sponsorship.maxNewTracks,
      /* The contract refuses a floor of zero wherever the door is open, since
         the vault will not move nothing and the record would be of money that
         never arrived. A shut door carries zero, which is what it validates. */
      min_bounty:
        draft.sponsorship.topUps || draft.sponsorship.maxNewTracks > 0
          ? toSmallestUnit(draft.sponsorship.minBounty)
          : BigInt(0),
      borrows_from: draft.tracks[0]?.id ?? "main",
    },

    /* The chain the contract walks when two projects tie. Highest single
       criterion first, then who submitted earlier, which is the only tie break
       that cannot be influenced after the fact. */
    /* The crowd's step is only in the chain when there is a crowd. The contract
       refuses a chain that breaks ties on a vote the event never runs, which is
       the right refusal: a step that can never fire is a step somebody read and
       believed. */
    tie_break: [
      { tag: "JudgeScore", values: undefined },
      ...(draft.communityBps > 0 ? [{ tag: "CommunityScore", values: undefined }] : []),
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

      /*
        The vote runs alongside judging, which is where the rules put it: it
        opens when the entry check ends and closes when the judges are done, so
        the crowd is voting on the same set the judges are scoring and nobody
        votes on an entry that was struck out.

        Without a vote the window collapses onto the judging deadline rather
        than onto zero. The contract checks that every timestamp runs in order,
        and a zero in the middle of the sequence is a schedule that goes
        backwards.
      */
      community_vote_opens_at: BigInt(
        draft.communityBps > 0 ? draft.schedule.screeningClosesAt : draft.schedule.judgingClosesAt,
      ),
      community_vote_closes_at: BigInt(draft.schedule.judgingClosesAt),
    },

    extensions: {
      max_extensions_per_deadline: draft.extensions.times,
      max_total_seconds_per_deadline: BigInt(draft.extensions.seconds),
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
