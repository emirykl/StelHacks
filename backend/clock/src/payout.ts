import { rpc } from "@stellar/stellar-sdk";
import { type HackathonCore } from "@stelhacks/sdk";

import { named, refusal } from "./due.js";

/**
 * Hands the money out once settlement is open, so nobody has to come and ask.
 *
 * Every call here is one the contract already lets anybody make: the amounts
 * and the recipients were frozen at the lock, a prize can only go to the member
 * it belongs to, and a sweep can only go to whoever funded the position. So this
 * is the clock doing the same errand as everywhere else, just at the end.
 *
 * What a lap tries, per position the rules pay:
 *
 *   won       pay the whole team in one call, each member straight to their
 *             own wallet
 *   not won   return the whole position to the organizer, or its sponsor
 *
 * A member who cannot be paid, most often a wallet with no trustline for the
 * prize asset, is skipped by the contract while their teammates are paid, and
 * their share goes back the same way as an unwon position once the claim
 * period announced at the lock has run out. A winner who fixes their wallet in
 * the meantime is still paid; this simply asks again every lap.
 */

/** Settlement, the only phase any of this can happen in. */
const SETTLEMENT = 7;

/** Members already reported as unpayable, so a month of laps says it once. */
const reported = new Set<string>();

export interface Paid {
  call: "settle_platform_fee" | "settle_position" | "settle_prize" | "sweep_unclaimed" | "sweep_share";
  what: string;
}

export async function payOut(core: HackathonCore, contract: string): Promise<Paid[]> {
  const state = (await core.state()).result;

  if (!state.isOk() || Number(state.unwrap().phase) !== SETTLEMENT) {
    return [];
  }

  /* A hold is the organizer stopping the money to look for a bug, and nothing
     moves until it lifts. Contracts deployed before the sweeps learned to
     respect it would still let a sweep through, and this service is the one
     caller that would otherwise make it every lap. */
  if (state.unwrap().settlement_paused) {
    return [];
  }

  const paid: Paid[] = [];

  /* The platform's cut first. It is refused once settled, and never fails a
     prize, so its outcome decides nothing below. */
  if (await sent(await core.settle_platform_fee())) {
    paid.push({ call: "settle_platform_fee", what: "platform fee" });
  }

  for (const { track, rank } of await positions(core)) {
    if ((await core.is_paid({ track, rank })).result) {
      continue;
    }

    const ranking = (await core.ranking({ track })).result;
    const placement = ranking.isOk()
      ? ranking.unwrap().find((placed) => placed.rank === rank)
      : undefined;

    if (placement === undefined) {
      if (await sent(await core.sweep_unclaimed({ track, rank }))) {
        paid.push({ call: "sweep_unclaimed", what: `${track} #${rank} back to its funder` });
      }

      continue;
    }

    const team = (await core.team_by_id({ id: placement.team })).result;

    if (!team.isOk()) {
      continue;
    }

    const members = team.unwrap().members;

    paid.push(...(await payTeam(core, track, rank, members)));

    for (const member of members) {
      const sweep = await core.sweep_share({ track, rank, member });

      if (await sent(sweep)) {
        paid.push({ call: "sweep_share", what: `${track} #${rank} share of ${member} back to its funder` });
        continue;
      }

      /* Already paid is the ordinary answer for every member who was. The
         claim period still running is the one that means somebody is owed and
         could not be paid this lap. */
      const why = failure(sweep);
      const key = `${contract}:${track}:${rank}:${member}`;

      if (why?.startsWith("refused: ClaimPeriodOpen") && !reported.has(key)) {
        reported.add(key);
        console.error(`${contract}: cannot pay ${member} for ${track} #${rank} yet`);
      }
    }
  }

  return paid;
}

/**
 * Pays every member of one position who can be paid, in one call where the
 * contract has it.
 *
 * Hackathons deployed before `settle_position` existed keep their code for
 * good, so for those this falls back to one `settle_prize` per member. Their
 * simulation fails without a contract error, because the function is not
 * there to refuse anything, and that is the signal.
 */
async function payTeam(
  core: HackathonCore,
  track: string,
  rank: number,
  members: string[],
): Promise<Paid[]> {
  const whole = await core.settle_position({ track, rank });
  const why = failure(whole);

  if (why === null) {
    const count = whole.result.isOk() ? whole.result.unwrap() : 0;

    /* A simulation that would pay nobody is everyone already paid or nobody
       yet able to receive. Sending it would buy a ledger entry saying so. */
    if (count === 0) {
      return [];
    }

    await whole.signAndSend();

    return [{ call: "settle_position", what: `${track} #${rank} to ${count} of ${members.length} members` }];
  }

  if (refusal(simulationError(whole) ?? "") !== null) {
    return [];
  }

  const paid: Paid[] = [];

  for (const member of members) {
    if (await sent(await core.settle_prize({ track, rank, member }))) {
      paid.push({ call: "settle_prize", what: `${track} #${rank} to ${member}` });
    }
  }

  return paid;
}

/**
 * Every position the rules pay: the frozen table, then the sponsored tracks
 * that were accepted. The same list `complete` checks, so once each of these
 * is settled the event can close.
 */
async function positions(core: HackathonCore): Promise<{ track: string; rank: number }[]> {
  const rules = (await core.constitution()).result;

  if (!rules.isOk()) {
    return [];
  }

  const all = rules.unwrap().prize_tiers.map(({ track, rank }) => ({ track, rank }));

  for (const id of (await core.sponsor_track_ids()).result) {
    const sponsored = (await core.sponsor_track({ id })).result;

    /* Accepted is 1. Read from the number because the enum is generated into
       the bindings and the clock does not import it anywhere else. */
    if (sponsored.isOk() && Number(sponsored.unwrap().status) === 1) {
      all.push(...sponsored.unwrap().tiers.map(({ track, rank }) => ({ track, rank })));
    }
  }

  return all;
}

type Built = { simulation?: unknown; signAndSend: () => Promise<unknown> };

/** Sends the call when the simulation went through, and says whether it did. */
async function sent(built: Built): Promise<boolean> {
  if (failure(built) !== null) {
    return false;
  }

  await built.signAndSend();

  return true;
}

function simulationError(built: Built): string | null {
  const simulation = built.simulation as rpc.Api.SimulateTransactionResponse | undefined;

  if (simulation === undefined || !rpc.Api.isSimulationError(simulation)) {
    return null;
  }

  return simulation.error;
}

function failure(built: Built): string | null {
  const error = simulationError(built);

  if (error === null) {
    return null;
  }

  /* Named only when the code is ours. A token that refuses the transfer, the
     usual one being a wallet with no trustline, raises its own contract error
     whose number means something else entirely in this contract's table. */
  const code = refusal(error);
  const ours = code !== null && !error.includes("token");

  return ours ? `refused: ${named(code)}` : error.slice(0, 200);
}
