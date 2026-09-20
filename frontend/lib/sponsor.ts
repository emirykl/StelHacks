/**
 * Putting somebody else's money into a hackathon's prizes.
 *
 * The vault always took deposits from anyone, at any phase. What it could not
 * do was give that money a destination: prizes are paid from the table frozen
 * at the lock, so a contribution arriving on the second day sat in a pool no
 * entry point could move out again. The contract now aims each one at a named
 * position, and this is the browser's side of that.
 *
 * Two things this file is careful about, because both decide what somebody
 * pays. The cut is charged **on top** of the contribution, exactly as it is on
 * the organizer's own deposit, so a sponsor who announces a thousand pays a
 * thousand and fifty and the winner is paid the thousand. And the floor comes
 * from the frozen rules rather than from a constant here, because it is a rule
 * a reader can check and a constant is not.
 */

import { arg, send, type Sent } from "./send";
import { spec } from "./constitution";
import type { Rules } from "./rules";

/** One position somebody could stand behind, as a picker shows it. */
export interface Position {
  track: string;
  rank: number;
  /** The frozen amount plus every contribution so far, in the smallest unit. */
  worth: bigint;
  /** What the table froze it at, so a page can show what was added. */
  frozen: bigint;
}

/** One contribution, as the wall of names reads it. */
export interface Contribution {
  sponsor: string;
  track: string;
  /**
   * The place backed, or zero when the contribution was spread over the whole
   * track. No real rank is zero — the contract refuses a prize table that
   * contains one — so the two cases can never be confused for each other.
   */
  rank: number;
  amount: bigint;
  fee: bigint;
  at: number;
}

/**
 * How a contribution aimed at a whole track divides between its places.
 *
 * Two different things to want, and the sponsor says which. Evenly puts the
 * same money behind every place, which narrows the gap between first and last.
 * By worth leaves the table's shape alone, so a first prize that was three
 * times the fourth stays three times the fourth.
 *
 * The strings are this file's; the wire carries the contract's own enum, which
 * is an integer, and `SPLITS` is the only place the two are mapped.
 */
export type Split = "evenly" | "byWorth";

const SPLITS: Record<Split, number> = { evenly: 0, byWorth: 1 };

/** The whole table, as one row in the picker: spread over every place. */
export const EVERY_PLACE = "all" as const;

/**
 * A place in a prize table, as a person says it.
 *
 * Zero included, because that is the contract's way of saying a contribution
 * had no rank: it was spread over the whole table. Printed as the number it
 * is, a sponsor wall would read "genesis · 0", which is a position no
 * hackathon has.
 */
export function placeName(rank: number): string {
  if (rank === 0) {
    return "every place";
  }

  if (rank === 1) {
    return "1st";
  }

  if (rank === 2) {
    return "2nd";
  }

  if (rank === 3) {
    return "3rd";
  }

  return `${rank}th`;
}

/**
 * How one contribution divides over a track's places.
 *
 * The same arithmetic as `shares_of` in the contract, at the same scale and in
 * the same order. This is shown to somebody before they sign and the contract
 * works it out again afterwards; the two differing by a stroop would be a page
 * that quoted a split the chain did not make.
 */
export function sharesOf(amount: bigint, places: Position[], split: Split): bigint[] {
  if (places.length === 0 || amount <= BigInt(0)) {
    return places.map(() => BigInt(0));
  }

  const total = places.reduce((sum, one) => sum + one.worth, BigInt(0));
  const count = BigInt(places.length);

  const shares = places.map((one) =>
    /* A table of nothing cannot be divided in proportion to itself. The
       contract's own tables never are — every tier is validated positive — so
       this only guards the moment before the worths have been read. */
    split === "evenly" || total <= BigInt(0)
      ? amount / count
      : (amount * one.worth) / total,
  );

  /* Whatever integer division could not place goes to the best position,
     because that is where the contract puts it. Dropping it here instead
     would show a breakdown that adds up to less than what was typed. */
  const placed = shares.reduce((sum, one) => sum + one, BigInt(0));
  const top = bestPlace(places);

  shares[top] = (shares[top] ?? BigInt(0)) + (amount - placed);

  return shares;
}

/** The lowest rank in the table, by index. Not the first row: a prize table is
 *  a list and nothing obliges an organizer to have written it in order. */
function bestPlace(places: Position[]): number {
  let top = 0;

  places.forEach((one, at) => {
    if (one.rank < (places[top]?.rank ?? one.rank)) {
      top = at;
    }
  });

  return top;
}

const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

/**
 * Whether this hackathon can be sponsored at all, right now.
 *
 * Two conditions and both have to hold. The rules had to open the door before
 * the lock, and the event has to be published and not yet ranked — the contract
 * refuses outside those phases, and a button that opens a wallet prompt destined
 * to fail is worse than no button.
 */
