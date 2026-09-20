import { createServer } from "node:http";

import { ballotLeaf, scorecardLeaf, toHex, verifyBallot, verifyScorecard } from "@stelhacks/sdk";

import { settings } from "./config.js";
import { core, sealer } from "./core.js";
import { issue } from "./receipt.js";
import { proofFor, seal } from "./seal.js";
import { ballotRules, fits } from "./rules.js";
import { contractOf, isBallot, isRecord, isScorecard } from "./validate.js";
import { rounds } from "./rounds.js";
import { keepBallot, keepScorecard, leaves, phaseOf } from "./store.js";

/**
 * The sealed collection service.
 *
 * It takes scorecards and ballots during the judging window, holds them where
 * nobody can read them, and publishes one digest committing to all of them when
 * the window closes. Four routes, and each one exists to bound what this
 * service can do rather than to enable something:
 *
 *   POST /scorecard   take one, hand back a receipt
 *   POST /ballot      the same, for the crowd
 *   POST /seal        build the tree and publish the root on chain
 *   GET  /proof       the inclusion proof for one leaf, from the moment the
 *                     root exists
 *
 * The proof route is open the instant the root is published rather than at some
 * later point, because a judge who has to wait to check their own inclusion is
 * a judge being asked to trust in the meantime.
 */

/** The phase a hackathon has to be in for its sealed input to be collected. */
const JUDGING = 4;

interface Failure {
  status: number;
  says: string;
}

function refuse(status: number, says: string): Failure {
  return { status, says };
}

async function takeScorecard(raw: unknown): Promise<unknown | Failure> {
  if (!isRecord(raw)) {
    return refuse(400, "that is not a scorecard submission");
  }

  const contract = contractOf(raw);
  const signature = raw["signature"];
  const feedback = raw["feedback"];

  if (contract === null || !isScorecard(raw["scorecard"]) || typeof signature !== "string") {
    return refuse(400, "a submission needs a contract, a scorecard and a signature");
  }
  if (feedback !== undefined && typeof feedback !== "string") {
    return refuse(400, "feedback has to be text");
  }

  const body = { contract, scorecard: raw["scorecard"], signature, feedback };
  const phase = await phaseOf(body.contract);

  if (phase === null) {
    return refuse(404, "no such hackathon");
  }
  if (phase !== JUDGING) {
    return refuse(409, "this hackathon is not collecting scorecards");
  }

  const leaf = scorecardLeaf(body.scorecard);
  const signed = {
    signer: body.scorecard.judge,
    leaf,
    signature: Buffer.from(body.signature, "hex"),
  };

  // The signature is what makes the entry the judge's rather than the service's.
  // Without this check the service could write whatever it liked into the table
  // and the tree would faithfully commit to it.
  if (!verifyScorecard(body.scorecard, signed)) {
    return refuse(400, "that signature does not cover that scorecard");
  }

  await keepScorecard({
    contract: body.contract,
    team: body.scorecard.team,
    judge: body.scorecard.judge,
    scores: body.scorecard.scores,
    feedback: body.feedback ?? null,
    leaf: toHex(leaf),
    signature: body.signature,
  });

  return issue(leaf, sealer, Math.floor(Date.now() / 1000));
}

async function takeBallot(raw: unknown): Promise<unknown | Failure> {
  if (!isRecord(raw)) {
    return refuse(400, "that is not a ballot");
  }

  const contract = contractOf(raw);
  const voter = raw["voter"];
  const choices = raw["choices"];
  const signature = raw["signature"];

  if (
    contract === null ||
    typeof voter !== "string" ||
    !isBallot(choices) ||
    typeof signature !== "string"
  ) {
    return refuse(400, "a ballot needs a contract, a voter, its choices and a signature");
  }

  const body = { contract, voter, choices, signature };
  const phase = await phaseOf(body.contract);

  if (phase === null) {
    return refuse(404, "no such hackathon");
  }
  if (phase !== JUDGING) {
    return refuse(409, "this hackathon is not collecting ballots");
  }

  const rules = await ballotRules(body.contract);

  if (!fits(body.choices, rules)) {
    return refuse(
      400,
      `this hackathon gives a wallet ${rules.power} points to place across at most ${rules.maxChoices} projects, all of which have to be spent`,
    );
  }

  const leaf = ballotLeaf(body.voter, body.choices);
  const signed = {
    signer: body.voter,
    leaf,
    signature: Buffer.from(body.signature, "hex"),
  };

  if (!verifyBallot(body.voter, body.choices, signed)) {
    return refuse(400, "that signature does not cover that ballot");
  }

  await keepBallot({
    contract: body.contract,
    voter: body.voter,
    choices: body.choices,
    leaf: toHex(leaf),
    signature: body.signature,
  });

  return issue(leaf, sealer, Math.floor(Date.now() / 1000));
}

