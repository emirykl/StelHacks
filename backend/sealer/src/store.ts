import { createClient } from "@supabase/supabase-js";
import { fromHex, type Digest, type VoteChoice } from "@stelhacks/sdk";

import { settings } from "./config.js";

/**
 * The sealed tables, reached by the one role allowed to touch them.
 *
 * No client role has a grant on `scorecards` or `ballots`, and no policy either,
 * including the organizer's. That is checked by the role tests rather than
 * described here; what this module is for is being the only thing on the other
 * side of that wall.
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
  scores: unknown;
  feedback: string | null;
  leaf: string;
  signature: string;
}): Promise<void> {
  const { error } = await db.from("scorecards").upsert(
    {
      contract_id: entry.contract,
      team_id: entry.team,
      judge: entry.judge,
      scores: entry.scores,
      feedback: entry.feedback,
      leaf: `\\x${entry.leaf}`,
      signature: `\\x${entry.signature}`,
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
  choices: VoteChoice[];
  leaf: string;
  signature: string;
}): Promise<void> {
  const { error } = await db.from("ballots").upsert(
    {
      contract_id: entry.contract,
      voter: entry.voter,
      choices: entry.choices,
      leaf: `\\x${entry.leaf}`,
      signature: `\\x${entry.signature}`,
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
    .select("team_id, judge, scores")
    .eq("contract_id", contract);

  if (error !== null) {
    throw new Error(`could not read the scorecards: ${error.message}`);
  }

  return data.map((row) => ({
    team: Number(row.team_id),
    judge: String(row.judge),
    scores: row.scores as { criterion: string; score: number }[],
  }));
}

export async function heldBallots(
  contract: string,
): Promise<{ voter: string; choices: VoteChoice[] }[]> {
  const { data, error } = await db
    .from("ballots")
    .select("voter, choices")
    .eq("contract_id", contract);

  if (error !== null) {
    throw new Error(`could not read the ballots: ${error.message}`);
  }

  return data.map((row) => ({
    voter: String(row.voter),
    /* Stored as written rather than rebuilt, because the leaf was hashed over
       this exact sequence and a round trip that reordered it would produce a
       digest no proof matches. */
    choices: row.choices as VoteChoice[],
  }));
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
