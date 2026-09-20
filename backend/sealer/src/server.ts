import { createServer } from "node:http";

import { settings } from "./config.js";
import { sealer } from "./core.js";
import { cors, route } from "./routes.js";
import { rounds } from "./rounds.js";

/**
 * The sealed collection service as one long lived process.
 *
 * What it answers is in `routes.ts`; this only carries requests to it and the
 * replies back. The deployment that faces judges runs the same routes one
 * function per request instead, and the two share every check because neither
 * of them contains any.
 */
const routes = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  const answer = (status: number, body: unknown): void => {
    response.writeHead(status, { "content-type": "application/json", ...cors });
    response.end(JSON.stringify(body));
  };

  if (request.method === "OPTIONS") {
    response.writeHead(204, cors);
    response.end();

    return;
  }

  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    void route({
      method: request.method ?? "GET",
      path: url.pathname,
      query: url.searchParams,
      body,
    }).then((said) => answer(said.status, said.body));
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

  It stays on this process rather than becoming a service of its own, and it
  stays out of the Vercel deployment entirely: a function lives for one request
  and cannot hold a loop. So a deployment whose routes are functions still needs
  this process running somewhere, and `backend/README.md` says where.
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
