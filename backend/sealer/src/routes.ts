import { fromHex, toHex, verifySealed } from "@stelhacks/sdk";

import { settings } from "./config.js";
import { core, sealer } from "./core.js";
import { issue } from "./receipt.js";
import { proofFor, seal } from "./seal.js";
import { contractOf, isRecord } from "./validate.js";
import { keepBallot, keepScorecard, leaves, phaseOf } from "./store.js";
import { acceptsSeal, isSealedInput } from "./tlock.js";

/**
 * What the sealed collection service answers, with no transport in it.
 *
 * Five routes, and each one exists to bound what this service can do rather
 * than to enable something:
 *
 *   POST /scorecard   take one, hand back a receipt
 *   POST /ballot      the same, for the crowd
 *   POST /seal        build the tree and publish the root on chain
 *   GET  /root        the root it would publish, for a sealer that is not us
 *   GET  /proof       the inclusion proof for one leaf, from the moment the
 *                     root exists
 *
 * The proof route is open the instant the root is published rather than at some
 * later point, because a judge who has to wait to check their own inclusion is
 * a judge being asked to trust in the meantime.
 *
 * Transport free because the service now runs in two shapes: a long lived
 * process during development, and one function per request in the deployment
 * that faces judges. A route that knew about `IncomingMessage` would have to be
 * written twice, and two copies of the intake checks is exactly the drift this
 * service cannot afford.
 */

/**
 * What every reply carries, preflight included.
 *
 * The judge's browser asks permission before it will send a card at all, and a
 * service that answers that question with "not a route" fails as a network
 * error the page cannot explain. Here rather than in each transport because a
 * deployment that dropped these headers would look fine to every test that
 * calls the service without a browser.
 */
