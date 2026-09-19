/**
 * Check a published hackathon result without trusting anybody who published it.
 *
 * Run against a finished hackathon:
 *
 *     npx tsx examples/verify-result.ts C<contract id> payments
 *
 * Nothing here reads a database and nothing takes the outcome on trust. It
 * fetches the rules, proves they are the rules that were locked, fetches
 * everything the ranking was derived from, derives the ranking again, and
 * compares. If the two differ, the published result is not the one the
 * published data produces.
 */

import {
  HackathonCore,
  hashConstitution,
  rankTrack,
  toHex,
  type ProjectData,
} from "../src/index.js";

const [contractId, track] = process.argv.slice(2);

if (contractId === undefined || track === undefined) {
  throw new Error("usage: verify-result.ts <contract id> <track>");
}

const core = new HackathonCore({
  contractId,
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
});

// The rules, and the proof they are the rules that were locked. Everything
// after this is only meaningful because this line passed.
const constitution = (await core.constitution()).result.unwrap();
const published = (await core.constitution_hash()).result.unwrap();

if (toHex(hashConstitution(constitution)) !== published.toString("hex")) {
  throw new Error("the rules being served are not the rules that were locked");
}

// Everything the ranking was derived from, straight off the chain.
const teams = (await core.team_count()).result;
const topVotes = (await core.top_vote_count()).result;

const projects: ProjectData[] = [];

for (let team = 1; team <= teams; team += 1) {
  const submission = (await core.submission({ team_id: team })).result;

  // A team that founded but never entered has no submission, which is not an
  // error and simply means there is nothing to rank.
  if (submission.isErr()) {
    continue;
  }

  const entry = submission.unwrap();

  const scores = (await core.score_tally({ team_id: team })).result;
  const criterionTallies: ProjectData["criterionTallies"] = {};

  // Only the criteria the tie break chain names are ever read, so only those
  // are worth fetching.
  for (const rule of constitution.tie_break) {
    if (rule.tag === "Criterion") {
      const tally = (await core.criterion_tally({ team_id: team, criterion: rule.values[0] }))
        .result;
      criterionTallies[rule.values[0]] = { count: tally.count, total: tally.total };
    }
  }

  projects.push({
    team,
    track: entry.track,
    submittedAt: entry.submitted_at,
    valid: entry.status === 0,
    scores: { count: scores.count, total: scores.total },
    votes: (await core.vote_count({ team_id: team })).result,
    criterionTallies,
  });
}

const derived = rankTrack(constitution, track, projects, topVotes);
const publishedRanking = (await core.ranking({ track })).result.unwrap();

const show = (placement: { rank: number; team: number; final_score: number }) =>
  `${placement.rank}. team ${placement.team} (${placement.final_score})`;

console.log("derived here: ", derived.map(show).join(", "));
console.log("published:    ", publishedRanking.map(show).join(", "));

const agree =
  derived.length === publishedRanking.length &&
  derived.every((placement, index) => {
    const theirs = publishedRanking[index]!;

    return (
      placement.team === theirs.team &&
      placement.rank === theirs.rank &&
      placement.final_score === theirs.final_score
    );
  });

console.log(agree ? "\nThe published ranking is the one this data produces." : "\nThey disagree.");
process.exitCode = agree ? 0 : 1;
