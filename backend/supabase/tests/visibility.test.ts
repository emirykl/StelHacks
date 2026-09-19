import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  backend,
  remove,
  signUp,
  someAddress,
  someContract,
  visitor,
  type TestUser,
} from "./roles.js";

/**
 * Who can see a gallery.
 *
 * The visibility setting is the one promise in the product that Supabase, not
 * the chain, has to keep. Everything else about a hackathon is public by
 * design: the rules, the ranking, every payment. What a closed event holds back
 * is the projects themselves, and there is nothing on chain enforcing that,
 * because the write ups never reach the chain. So it is enforced here, and
 * proved here, by asking each kind of visitor what they can actually read.
 */

/** The three settings, as the contract numbers them. */
const PUBLIC = 0;
const PARTICIPANTS = 1;
const RESTRICTED = 2;

interface Event {
  contract: string;
  team: number;
  title: string;
}

/**
 * A hackathon with one project in it, published at the given visibility.
 *
 * `state` is written the way the indexer writes it, because that is the only
 * way it is ever written; there is no client path to it and the tests below
 * check that too.
 */
async function publish(visibility: number | null, participant?: string): Promise<Event> {
  const contract = someContract();
  const title = `project-${contract.slice(1, 9)}`;
  const admin = backend();

  await seed(
    admin.from("hackathons").insert({
      contract_id: contract,
      slug: `event-${contract.slice(1, 9).toLowerCase()}`,
      name: "A hackathon",
    }),
  );

  if (visibility !== null) {
    await seed(
      admin.from("hackathon_state").insert({
        contract_id: contract,
        organizer: someAddress(),
        constitution_hash: "\\x00",
        phase: 2,
        visibility,
        observed_at_ledger: 1,
      }),
    );
  }

  await seed(admin.from("teams").insert({ contract_id: contract, team_id: 1, name: "A team" }));
  await seed(admin.from("projects").insert({ contract_id: contract, team_id: 1, title }));

  if (participant !== undefined) {
    await seed(
      admin
        .from("participants")
        .insert({ contract_id: contract, address: participant, approved_at_ledger: 1 }),
    );
  }

  return { contract, team: 1, title };
}

/**
 * Fails the run when a fixture does not land.
 *
 * Without this a setup that quietly did nothing reads as a policy correctly
 * hiding a row, and the suite reports a passing refusal it never actually
 * tested. That is the worst way for a security test to be wrong.
 */
async function seed(insert: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await insert;

  if (error !== null) {
    throw new Error(`could not set the fixture up: ${error.message}`);
  }
}

async function unpublish(event: Event): Promise<void> {
  await backend().from("hackathons").delete().eq("contract_id", event.contract);
  await backend().from("hackathon_state").delete().eq("contract_id", event.contract);
  await backend().from("participants").delete().eq("contract_id", event.contract);
  await backend().from("teams").delete().eq("contract_id", event.contract);
}

let insider: TestUser;
let outsider: TestUser;
let insiderAddress: string;
const events: Event[] = [];

beforeAll(async () => {
  insider = await signUp();
  outsider = await signUp();

  // The address is bound the way the verifier binds it, after a signature it
  // has already checked. No client can do this, which is what makes holding an
  // address mean something.
  insiderAddress = someAddress();
  await backend()
    .from("wallet_links")
    .insert({ address: insiderAddress, profile_id: insider.id });
});

afterAll(async () => {
  for (const event of events) {
    await unpublish(event);
  }
  await remove(insider);
  await remove(outsider);
});

async function track(event: Event): Promise<Event> {
  events.push(event);

  return event;
}

describe("a public gallery", () => {
  it("is readable by somebody with no account at all", async () => {
    const event = await track(await publish(PUBLIC));

    const { data } = await visitor()
      .from("projects")
      .select("title")
      .eq("contract_id", event.contract);

    expect(data).toHaveLength(1);
    expect(data![0]!.title).toBe(event.title);
  });
});