export const cors: Record<string, string> = {
  "access-control-allow-origin": settings.allowedOrigin,
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

/** The phase a hackathon has to be in for its sealed input to be collected. */
const JUDGING = 4;

interface Failure {
  status: number;
  says: string;
}

function refuse(status: number, says: string): Failure {
  return { status, says };
}

function isFailure(result: unknown): result is Failure {
  const failure = result as Failure;

  return typeof failure?.status === "number" && typeof failure.says === "string";
}

async function takeScorecard(raw: unknown): Promise<unknown | Failure> {
  if (!isRecord(raw)) {
    return refuse(400, "that is not a scorecard submission");
  }

  const contract = contractOf(raw);
  const team = raw["team"];
  const judge = raw["judge"];
  const leafHex = raw["leaf"];
  const signature = raw["signature"];

  if (
    contract === null ||
    !Number.isInteger(team) ||
    (team as number) < 1 ||
    typeof judge !== "string" ||
    !/^G[A-Z2-7]{55}$/.test(judge) ||
    typeof leafHex !== "string" ||
    !/^[0-9a-f]{64}$/.test(leafHex) ||
    typeof signature !== "string" ||
    !/^[0-9a-f]{128}$/.test(signature) ||
    !isSealedInput(raw["sealed"])
  ) {
    return refuse(400, "a submission needs its public identity, signed leaf and sealed card");
  }

  const body = { contract, team: team as number, judge, leafHex, signature, sealed: raw["sealed"] };
  const phase = await phaseOf(body.contract);

  if (phase === null) {
    return refuse(404, "no such hackathon");
  }
  if (phase !== JUDGING) {
    return refuse(409, "this hackathon is not collecting scorecards");
  }

  if (!(await acceptsSeal(body.contract, body.sealed))) {
    return refuse(400, "the card is not sealed to this hackathon's judging deadline");
  }

  const leaf = fromHex(body.leafHex);
  const signed = {
    signer: body.judge,
    leaf,
    signature: Buffer.from(body.signature, "hex"),
  };

  // The signature is what makes the entry the judge's rather than the service's.
  // Without this check the service could write whatever it liked into the table
  // and the tree would faithfully commit to it.
  if (!verifySealed(signed)) {
    return refuse(400, "that signature does not cover that scorecard leaf");
  }

  await keepScorecard({
    contract: body.contract,
    team: body.team,
    judge: body.judge,
    leaf: body.leafHex,
    signature: body.signature,
    sealed: body.sealed,
  });

  return issue(leaf, sealer, Math.floor(Date.now() / 1000));
}

async function takeBallot(raw: unknown): Promise<unknown | Failure> {
  if (!isRecord(raw)) {
    return refuse(400, "that is not a ballot");
  }

  const contract = contractOf(raw);
  const voter = raw["voter"];
  const leafHex = raw["leaf"];
  const signature = raw["signature"];

  if (
    contract === null ||
    typeof voter !== "string" ||
    !/^G[A-Z2-7]{55}$/.test(voter) ||
    typeof leafHex !== "string" ||
    !/^[0-9a-f]{64}$/.test(leafHex) ||
    typeof signature !== "string" ||
    !/^[0-9a-f]{128}$/.test(signature) ||
    !isSealedInput(raw["sealed"])
  ) {
    return refuse(400, "a ballot needs its public identity, signed leaf and sealed choices");
  }

  const body = { contract, voter, leafHex, signature, sealed: raw["sealed"] };
  const phase = await phaseOf(body.contract);

  if (phase === null) {
    return refuse(404, "no such hackathon");
  }
  if (phase !== JUDGING) {
    return refuse(409, "this hackathon is not collecting ballots");
  }

  if (!(await acceptsSeal(body.contract, body.sealed))) {
    return refuse(400, "the ballot is not sealed to this hackathon's judging deadline");
  }

  const leaf = fromHex(body.leafHex);
  const signed = {
    signer: body.voter,
    leaf,
    signature: Buffer.from(body.signature, "hex"),
  };

  if (!verifySealed(signed)) {
    return refuse(400, "that signature does not cover that ballot leaf");
  }

  await keepBallot({
    contract: body.contract,
    voter: body.voter,
    leaf: body.leafHex,
    signature: body.signature,
    sealed: body.sealed,
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

/**
 * The root this service would publish, without publishing it.
 *
 * For the one case where it cannot: the constitution names an address and the
 * contract asks that exact key to authorize the call, so a hackathon frozen
 * with somebody else as its sealer leaves this process holding every card and
 * unable to put a digest on chain. There is no fix for such an event from here
 * — the document is frozen — and the party it named can still do it, provided
 * something hands them the root.
 *
 * The root is a pure function of the leaves held, which is why handing it out
 * gives nothing away and settles nothing. Whoever signs it is still the address
 * the rules announced, and the contract still refuses a second one.
 */
async function rootOf(contract: string, kind: "scorecards" | "ballots") {
  const held = await leaves(contract, kind);

  if (held.length === 0) {
    return refuse(404, "nothing is held for that hackathon");
  }

  return { root: toHex(seal(held).root), sealed: held.length };
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

/** One request, stripped of whatever carried it here. */
export interface Asked {
  method: string;
  path: string;
  query: URLSearchParams;
  /**
   * The body as it arrived, unparsed.
   *
   * Unparsed rather than decoded by the caller because a body that is not JSON
   * is a 400 this service owes the same answer to whichever transport brought
   * it, and a caller that parsed it first would have to invent that answer.
   */
  body: string;
}

export interface Answer {
  status: number;
  body: unknown;
}

/** What the service answers, for anything that can describe a request. */
export async function route(asked: Asked): Promise<Answer> {
  const settle = (result: unknown): Answer =>
    isFailure(result) ? { status: result.status, body: { error: result.says } } : { status: 200, body: result };

  const kindOf = (): "scorecards" | "ballots" =>
    asked.query.get("kind") === "ballots" ? "ballots" : "scorecards";

  try {
    if (asked.method === "GET" && asked.path === "/root") {
      return settle(await rootOf(asked.query.get("contract") ?? "", kindOf()));
    }

    if (asked.method === "GET" && asked.path === "/proof") {
      return settle(
        await proof(asked.query.get("contract") ?? "", kindOf(), asked.query.get("leaf") ?? ""),
      );
    }

    if (asked.method !== "POST") {
      return { status: 405, body: { error: "not a route" } };
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(asked.body);
    } catch {
      return { status: 400, body: { error: "that is not JSON" } };
    }

    switch (asked.path) {
      case "/scorecard":
        return settle(await takeScorecard(parsed));
      case "/ballot":
        return settle(await takeBallot(parsed));
      case "/seal":
        return settle(await publish(parsed));
      default:
        return { status: 404, body: { error: "not a route" } };
    }
  } catch (thrown) {
    return { status: 500, body: { error: String(thrown) } };
  }
}
