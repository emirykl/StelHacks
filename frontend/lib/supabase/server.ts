import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

/**
 * The database, as the person reading the page.
 *
 * Sessions live in cookies rather than in browser storage, so a server
 * component can render "signed in as" without the page flashing signed out
 * first, and a route handler can tell who is asking without the client sending
 * it a token to be trusted with.
 *
 * This still uses the anonymous key. A session does not raise what the key can
 * reach; it tells Postgres which row `auth.uid()` returns, and every policy in
 * the schema decides the rest. Nothing here can read anything a policy has not
 * already allowed.
 */

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const key = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

/** Whether sign in is wired up at all, which decides whether we offer it. */
export function authConfigured(): boolean {
  return url !== undefined && key !== undefined;
}

export async function serverClient() {
  if (url === undefined || key === undefined) {
    return null;
  }

  const jar = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (written) => {
        try {
          for (const { name, value, options } of written) {
            jar.set(name, value, options);
          }
        } catch {
          /*
            A server component cannot write cookies, and a refreshed token
            arriving during a render lands here.

            Swallowing it is correct rather than lazy: the refresh is retried by
            whatever middleware or route handler serves the next request, which
            can write. Letting it throw would fail a page render over a token
            that is about to be renewed anyway.
          */
        }
      },
    },
  });
}

/**
 * Who is reading this page, or nobody. One answer per request.
 *
 * Cached because the layout and the page both ask, and they were asking
 * separately. Each call is a round trip to the auth server, and around an
 * expiring token the two can disagree: the first triggers a refresh whose new
 * cookie a server component is not allowed to write, so the second arrives with
 * a token that has already been spent and is told no. The page then rendered a
 * form for somebody the header was showing a sign in button to.
 *
 * `cache` is per request and nothing survives it, so this is deduplication
 * rather than a session cached across visitors.
 */
export const currentUser = cache(async () => {
  const db = await serverClient();

  if (db === null) {
    return null;
  }

  /*
    `getUser` rather than `getSession`. The session is read straight out of a
    cookie and a cookie is whatever the browser sent; `getUser` asks the auth
    server whether the token in it is real. On a page that will eventually
    decide who may run a hackathon, that difference is the whole point.
  */
  const { data } = await db.auth.getUser();

  return data.user;
});