export function canSponsor(rules: Rules | null, phase: number | null): boolean {
  if (rules === null || !rules.sponsorship.topUps) {
    return false;
  }

  return phase !== null && phase >= 2 && phase <= 5;
}

/**
 * Whether the event is already running, which a sponsor should be told.
 *
 * Not a refusal. A contribution during the build is perfectly good and reaches
 * the same winner; it is just worth saying out loud that the prize was smaller
 * when the teams chose what to work on.
 */
export function alreadyRunning(phase: number | null): boolean {
  return phase !== null && phase > 2;
}

/**
 * What each position is worth now, read from the contract one call at a time.
 *
 * `payable` rather than the frozen tier, because the two differ the moment
 * anybody contributes and the picker has to show the number a winner would
 * actually be paid.
 */
export async function positionsOf(contractId: string, rules: Rules): Promise<Position[]> {
  const worths = await Promise.all(
    rules.tiers.map((tier) => payable(contractId, tier.track, tier.rank)),
  );

  return rules.tiers.map((tier, at) => ({
    track: tier.track,
    rank: tier.rank,
    /* Falling back to the frozen amount when the call could not be made. It is
       the truth for every position nobody has sponsored, which is most of them,
       and it is never an overstatement: a position can only have grown. */
    worth: worths[at] ?? tier.amount,
    frozen: tier.amount,
  }));
}

/** What one position would pay a winner today. */
export async function payable(
  contractId: string,
  track: string,
  rank: number,
): Promise<bigint | null> {
  const answer = await ask(contractId, "payable", [
    await arg.symbol(track),
    await arg.u32(rank),
  ]);

  return typeof answer === "bigint" ? answer : null;
}

/**
 * Every contribution this hackathon has taken, newest first.
 *
 * Read from the contract rather than from the indexer. The wall names people
 * who paid real money into a public pool, and a list our own database assembled
 * is a list our own database could be wrong about; this one is the contract's.
 */
export async function contributionsOf(contractId: string): Promise<Contribution[]> {
  const count = await ask(contractId, "sponsorship_count", []);

  if (typeof count !== "bigint" && typeof count !== "number") {
    return [];
  }

  const total = Number(count);
  const records = await Promise.all(
    Array.from({ length: total }, (_, index) => sponsorship(contractId, index)),
  );

  return records
    .filter((record): record is Contribution => record !== null)
    .sort((first, second) => second.at - first.at);
}

async function sponsorship(contractId: string, index: number): Promise<Contribution | null> {
  const raw = await ask(contractId, "sponsorship", [await arg.u32(index)]);

  if (raw === null || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;

  return {
    sponsor: String(record["sponsor"] ?? ""),
    track: String(record["track"] ?? ""),
    rank: Number(record["rank"] ?? 0),
    amount: BigInt((record["amount"] as bigint | undefined) ?? 0),
    fee: BigInt((record["fee"] as bigint | undefined) ?? 0),
    at: Number(record["at"] ?? 0),
  };
}

/**
 * What the platform takes on a contribution of this size.
 *
 * Integer arithmetic at the same scale and rounding the same way the contract
 * does, because this number is shown to somebody before they sign and then
 * charged by the contract afterwards. The two differing by one stroop would be
 * a page that quoted a price the chain did not honour.
 */
export function feeOn(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / BigInt(10_000);
}

/** Adds to a prize position. The wallet signs once, for prize plus fee. */
export async function sponsorTier(
  contractId: string,
  from: string,
  track: string,
  rank: number,
  amount: bigint,
  note: Uint8Array,
): Promise<Sent> {
  return send(
    contractId,
    "sponsor_tier",
    [
      await arg.address(from),
      await arg.symbol(track),
      await arg.u32(rank),
      await arg.i128(amount),
      await arg.bytes32(note),
    ],
    from,
  );
}

/**
 * Adds to every place in a track at once, in one signature.
 *
 * The call `sponsor_tier` could not make. Somebody who wants the prizes to be
 * bigger should not have to name which of four strangers benefits, and doing
 * it as four separate contributions would be four wallet prompts, four lines
 * on the wall, and four chances to leave half the money placed.
 */
export async function sponsorPlaces(
  contractId: string,
  from: string,
  track: string,
  amount: bigint,
  split: Split,
  note: Uint8Array,
): Promise<Sent> {
  /* Through the contract's own published interface. The split is a Soroban
     enum, and an enum written by hand is a field that encodes into the wrong
     slot without anything failing until the money has moved. */
  const encoder = await spec();

  const args = encoder.funcArgsToScVals("sponsor_places", {
    sponsor: from,
    track,
    amount,
    split: SPLITS[split],
    note: Buffer.from(note),
  });

  return send(
    contractId,
    "sponsor_places",
    args.map((value) => ({ value })),
    from,
  );
}

/**
 * One read, simulated from an account that does not exist.
 *
 * Every call here is a view. Simulation never submits, so the source only has
 * to be well formed, and a contract that refuses is answering rather than
 * failing: a hackathon with no sponsorships returns nothing from
 * `sponsorship`, and that is the answer.
 */
async function ask(
  contractId: string,
  method: string,
  args: Awaited<ReturnType<typeof arg.u32>>[],
): Promise<unknown> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return null;
  }

  try {
    const [{ Account, Contract, TransactionBuilder, BASE_FEE, scValToNative }, rpc] =
      await Promise.all([import("@stellar/stellar-sdk/base"), import("@stellar/stellar-sdk/rpc")]);

    const tx = new TransactionBuilder(
      new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
      { fee: BASE_FEE, networkPassphrase: passphrase },
    )
      .addOperation(new Contract(contractId).call(method, ...args.map((one) => one.value)))
      .setTimeout(30)
      .build();

    const simulated = await new rpc.Server(rpcUrl).simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simulated) || simulated.result === undefined) {
      return null;
    }

    return scValToNative(simulated.result.retval);
  } catch {
    return null;
  }
}

