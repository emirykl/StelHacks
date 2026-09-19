import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { backend, remove, signUp, someAddress, visitor, type TestUser } from "./roles.js";

/**
 * What each role can actually reach.
 *
 * Row level security is the kind of thing that looks right in a policy and is
 * wrong in practice, because the interesting cases are the ones nobody thought
 * to write a policy for. So each role is taken in turn and asked to do what it
 * must not be able to do, and the passing condition is a refusal.
 *
 * Two shapes of refusal appear and they mean different things. A `42501` is the
 * grant refusing: the role cannot touch that table or column at all. An empty
 * result with no error is the policy refusing: the role may touch the table,
 * and no row was visible to it. Both are correct, and which one applies says
 * which of the two layers is doing the work.
 */

let ada: TestUser;
let grace: TestUser;

beforeAll(async () => {
  ada = await signUp();
  grace = await signUp();
});

afterAll(async () => {
  await remove(ada);
  await remove(grace);
});

describe("signing up", () => {
  it("leaves a profile behind, so no page has to handle a session without one", async () => {
    const { data, error } = await ada.client.from("profiles").select("id, username").eq("id", ada.id);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]!.username).toMatch(/^user_[0-9a-f]{12}$/);
  });

  it("does not collide when two people sign up in the same moment", async () => {
    const { data } = await backend()
      .from("profiles")
      .select("username")
      .in("id", [ada.id, grace.id]);

    expect(new Set(data!.map((row) => row.username)).size).toBe(2);
  });
});

describe("a signed out visitor", () => {
  it("reads every profile, because a builder page is public", async () => {
    const { data, error } = await visitor().from("profiles").select("id").in("id", [ada.id, grace.id]);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it("reads the wallet links table", async () => {
    const { error } = await visitor().from("wallet_links").select("address").limit(1);

    expect(error).toBeNull();
  });

  /**
   * A challenge somebody else can read is a challenge somebody else can answer,
   * which would make the whole signature exchange pointless.
   */
  it("cannot read a challenge", async () => {
    const { error } = await visitor().from("wallet_challenges").select("*");

    expect(error?.code).toBe("42501");
  });

  it("cannot write a profile at all", async () => {
    const { error } = await visitor().from("profiles").update({ bio: "not mine" }).eq("id", ada.id);

    expect(error?.code).toBe("42501");
  });

  it("cannot claim an address", async () => {
    const { error } = await visitor()
      .from("wallet_links")
      .insert({ address: someAddress(), profile_id: ada.id });

    expect(error?.code).toBe("42501");
  });
});

describe("somebody signed in", () => {
  it("edits their own profile", async () => {
    const { error } = await ada.client
      .from("profiles")
      .update({ bio: "builds payment rails" })
      .eq("id", ada.id);

    expect(error).toBeNull();

    const { data } = await backend().from("profiles").select("bio").eq("id", ada.id).single();
    expect(data!.bio).toBe("builds payment rails");
  });

  /**
   * The grant lets the statement through and the policy finds no row, which is
   * why this is silence rather than an error. Checking the row afterwards is
   * the part that matters: a test that only looked at the error would pass
   * against a policy that did nothing.
   */
  it("changes nothing when it edits somebody else", async () => {
    const { error } = await ada.client
      .from("profiles")
      .update({ bio: "hijacked" })
      .eq("id", grace.id);

    expect(error).toBeNull();

    const { data } = await backend().from("profiles").select("bio").eq("id", grace.id).single();
    expect(data!.bio).toBeNull();
  });

  it("cannot reach a column nobody granted, whatever the policy says", async () => {
    const { error } = await ada.client.from("profiles").update({ id: grace.id }).eq("id", ada.id);

    expect(error?.code).toBe("42501");
  });

  it("is held to the published shape of a username", async () => {
    const { error } = await ada.client.from("profiles").update({ username: "Ada" }).eq("id", ada.id);

    expect(error?.code).toBe("23514");
  });

  /**
   * The claim that matters most in this file. A client able to write here could
   * say it holds any address, and every earnings total and profile page in the
   * product reads this table.
   */
  it("cannot claim an address without proving they hold it", async () => {
    const { error } = await ada.client
      .from("wallet_links")
      .insert({ address: someAddress(), profile_id: ada.id });

    expect(error?.code).toBe("42501");
  });

  it("cannot read their own challenge either", async () => {
    const { error } = await ada.client.from("wallet_challenges").select("*");

    expect(error?.code).toBe("42501");
  });

  it("cannot issue a challenge to themselves", async () => {
    const { error } = await ada.client.from("wallet_challenges").insert({
      profile_id: ada.id,
      address: someAddress(),
      nonce: "mine",
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    });

    expect(error?.code).toBe("42501");
  });

  it("cannot create a profile without a user behind it", async () => {
    const { error } = await ada.client
      .from("profiles")
      .insert({ id: crypto.randomUUID(), username: "ghost" });

    expect(error?.code).toBe("42501");
  });

  /**
   * A profile referenced by a past hackathon is part of a record that is
   * supposed to outlive the wish to remove it.
   */
  it("cannot delete a profile", async () => {
    const { error } = await ada.client.from("profiles").delete().eq("id", ada.id);

    expect(error?.code).toBe("42501");

    const { data } = await backend().from("profiles").select("id").eq("id", ada.id);
    expect(data).toHaveLength(1);
  });
});

describe("the verifier", () => {
  const address = someAddress();

  it("writes the link once the signature checks out", async () => {
    const { error } = await backend().from("wallet_links").insert({ address, profile_id: ada.id });

    expect(error).toBeNull();
  });

  it("cannot write something that is not an address, even so", async () => {
    const { error } = await backend()
      .from("wallet_links")
      .insert({ address: "not-a-stellar-address", profile_id: ada.id });

    expect(error?.code).toBe("23514");
  });

  it("leaves one address, claimed once, by the only writer allowed to claim it", async () => {
    const { data } = await visitor().from("wallet_links").select("address").eq("address", address);

    expect(data).toHaveLength(1);
  });
});
