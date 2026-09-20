import type { VercelRequest, VercelResponse } from "@vercel/node";

import { cors, route } from "../dist/routes.js";

/**
 * The same service, one function per request.
 *
 * Every route lands here and is dispatched by `routes.ts`, the same module the
 * long lived process in `src/server.ts` dispatches through. This file holds no
 * check of its own on purpose: a second copy of the intake rules is how a
 * deployment starts accepting what the service refuses.
 *
 * `vercel.json` rewrites `/scorecard` to `/api/scorecard`, so the public paths
 * are the ones the judging page already asks for and moving the service behind
 * Vercel is a change of `NEXT_PUBLIC_SEALER_URL` and nothing else.
 *
 * What does not come along is the loop that publishes roots. A function lives
 * for one request, so `src/server.ts` still has to run somewhere for a judging
 * window to close by itself.
 */
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  for (const [header, value] of Object.entries(cors)) {
    response.setHeader(header, value);
  }

  if (request.method === "OPTIONS") {
    response.status(204).end();

    return;
  }

  const url = new URL(request.url ?? "/", "http://sealer.invalid");
  const asked = url.pathname.replace(/^\/api(?=\/|$)/, "");

  /*
    Vercel parses a JSON body before this function sees it, and the routes want
    the text. Putting it back is cheap and keeps one parser: a body that was not
    JSON never reaches here, because the platform has already refused it with
    the same 400 the routes would have given.
  */
  const body = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? null);

  const said = await route({
    method: request.method ?? "GET",
    path: asked === "" ? "/" : asked,
    query: url.searchParams,
    body,
  });

  response.status(said.status).json(said.body);
}
