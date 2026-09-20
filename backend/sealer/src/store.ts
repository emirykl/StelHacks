import { createClient } from "@supabase/supabase-js";
import {
  ballotLeaf,
  fromHex,
  scorecardLeaf,
  toHex,
  verifyBallot,
  verifyScorecard,
  type Digest,
  type VoteChoice,
} from "@stelhacks/sdk";

import { settings } from "./config.js";
import { ballotRules, fits } from "./rules.js";
import { isBallot, isRecord, isScorecard } from "./validate.js";
import { InvalidSealedInputError, openSeal, type SealedInput } from "./tlock.js";

/**
 * The sealed tables, reached by the one role allowed to touch them.
 *
 * No client role has a grant on `scorecards` or `ballots`, including the
 * organizer's. More importantly, new rows contain Sub Rosa tlock ciphertext:
 * even this service-role process cannot read the payload before the deadline.
 * The role tests cover the first boundary; the envelope covers the second.
 */
const db = createClient(settings.supabaseUrl, settings.serviceRoleKey, {
  auth: { persistSession: false },
});

export interface SealedEntry {
  leaf: Digest;
}

export async function keepScorecard(entry: {
  contract: string;
  team: number;
  judge: string;
  leaf: string;
  signature: string;
  sealed: SealedInput;
}): Promise<void> {
  const { error } = await db.from("scorecards").upsert(
    {
      contract_id: entry.contract,
      team_id: entry.team,
      judge: entry.judge,
      scores: null,
      feedback: null,
      leaf: `\\x${entry.leaf}`,
      signature: `\\x${entry.signature}`,
      tlock_round: entry.sealed.round,
      tlock_commitment: `\\x${entry.sealed.commitment}`,
      ciphertext: `\\x${entry.sealed.ciphertext}`,
    },
    { onConflict: "contract_id,team_id,judge" },
  );

  if (error !== null) {
    throw new Error(`could not keep the scorecard: ${error.message}`);
  }
}

export async function keepBallot(entry: {
  contract: string;
  voter: string;
  leaf: string;
  signature: string;
  sealed: SealedInput;
}): Promise<void> {
  const { error } = await db.from("ballots").upsert(
    {
      contract_id: entry.contract,
      voter: entry.voter,
      choices: null,
      leaf: `\\x${entry.leaf}`,
      signature: `\\x${entry.signature}`,
      tlock_round: entry.sealed.round,
      tlock_commitment: `\\x${entry.sealed.commitment}`,
      ciphertext: `\\x${entry.sealed.ciphertext}`,
    },
    { onConflict: "contract_id,voter" },
  );

  if (error !== null) {
    throw new Error(`could not keep the ballot: ${error.message}`);
  }
}

/**
 * Every leaf the service is holding for one hackathon.
 *
 * The tree is rebuilt from these on demand rather than stored. Storing it would
 * put a second answer beside the leaves and leave room for the two to differ;
 * rebuilding means the root can only ever be what the entries say it is.
 */
export async function leaves(contract: string, kind: "scorecards" | "ballots"): Promise<Digest[]> {
  const { data, error } = await db.from(kind).select("leaf").eq("contract_id", contract);

  if (error !== null) {
    throw new Error(`could not read the ${kind}: ${error.message}`);
  }

  return data.map((row) => fromHex(String(row.leaf).replace(/^\\x/, "")));
}

/**
 * The entries themselves, for the pass that opens them on chain.
 *
 * `leaves` above is enough to build the tree, and deliberately returns nothing
 * else: the root commits to the digests and needs no idea what is inside them.
 * Revealing is the opposite job. The contract is handed the scorecard in full
 * and recomputes the leaf from it, so this has to return what the judge
 * actually wrote.
 */
export interface HeldScorecard {
  team: number;
  judge: string;
  scores: { criterion: string; score: number }[];
}

