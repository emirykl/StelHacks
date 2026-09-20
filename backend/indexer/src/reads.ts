import { HackathonCore } from "@stelhacks/sdk";

import { settings } from "./config.js";
import type { ProjectedEvent, StoredRead } from "./records.js";

/**
 * Asking the contract the three questions its events do not answer.
 *
 * `visibility`, `prize_asset` and the judge bench live in the constitution, a
 * submission's URI is absent from `ProjectSubmitted`, and the ranking is absent
 * from `TrackRanked`, which counts placings rather than naming them.
 *
 * The asking happens here, at ingest, and not at rebuild time. Soroban entries
 * expire, and a finished hackathon is one nobody writes to, so its state goes
 * away. A rebuild that called the contract again would work today and answer
 * nothing in a year, which is exactly when somebody would be checking an old
 * result.
 */

function core(contract: string): HackathonCore {
  return new HackathonCore({
    contractId: contract,
    networkPassphrase: settings.networkPassphrase,
    rpcUrl: settings.rpcUrl,
  });
}

/**
 * Every answer this batch of events calls for.
 *
 * A failed call is left out rather than recorded as an absence, because the two
 * mean different things: a missing read is a gap to fill on a later pass, and a
 * recorded empty one would be a gap nobody ever notices. The cursor still
 * advances, so the event is not re-read; what fills the gap is a rebuild once
 * the call succeeds. That is the honest trade and it is worth knowing about.
 */
export async function gather(
  contract: string,
  events: readonly ProjectedEvent[],
): Promise<StoredRead[]> {
  const client = core(contract);
  const reads: StoredRead[] = [];

  for (const event of events) {
    const wanted = await ask(client, event);

    if (wanted !== null) {
      reads.push({ contract_id: contract, ledger: event.ledger, ...wanted });
    }
  }

  return reads;
}

type Answer = Pick<StoredRead, "kind" | "key" | "data">;

async function ask(client: HackathonCore, event: ProjectedEvent): Promise<Answer | null> {
  try {
    switch (event.name) {
      case "RulesLocked": {
        const rules = (await client.constitution()).result.unwrap();

        return {
          kind: "constitution",
          key: "",
          data: {
            visibility: rules.visibility,
            prize_asset: rules.prize_asset,
            judges: rules.judges.map((assignment) => assignment.judge),
          },
        };
      }

      case "ProjectSubmitted": {
        const team = Number(event.fields["team"]);
        const entry = (await client.submission({ team_id: team })).result.unwrap();

        return { kind: "submission", key: String(team), data: { uri: entry.uri } };
      }

      case "TrackRanked": {
        const track = String(event.fields["track"]);
        const ranking = (await client.ranking({ track })).result.unwrap();

        return {
          kind: "ranking",
          key: track,
          data: {
            placements: ranking.map((placement) => ({
              rank: placement.rank,
              team: placement.team,
              final_score: placement.final_score,
              judge_average: placement.judge_average,
              community: placement.community,
              decided_by: placement.decided_by,
            })),
          },
        };
      }

      default:
        return null;
    }
  } catch (reason) {
    // Worth saying out loud rather than swallowing. A contract that cannot
    // answer is usually a contract whose state has expired, and that is a fact
    // about this hackathon rather than a fault in the indexer.
    console.warn(`could not read ${event.name} state at ledger ${event.ledger}: ${String(reason)}`);

    return null;
  }
}
