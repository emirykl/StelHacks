import { settings } from "./config.js";
import { db } from "./supabase.js";
import { explain, fellOffTheWindow } from "./errors.js";
import { advanceTo, resumeFrom, rewind } from "./cursor.js";
import { decode } from "./decode.js";
import { health } from "./health.js";
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
 *   indexer                          follow every hackathon, forever
 *   indexer <contract id>            follow one, forever
 *   indexer <contract id> --once     one pass, then stop
 *   indexer <contract id> --rebuild  throw the projections away and rebuild
 *
 * Called with nothing, the list is the `hackathons` table rather than a setting.
 * It was one contract named in the environment, which is fine while there is
 * one and wrong the moment there are two: the second hackathon somebody creates
 * has a real deadline read from the chain and no phase read from here, so the
 * product shows it as never published. Naming the source of truth instead means
 * a hackathon created in the browser is followed without anybody editing a file
 * and restarting anything.
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

/**
 * Every hackathon the product knows about.
 *
 * Read fresh on each round rather than once at startup, so an event created
 * while this is running is picked up on the next lap instead of at the next
 * restart. That is the whole reason it reads a table and not a variable.
 */
async function watching(): Promise<string[]> {
  const { data, error } = await db.from("hackathons").select("contract_id");

  if (error !== null) {
    console.error(`could not read the hackathons to follow: ${error.message}`);

    return [];
  }

  return (data ?? []).map((row) => String(row.contract_id));
}

async function follow(only: string | undefined): Promise<never> {
  for (;;) {
    const contracts = only === undefined ? await watching() : [only];
    let ingested = 0;

    for (const contract of contracts) {
      try {
        const found = await pass(contract);
        const behind = await health(contract);

        ingested += found;

        if (behind.strandedBehindRetention) {
          // Saying this every pass is deliberate. It is the one condition
          // running longer does not fix, and an indexer that quietly kept up
          // from a point past the gap would look healthy while missing
          // everything before it.
          console.error(
            `${contract}: stranded at ${behind.cursor}, older than anything RPC still serves`,
          );
        }

        if (found > 0 || behind.lag > 0) {
          console.log(`${contract}: ingested ${found}, ${behind.lag} behind ${behind.latest}`);
        }
      } catch (thrown) {
        /*
          One contract's failure is not the others'.

          A hackathon whose events RPC has aged out would otherwise stop the
          loop and with it every event still arriving for every other
          hackathon. It is reported and skipped, and the next lap tries it
          again.
        */
        console.error(
          `${contract}: ${
            fellOffTheWindow(thrown)
              ? "stranded, its events are older than anything RPC still serves"
              : explain(thrown)
          }`,
        );
      }
    }

    if (contracts.length === 0) {
      console.log("no hackathons to follow yet");
    }

    if (ingested === 0) {
      await new Promise((wake) => setTimeout(wake, settings.idleMs));
    }
  }
}

const [contract, mode] = process.argv.slice(2);

/* The two maintenance modes still take one contract, because both are things
   somebody does to a particular hackathon after looking at it. Following is the
   one that wants the whole list. */
if (mode === "--rebuild" || mode === "--once") {
  if (contract === undefined) {
    console.error("usage: indexer <contract id> [--once|--rebuild]");
    process.exit(1);
  }

  if (mode === "--rebuild") {
    await rebuild(contract);
  } else {
    const found = await pass(contract);
    const behind = await health(contract);

    console.log(`ingested ${found} events, ${behind.lag} ledgers behind ${behind.latest}`);
  }
} else {
  await follow(contract);
}
