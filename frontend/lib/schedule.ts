import { send, type Sent } from "./send";

/**
 * The schedule in force, and how much room is left to move it.
 *
 * Two different schedules exist and telling them apart is the whole point. The
 * constitution holds the one that was announced and hashed; it never changes,
 * because a document that could be edited afterwards would not be worth
 * freezing. The state holds the one actually in force, which is the announced
 * one plus whatever extensions have been spent.
 *
 * A page showing an organizer their deadlines has to show the second, and a
 * page offering to move one has to show how much of the published allowance is
 * already gone. Both come from here.
 */

const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

/**
 * A stretch of seconds in the one unit that describes it.
 *
 * Days, then hours, then minutes, each only once the one above it has run out.
 * Every countdown in the product walks the same ladder — the card's "13 days
 * to register", the wait before sign-ups open, the door on a hackathon page —
 * and a second copy of it is a second place for "0 hours left" to come back on
 * an event somebody can still just about enter.
 */
export function howLong(seconds: number): string {
  const days = Math.floor(seconds / 86_400);

  if (days > 0) {
    return `${days} ${days === 1 ? "day" : "days"}`;
  }

  const hours = Math.floor(seconds / 3_600);

  if (hours > 0) {
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  const minutes = Math.floor(seconds / 60);

  return minutes <= 1 ? "1 minute" : `${minutes} minutes`;
}

/** The contract's own numbering, which is what `extend_deadline` takes. */
export const DEADLINES = [
  { at: 0, name: "Sign-ups close", field: "registration_closes_at" },
  { at: 1, name: "Build deadline", field: "submission_closes_at" },
  { at: 2, name: "Entry check ends", field: "screening_closes_at" },
  { at: 3, name: "Judging ends", field: "judging_closes_at" },
  { at: 4, name: "Community vote closes", field: "community_vote_closes_at" },
  /* The one opening a schedule may move. Everything else that opens decides who
     can take part; this one opens after the electorate has been closed for
     weeks, so moving it changes when a settled crowd votes and nothing else.
     It has to move, because the vote follows the entry check: a check that runs
     late leaves the vote starting before the round it comes after, which is a
     schedule the contract refuses outright. */
  { at: 5, name: "Community vote opens", field: "community_vote_opens_at" },
] as const;

export interface Moveable {
  /** The contract's `Deadline` discriminant. */
  at: number;
  name: string;
  /** Seconds since the epoch, as the schedule in force has it. */
  moment: number;
  /** How many times it has already been moved. */
  timesMoved: number;
  /** How many seconds it has already gained. */
  secondsAdded: number;
}

export interface Allowance {
  /** How many times one deadline may be moved. Zero forbids it outright. */
  times: number;
  /** The most seconds one deadline may gain across all of its moves. */
  seconds: number;
}

export interface Movable {
  deadlines: Moveable[];
  allowance: Allowance;
}

/**
 * Why a chosen moment would be refused, said before anybody signs for it.
 *
 * The contract revalidates the whole schedule after a move and answers with
 * `ScheduleInvalid`, which reaches an organizer as a failed transaction and a
 * number. The same conditions are checked here so the answer arrives while the
 * date is still being typed, in the words of the deadlines it is about.
 *
 * Only the neighbours matter. Each deadline sits between the one before it and
 * the one after, and the two vote moments sit inside the judging window, so
 * every bound below is one of those relationships rather than a rule of its
 * own.
 */
export function orderProblem(at: number, moment: number, schedule: Moveable[]): string | null {
  const held = (which: number) => schedule.find((deadline) => deadline.at === which)?.moment ?? 0;
  const named = (which: number) =>
    schedule.find((deadline) => deadline.at === which)?.name ?? "the next deadline";

  /* Sign-ups may close on the build deadline but not after it; the build window
     has to close strictly before the entry check, and so on down. Equality is
     allowed exactly where the contract allows it. */
  const bounds: Record<number, { after?: [number, boolean]; before?: [number, boolean] }> = {
    0: { before: [1, false] },
    1: { after: [0, false], before: [2, true] },
    2: { after: [1, true], before: [5, false] },
    3: { after: [4, false] },
    4: { after: [5, true], before: [3, false] },
    5: { after: [2, false], before: [4, true] },
  };

  const bound = bounds[at];

  if (bound === undefined) {
    return null;
  }

  if (bound.after !== undefined) {
    const [which, strict] = bound.after;
    const limit = held(which);

    if (limit > 0 && (strict ? moment <= limit : moment < limit)) {
      return `Has to be ${strict ? "after" : "on or after"} ${named(which).toLowerCase()}.`;
    }
  }

  if (bound.before !== undefined) {
    const [which, strict] = bound.before;
    const limit = held(which);

    if (limit > 0 && (strict ? moment >= limit : moment > limit)) {
      return `Has to be ${strict ? "before" : "on or before"} ${named(which).toLowerCase()}.`;
    }
  }

  return null;
}

/**
 * The same move, applied to everything that comes after it.
 *
 * A hackathon that runs late runs late at every stage, and the deadlines after
 * the one being moved have to travel with it or the schedule stops being in
 * order. Each keeps its own gap, so a week added to the build window is a week
 * added to the entry check and the judging, not a week of them compressed.
 *
 * A deadline that has already passed is left alone: the contract will not move
 * it, and including it would take the whole run down.
 */
export function carryForward(
  at: number,
  moment: number,
  schedule: Moveable[],
  now: number,
): { deadline: number; movedTo: number }[] {
  const from = schedule.find((deadline) => deadline.at === at);

  if (from === undefined) {
    return [];
  }

  const added = moment - from.moment;

  if (added <= 0) {
    return [];
  }

  /* Ordered by the moment they currently hold rather than by their number,
     because the vote sits between the entry check and the end of judging while
     being numbered after both. */
  return schedule
    .filter((deadline) => deadline.moment > 0 && deadline.moment > now)
    .filter((deadline) => deadline.at === at || deadline.moment > from.moment)
    .sort((left, right) => left.moment - right.moment)
    .map((deadline) => ({
      deadline: deadline.at,
      movedTo: deadline.at === at ? moment : deadline.moment + added,
    }));
}

export async function scheduleOf(contractId: string): Promise<Movable | null> {
  if (rpcUrl === undefined || passphrase === undefined) {
    return null;
  }

  const [{ Account, Contract, TransactionBuilder, BASE_FEE, nativeToScVal, scValToNative }, rpc] =
    await Promise.all([
      import("@stellar/stellar-sdk/base"),
      import("@stellar/stellar-sdk/rpc"),
    ]);

  const server = new rpc.Server(rpcUrl);
  const contract = new Contract(contractId);
  const nobody = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");

  async function ask(method: string, ...args: unknown[]): Promise<unknown> {
    const tx = new TransactionBuilder(nobody, { fee: BASE_FEE, networkPassphrase: passphrase })
      .addOperation(
        contract.call(
          method,
          ...args.map((value) => nativeToScVal(value, { type: "u32" })),
        ),
      )
      .setTimeout(30)
      .build();

    const simulated = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simulated) || simulated.result === undefined) {
      throw new Error("no answer");
    }

    return scValToNative(simulated.result.retval);
  }

  const [state, constitution] = await Promise.all([
    ask("state").catch(() => null),
    ask("constitution").catch(() => null),
  ]);

  if (state === null || constitution === null) {
    return null;
  }

  const schedule = (state as { schedule?: Record<string, unknown> }).schedule ?? {};
  const extensions = (constitution as { extensions?: Record<string, unknown> }).extensions ?? {};

  /* One read per deadline, and they are asked together. `extension_usage`
     answers for a deadline that has never moved as well, so nothing here has to
     tell "never moved" apart from "cannot be read". */
  const usage = await Promise.all(
    DEADLINES.map((deadline) => ask("extension_usage", deadline.at).catch(() => null)),
  );

  return {
    deadlines: DEADLINES.map((deadline, index) => {
      const spent = usage[index] as { times?: unknown; seconds_added?: unknown } | null;

      return {
        at: deadline.at,
        name: deadline.name,
        moment: Number(schedule[deadline.field] ?? 0),
        timesMoved: Number(spent?.times ?? 0),
        secondsAdded: Number(spent?.seconds_added ?? 0),
      };
    }),
    allowance: {
      times: Number(extensions["max_extensions_per_deadline"] ?? 0),
      seconds: Number(extensions["max_total_seconds_per_deadline"] ?? 0),
    },
  };
}

/**
 * Moves several deadlines under one signature.
 *
 * The contract takes the whole run at once and decides whether where it ends up
 * is allowed, rather than judging each step of a route through it. That matters
 * for the ordinary case: pushing a build window back puts it past an entry
 * check that has not moved yet, which is illegal as a step and fine as a
 * destination.
 *
 * Encoded through the published spec rather than by hand, because the argument
 * is a list of structures and a hand written layout is how two implementations
 * of the same call drift apart.
 */
export async function extendSchedule(
  contractId: string,
  moves: { deadline: number; movedTo: number }[],
  reason: Uint8Array,
  from: string,
): Promise<Sent> {
  const { Spec } = await import("@stellar/stellar-sdk/contract");
  const entries = (await import("./contract-spec.json")).default as string[];

  const [encoded, digest] = new Spec(entries).funcArgsToScVals("extend_schedule", {
    moves: moves.map((move) => ({ deadline: move.deadline, moved_to: BigInt(move.movedTo) })),
    reason,
  });

  return send(contractId, "extend_schedule", [{ value: encoded! }, { value: digest! }], from);
}
