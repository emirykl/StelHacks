/**
 * Both long lived services, under one command.
 *
 * The frontend is one `npm run dev` and the backend was two, in two places,
 * one of which needed an argument nobody remembers. That asymmetry is the whole
 * reason this file exists: a stack you have to be told how to start is a stack
 * that gets started wrong.
 *
 * It supervises rather than daemonises. Output stays interleaved on the
 * terminal with a tag per line so a failure says which half failed, and killing
 * this kills both, because two orphaned services are worse than none.
 *
 *   cd backend && npm run dev
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const root = new URL(".", import.meta.url).pathname;

/**
 * Which hackathon the indexer follows, when somebody wants only one.
 *
 * It used to be required, because the indexer took one contract and there was
 * no way to name several. It follows every hackathon in the database now, so
 * this narrows rather than enables: set it while working on a single event and
 * leave it empty the rest of the time.
 */
const contract = watched();

function watched() {
  if (process.env["WATCH_CONTRACT"] !== undefined) {
    return process.env["WATCH_CONTRACT"];
  }

  try {
    const found = readFileSync(`${root}.env.local`, "utf8")
      .split("\n")
      .find((line) => line.trimStart().startsWith("WATCH_CONTRACT="));

    return found?.split("=")[1]?.trim().replace(/^"|"$/g, "") ?? null;
  } catch {
    return null;
  }
}

console.log(
  contract === null || contract === ""
    ? "indexer: following every hackathon in the database"
    : `indexer: following ${contract} only, because WATCH_CONTRACT names it`,
);

const services = [
  {
    name: "indexer",
    args:
      contract === null || contract === ""
        ? ["start", "--prefix", "indexer"]
        : ["start", "--prefix", "indexer", "--", contract],
  },
  { name: "sealer", args: ["start", "--prefix", "sealer"] },
];

const running = services.map(({ name, args }) => {
  const child = spawn("npm", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });

  const tag = (stream) => (chunk) => {
    for (const line of String(chunk).split("\n")) {
      if (line.trim().length > 0) {
        stream.write(`${name.padEnd(7)} │ ${line}\n`);
      }
    }
  };

  child.stdout.on("data", tag(process.stdout));
  child.stderr.on("data", tag(process.stderr));

  /* One dead service is a broken stack, not a degraded one: a page that reads a
     phase from a database nothing is writing is worse than a page that is
     plainly down. So the first exit takes the rest with it. */
  child.on("exit", (code) => {
    console.error(`\n${name} exited (${code}). Stopping the rest.`);
    stop();
    process.exit(code ?? 1);
  });

  return child;
});

function stop() {
  for (const child of running) {
    child.kill("SIGTERM");
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stop();
    process.exit(0);
  });
}

console.log(`indexer following ${contract}`);
console.log("sealer on its configured port\n");