/** A track somebody asked for, and where the request stands. */
export interface ProposedTrack {
  id: string;
  sponsor: string;
  /** Rank and amount, in the smallest unit, in the order they were sent. */
  tiers: { rank: number; amount: bigint }[];
  fee: bigint;
  /** 0 proposed, 1 accepted, 2 declined, matching the contract's own enum. */
  status: number;
  at: number;
}

export const PROPOSED = 0;
export const ACCEPTED = 1;
export const DECLINED = 2;

/**
 * Whether somebody can ask for a category of their own right now.
 *
 * Narrower than a contribution's window on purpose, and the contract enforces
 * the same line: a project names one track, so a category opened after the last
 * entry landed would be a prize nothing could ever reach.
 */
export function canProposeTrack(rules: Rules | null, phase: number | null): boolean {
  return rules !== null && rules.sponsorship.maxNewTracks > 0 && phase === 2;
}

/** Every track a sponsor has asked for, decided or not. */
export async function proposedTracksOf(contractId: string): Promise<ProposedTrack[]> {
  const ids = await ask(contractId, "sponsor_track_ids", []);

  if (!Array.isArray(ids)) {
    return [];
  }

  const tracks = await Promise.all(ids.map((id) => proposedTrack(contractId, String(id))));

  return tracks.filter((track): track is ProposedTrack => track !== null);
}

async function proposedTrack(contractId: string, id: string): Promise<ProposedTrack | null> {
  const raw = await ask(contractId, "sponsor_track", [await arg.symbol(id)]);

  if (raw === null || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const tiers = Array.isArray(record["tiers"]) ? record["tiers"] : [];

  return {
    id: String(record["id"] ?? id),
    sponsor: String(record["sponsor"] ?? ""),
    tiers: tiers.map((tier) => {
      const one = (tier ?? {}) as Record<string, unknown>;

      return {
        rank: Number(one["rank"] ?? 0),
        amount: BigInt((one["amount"] as bigint | undefined) ?? 0),
      };
    }),
    fee: BigInt((record["fee"] as bigint | undefined) ?? 0),
    /* A payload free Soroban enum arrives as its own number, which is the same
       order the contract declares: proposed, accepted, declined. Anything else
       reads as proposed, because an unanswered request is the state that needs
       somebody to look at it. */
    status: typeof record["status"] === "number" ? Number(record["status"]) : PROPOSED,
    at: Number(record["at"] ?? 0),
  };
}

/**
 * Asks for a category, and pays for it in the same signature.
 *
 * The money goes into the vault before the organizer is asked, so accepting is
 * a decision rather than a decision plus a collection. A refusal sends all of
 * it back, the platform's cut included.
 */
export async function proposeTrack(
  contractId: string,
  from: string,
  id: string,
  amount: bigint,
  note: Uint8Array,
): Promise<Sent> {
  /* Through the contract's own published interface, never by hand. A prize
     table is a vector of structs and this is the one call in the sponsorship
     path that sends one; writing the layout here is exactly how a field ends up
     encoded into the wrong slot without anything failing. */
  const encoder = await spec();

  const args = encoder.funcArgsToScVals("propose_track", {
    sponsor: from,
    id,
    /* One position. A sponsor who wants a category wants a winner for it, and
       places nobody enters are the shape that leaves money to be swept back
       months later. The contract takes any number; the form offers one. */
    tiers: [{ track: id, rank: 1, amount }],
    note: Buffer.from(note),
  });

  return send(
    contractId,
    "propose_track",
    args.map((value) => ({ value })),
    from,
  );
}

/** The organizer's answer. Declining refunds the sponsor in the same call. */
export async function decideTrack(
  contractId: string,
  from: string,
  id: string,
  accepted: boolean,
): Promise<Sent> {
  return send(contractId, accepted ? "accept_track" : "decline_track", [await arg.symbol(id)], from);
}
