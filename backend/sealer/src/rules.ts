import type { VoteChoice } from "@stelhacks/sdk";

import { core } from "./core.js";

/**
 * How large a ballot is at one hackathon, read from the frozen rules.
 *
 * The contract is the authority on this and refuses a ballot that does not fit,
 * but it only gets to say so at the reveal, weeks after the voter pressed send.
 * By then the ballot is sealed under a published root and there is nothing
 * anybody can do about it. So the same check runs here, on intake, where a
 * refusal is still an answer somebody can act on.
 *
 * Cached for the life of the process, which is safe in the one direction that
 * matters: these values are inside the constitution, and a constitution that
 * could be edited after the lock would make the whole product meaningless.
 */
const known = new Map<string, BallotRules>();

export interface BallotRules {
  /** The points one wallet has to place, all of which it must spend. */
  power: number;
  /** The most projects one ballot may be spread across. */
  maxChoices: number;
}

export async function ballotRules(contract: string): Promise<BallotRules> {
  const held = known.get(contract);
  if (held !== undefined) {
    return held;
  }

  const read = (await core(contract).constitution()).result;

  if (!read.isOk()) {
    throw new Error(`${contract} has no readable constitution yet`);
  }

  const { vote } = read.unwrap();
  const rules = { power: Number(vote.power), maxChoices: Number(vote.max_choices) };

  known.set(contract, rules);

  return rules;
}

/** Whether this ballot spends exactly what the rules hand out, no wider than
 * they allow. The shape itself — order, repeats, positive weights — is settled
 * before this is asked. */
export function fits(choices: readonly VoteChoice[], rules: BallotRules): boolean {
  if (choices.length > rules.maxChoices) {
    return false;
  }

  const spent = choices.reduce((total, choice) => total + choice.weight, 0);

  return spent === rules.power;
}
