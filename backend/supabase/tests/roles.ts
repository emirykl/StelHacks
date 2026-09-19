import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: new URL("../../.env.local", import.meta.url).pathname, quiet: true });

/**
 * The three ways somebody reaches this database, set up the way they really
 * reach it.
 *
 * These tests go over HTTP through PostgREST rather than into Postgres
 * directly, because that is the surface the product actually exposes. A policy
 * can be right in the database and wrong through the API, and the API is where
 * a browser is.
 */

const url = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");

function required(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === "") {
    throw new Error(
      `${name} is not set. Copy backend/.env.example to backend/.env.local and ` +
        "fill it in; these tests run against the linked Supabase project.",
    );
  }

  return value;
}

/** A signed out visitor. Every public page is served to this client. */
export function visitor(): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

/**
 * The verifier and the indexer. It bypasses row level security entirely, which
 * is why the tests below spend most of their time proving nobody else can do
 * what it can.
 */
export function backend(): SupabaseClient {
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

/**
 * Somebody signed in, created and torn down around a test.
 *
 * Real users in the real project, because a fake session would only prove that
 * the fake session was filtered. They are removed again in `remove`, and every
 * address they touch is namespaced, so a run that dies half way leaves
 * something obviously disposable rather than something that looks real.
 */
export async function signUp(): Promise<TestUser> {
  const admin = backend();
  const email = `rls-test-${randomUUID()}@example.invalid`;
  const password = randomUUID();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error !== null || data.user === null) {
    throw new Error(`could not create a test user: ${error?.message}`);
  }

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });

  if (signIn.error !== null) {
    throw new Error(`could not sign the test user in: ${signIn.error.message}`);
  }

  return { id: data.user.id, email, client };
}

export async function remove(user: TestUser): Promise<void> {
  await backend().auth.admin.deleteUser(user.id);
}

/** A syntactically real Stellar address, distinct per call. */
export function someAddress(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let body = "";

  for (let index = 0; index < 55; index += 1) {
    body += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return `G${body}`;
}