export async function heldScorecards(contract: string): Promise<HeldScorecard[]> {
  const { data, error } = await db
    .from("scorecards")
    .select("team_id, judge, scores, leaf, signature, tlock_round, tlock_commitment, ciphertext")
    .eq("contract_id", contract);

  if (error !== null) {
    throw new Error(`could not read the scorecards: ${error.message}`);
  }

  const opened = await Promise.all(
    data.map(async (row): Promise<HeldScorecard | null> => {
      if (row.ciphertext === null) {
        return {
          team: Number(row.team_id),
          judge: String(row.judge),
          scores: row.scores as { criterion: string; score: number }[],
        };
      }

      const payload = await openOrReject(contract, "scorecard", row);
      if (payload === null) {
        return null;
      }
      if (!isRecord(payload) || payload["kind"] !== "stelhacks.scorecard.v1") {
        return rejected(contract, "scorecard", row.leaf);
      }

      const scorecard = payload["scorecard"];
      const signature = bytes(row.signature);
      const leaf = bytes(row.leaf);

      if (
        !isScorecard(scorecard) ||
        scorecard.team !== Number(row.team_id) ||
        scorecard.judge !== String(row.judge) ||
        toHex(scorecardLeaf(scorecard)) !== toHex(leaf) ||
        !verifyScorecard(scorecard, { signer: scorecard.judge, leaf, signature })
      ) {
        return rejected(contract, "scorecard", row.leaf);
      }

      return scorecard;
    }),
  );

  return opened.filter((entry): entry is HeldScorecard => entry !== null);
}

export async function heldBallots(
  contract: string,
): Promise<{ voter: string; choices: VoteChoice[] }[]> {
  const { data, error } = await db
    .from("ballots")
    .select("voter, choices, leaf, signature, tlock_round, tlock_commitment, ciphertext")
    .eq("contract_id", contract);

  if (error !== null) {
    throw new Error(`could not read the ballots: ${error.message}`);
  }

  const rules = await ballotRules(contract);
  const opened = await Promise.all(
    data.map(async (row): Promise<{ voter: string; choices: VoteChoice[] } | null> => {
      if (row.ciphertext === null) {
        return {
          voter: String(row.voter),
          choices: row.choices as VoteChoice[],
        };
      }

      const payload = await openOrReject(contract, "ballot", row);
      if (payload === null) {
        return null;
      }
      if (
        !isRecord(payload) ||
        payload["kind"] !== "stelhacks.ballot.v1" ||
        payload["voter"] !== String(row.voter) ||
        !isBallot(payload["choices"])
      ) {
        return rejected(contract, "ballot", row.leaf);
      }

      const voter = String(row.voter);
      const choices = payload["choices"];
      const signature = bytes(row.signature);
      const leaf = bytes(row.leaf);

      if (
        !fits(choices, rules) ||
        toHex(ballotLeaf(voter, choices)) !== toHex(leaf) ||
        !verifyBallot(voter, choices, { signer: voter, leaf, signature })
      ) {
        return rejected(contract, "ballot", row.leaf);
      }

      return { voter, choices };
    }),
  );

  return opened.filter(
    (entry): entry is { voter: string; choices: VoteChoice[] } => entry !== null,
  );
}

function sealed(row: Record<string, unknown>): SealedInput {
  return {
    round: Number(row["tlock_round"]),
    commitment: toHex(bytes(row["tlock_commitment"])),
    ciphertext: toHex(bytes(row["ciphertext"])),
  };
}

/** Supabase returns bytea as `\\x` hex; tests may hand us bytes directly. */
function bytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  return fromHex(String(value).replace(/^\\x/, ""));
}

/**
 * A corrupt envelope invalidates that row. Failure to reach Drand is different:
 * it must abort this pass so the scheduler can retry rather than silently omit
 * an otherwise valid vote from the reveal.
 */
async function openOrReject(
  contract: string,
  kind: string,
  row: Record<string, unknown>,
): Promise<unknown | null> {
  try {
    return await openSeal(sealed(row));
  } catch (error) {
    if (error instanceof InvalidSealedInputError) {
      return rejected(contract, kind, row["leaf"]);
    }

    throw error;
  }
}

/** A well-signed but malformed private payload invalidates only itself. */
function rejected(contract: string, kind: string, leaf: unknown): null {
  console.error(`${contract}: ignored a malformed tlock ${kind} ${String(leaf)}`);

  return null;
}

/**
 * Every hackathon the product knows about.
 *
 * Read fresh on each round rather than once at startup, so an event created
 * while this is running is sealed on time without a restart.
 */
export async function everyHackathon(): Promise<string[]> {
  const { data, error } = await db.from("hackathons").select("contract_id");

  if (error !== null) {
    throw new Error(`could not read the hackathons: ${error.message}`);
  }

  return data.map((row) => String(row.contract_id));
}

/** Whether a hackathon exists as far as the indexer has seen, and what phase it is in. */
export async function phaseOf(contract: string): Promise<number | null> {
  const { data } = await db
    .from("hackathon_state")
    .select("phase")
    .eq("contract_id", contract)
    .maybeSingle();

  return data === null ? null : Number(data.phase);
}