/**
 * Closes the window by putting one digest on chain.
 *
 * After this the service can no longer change any of the entries, because the
 * root commits to all of them at once. The contract refuses a second root for
 * the same reason: one more would let the sealer replace the whole set after
 * seeing what the first produced.
 */
async function publish(raw: unknown) {
  if (!isRecord(raw)) {
    return refuse(400, "that is not a sealing request");
  }

  const contract = contractOf(raw);

  if (contract === null) {
    return refuse(400, "sealing needs a contract");
  }

  const body = {
    contract,
    kind: raw["kind"] === "ballots" ? ("ballots" as const) : ("scorecards" as const),
  };
  const held = await leaves(body.contract, body.kind);

  if (held.length === 0) {
    return refuse(409, "there is nothing to seal");
  }

  const sealed = seal(held);

  const client = core(body.contract);
  const root = Buffer.from(sealed.root);
  const call =
    body.kind === "scorecards"
      ? await client.publish_score_root({ root })
      : await client.publish_ballot_root({ root });

  await call.signAndSend();

  return { root: toHex(sealed.root), sealed: held.length };
}

/** The inclusion proof for one leaf, rebuilt from what the service holds. */
async function proof(contract: string, kind: "scorecards" | "ballots", leaf: string) {
  const held = await leaves(contract, kind);

  if (held.length === 0) {
    return refuse(404, "nothing is held for that hackathon");
  }

  const sealed = seal(held);
  const found = proofFor(sealed, Buffer.from(leaf, "hex"));

  if (found === null) {
    // Said plainly rather than as a generic not found. A judge asking this
    // question is asking whether they were left out, and the answer is yes.
    return refuse(404, "that leaf is not in the tree");
  }

  return { root: toHex(sealed.root), proof: found.map(toHex) };
}

const routes = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  /*
    The judge's browser asks permission before it will send a card at all, and
    a service that answers that question with "not a route" fails as a network
    error the page cannot explain. So every reply carries the headers and the
    preflight is answered on its own.
  */
  const cors: Record<string, string> = {
    "access-control-allow-origin": settings.allowedOrigin,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };

  const answer = (status: number, body: unknown): void => {
    response.writeHead(status, { "content-type": "application/json", ...cors });
    response.end(JSON.stringify(body));
  };

  if (request.method === "OPTIONS") {
    response.writeHead(204, cors);
    response.end();

    return;
  }

  const settle = (result: unknown): void => {
    const failure = result as Failure;

    if (typeof failure?.status === "number" && typeof failure.says === "string") {
      answer(failure.status, { error: failure.says });
    } else {
      answer(200, result);
    }
  };

  if (request.method === "GET" && url.pathname === "/proof") {
    const contract = url.searchParams.get("contract") ?? "";
    const kind = url.searchParams.get("kind") === "ballots" ? "ballots" : "scorecards";
    const leaf = url.searchParams.get("leaf") ?? "";

    proof(contract, kind, leaf).then(settle, (reason) => answer(500, { error: String(reason) }));

    return;
  }

  if (request.method !== "POST") {
    answer(405, { error: "not a route" });

    return;
  }

  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    let parsed: unknown;

    try {
      parsed = JSON.parse(body);
    } catch {
      answer(400, { error: "that is not JSON" });

      return;
    }

    const handler =
      url.pathname === "/scorecard"
        ? takeScorecard(parsed)
        : url.pathname === "/ballot"
          ? takeBallot(parsed)
          : url.pathname === "/seal"
            ? publish(parsed)
            : null;

    if (handler === null) {
      answer(404, { error: "not a route" });

      return;
    }

    handler.then(settle, (reason) => answer(500, { error: String(reason) }));
  });
});

routes.listen(settings.port, () => {
  console.log(`sealing for ${sealer.publicKey()} on :${settings.port}`);
});

/*
  The half of the job nobody asks for.

  Taking entries is a request and answering it is a route. Putting them on chain
  is not: it happens when a window shuts and again when the phase allows the
  entries to be opened, and neither moment arrives as an HTTP call. Before this
  loop both were a person remembering, which meant a hackathon could be judged
  properly and still reach its ranking with no scores on chain.

  On the same process rather than a service of its own, because the sealed
  entries are here and a second process doing this work would have to be handed
  them.
*/
async function keep(): Promise<void> {
  for (;;) {
    try {
      for (const said of await rounds()) {
        console.error(said);
      }
    } catch (thrown) {
      console.error(`could not walk the hackathons: ${thrown}`);
    }

    await new Promise((wake) => setTimeout(wake, settings.everyMs));
  }
}

void keep();