describe("a gallery open to participants only", () => {
  it("is readable by somebody approved into the event", async () => {
    const event = await track(await publish(PARTICIPANTS, insiderAddress));

    const { data } = await insider.client
      .from("projects")
      .select("title")
      .eq("contract_id", event.contract);

    expect(data).toHaveLength(1);
  });

  it("is closed to a signed out visitor", async () => {
    const event = await track(await publish(PARTICIPANTS, insiderAddress));

    const { data, error } = await visitor()
      .from("projects")
      .select("title")
      .eq("contract_id", event.contract);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  /**
   * Signing in is not the same as being let in. An account alone would make the
   * setting mean nothing, since anybody can make one.
   */
  it("is closed to somebody signed in who was never approved", async () => {
    const event = await track(await publish(PARTICIPANTS, insiderAddress));

    const { data } = await outsider.client
      .from("projects")
      .select("title")
      .eq("contract_id", event.contract);

    expect(data).toHaveLength(0);
  });

  /**
   * Being approved into one event says nothing about another. Without this the
   * first closed hackathon anybody joined would open every other one.
   */
  it("is closed to a participant of a different event", async () => {
    const theirs = await track(await publish(PARTICIPANTS, insiderAddress));
    const other = await track(await publish(PARTICIPANTS, someAddress()));

    const mine = await insider.client
      .from("projects")
      .select("title")
      .eq("contract_id", theirs.contract);
    const notMine = await insider.client
      .from("projects")
      .select("title")
      .eq("contract_id", other.contract);

    expect(mine.data).toHaveLength(1);
    expect(notMine.data).toHaveLength(0);
  });
});

describe("a restricted gallery", () => {
  it("is closed to everybody who comes through the public API", async () => {
    const event = await track(await publish(RESTRICTED, insiderAddress));

    const asVisitor = await visitor()
      .from("projects")
      .select("title")
      .eq("contract_id", event.contract);
    const asParticipant = await insider.client
      .from("projects")
      .select("title")
      .eq("contract_id", event.contract);

    expect(asVisitor.data).toHaveLength(0);
    expect(asParticipant.data).toHaveLength(0);
  });
});

describe("an event the indexer has not reached yet", () => {
  /**
   * Failing closed is the only safe direction. A gallery that was open until
   * the indexer got round to publishing its setting would leak exactly the
   * events that were configured to be private, in the window nobody is
   * watching.
   */
  it("shows its projects to nobody", async () => {
    const event = await track(await publish(null, insiderAddress));

    const asVisitor = await visitor()
      .from("projects")
      .select("title")
      .eq("contract_id", event.contract);
    const asParticipant = await insider.client
      .from("projects")
      .select("title")
      .eq("contract_id", event.contract);

    expect(asVisitor.data).toHaveLength(0);
    expect(asParticipant.data).toHaveLength(0);
  });
});

describe("what stays public whatever the gallery says", () => {
  /**
   * A closed hackathon still produces a receipt a stranger can verify. They
   * simply cannot read what the projects were.
   */
  it("shows the event, its chain state and its teams to anyone", async () => {
    const event = await track(await publish(RESTRICTED, insiderAddress));
    const anyone = visitor();

    const hackathon = await anyone
      .from("hackathons")
      .select("name")
      .eq("contract_id", event.contract);
    const state = await anyone
      .from("hackathon_state")
      .select("phase, visibility")
      .eq("contract_id", event.contract);
    const teams = await anyone.from("teams").select("name").eq("contract_id", event.contract);

    expect(hackathon.data).toHaveLength(1);
    expect(state.data).toHaveLength(1);
    expect(teams.data).toHaveLength(1);
  });
});

describe("the derived tables", () => {
  /**
   * These have to be droppable and rebuildable by replaying events from ledger
   * zero. A row somebody typed in could not be regenerated, and would quietly
   * become authoritative over the chain it was supposed to mirror.
   */
  it("refuse a write from a signed out visitor", async () => {
    const contract = someContract();

    const state = await visitor().from("hackathon_state").insert({
      contract_id: contract,
      organizer: someAddress(),
      constitution_hash: "\\x00",
      phase: 0,
      visibility: PUBLIC,
      observed_at_ledger: 1,
    });
    const guest = await visitor()
      .from("participants")
      .insert({ contract_id: contract, address: someAddress(), approved_at_ledger: 1 });

    expect(state.error?.code).toBe("42501");
    expect(guest.error?.code).toBe("42501");
  });

  it("refuse a write from somebody signed in", async () => {
    const event = await track(await publish(PARTICIPANTS, insiderAddress));

    // The most direct attack there is: add yourself to the guest list of a
    // closed event and read the gallery.
    const { error } = await outsider.client
      .from("participants")
      .insert({ contract_id: event.contract, address: someAddress(), approved_at_ledger: 1 });

    expect(error?.code).toBe("42501");

    const { data } = await outsider.client
      .from("projects")
      .select("title")
      .eq("contract_id", event.contract);
    expect(data).toHaveLength(0);
  });

  /**
   * Opening a closed gallery by rewriting its visibility would be the same
   * attack one table over.
   */
  it("refuse a visibility change from somebody signed in", async () => {
    const event = await track(await publish(RESTRICTED, insiderAddress));

    const { error } = await insider.client
      .from("hackathon_state")
      .update({ visibility: PUBLIC })
      .eq("contract_id", event.contract);

    expect(error?.code).toBe("42501");
  });
});

describe("what a client cannot write yet", () => {
  /**
   * The write paths are not built. Until they are, the absence of a policy is
   * what refuses them, and that is worth pinning down: a table left writable by
   * accident looks exactly like one nobody has got to yet.
   */
  it("refuses an event, a team and a project from a signed in client", async () => {
    const contract = someContract();

    const event = await insider.client
      .from("hackathons")
      .insert({ contract_id: contract, slug: "mine", name: "Mine" });
    const team = await insider.client
      .from("teams")
      .insert({ contract_id: contract, team_id: 1, name: "Mine" });
    const project = await insider.client
      .from("projects")
      .insert({ contract_id: contract, team_id: 1, title: "Mine" });

    expect(event.error?.code).toBe("42501");
    expect(team.error?.code).toBe("42501");
    expect(project.error?.code).toBe("42501");
  });
});
