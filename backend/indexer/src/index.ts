import { settings } from "./config.js";
import { advanceTo, resumeFrom, rewind } from "./cursor.js";
import { decode } from "./decode.js";
import { read, replayable, store } from "./ingest.js";
import { project } from "./project.js";
import { apply, discard } from "./write.js";

/**
 * Soroban events into Postgres, and nothing else.
 *
 * The shape of one pass is the whole design. Read a range from the chain, write
 * the log, move the cursor, then rebuild the projections from the log. The
 * projections are rebuilt from the log rather than from the range that just
 * arrived, which is slower and is the point: it means the rows in the database
 * are always exactly what the log says, never the accumulated result of every
 * pass that happened to run.
 *
 *   indexer <contract id>            follow it, forever
 *   indexer <contract id> --once     one pass, then stop
 *   indexer <contract id> --rebuild  throw the projections away and rebuild
 */

async function pass(contract: string): Promise<number> {
  const from = await resumeFrom(contract);
  const found = await read(contract, from);

  await store(contract, found);

  // The cursor moves only after the rows it covers have landed. Ahead of them
  // it would skip a range on the next restart, and a skipped range is a gap no
  // later pass would think to look for.
  await advanceTo(contract, found.through);

  const log = await replayable(contract);
  await apply(project(decode(log.events), log.reads));

  return found.events.length;
}

async function rebuild(contract: string): Promise<void> {
  console.log(`rebuilding ${contract} from the log`);

  await discard(contract);
  await rewind(contract);

  const log = await replayable(contract);
  await apply(project(decode(log.events), log.reads));

  console.log(`rebuilt from ${log.events.length} events and ${log.reads.length} reads`);
}

async function follow(contract: string): Promise<never> {
  for (;;) {
    const found = await pass(contract);

    if (found === 0) {
      await new Promise((wake) => setTimeout(wake, settings.idleMs));
    }
  }
}

const [contract, mode] = process.argv.slice(2);

if (contract === undefined) {
  console.error("usage: indexer <contract id> [--once|--rebuild]");
  process.exit(1);
}

if (mode === "--rebuild") {
  await rebuild(contract);
} else if (mode === "--once") {
  const found = await pass(contract);
  console.log(`ingested ${found} events`);
} else {
  await follow(contract);
}
