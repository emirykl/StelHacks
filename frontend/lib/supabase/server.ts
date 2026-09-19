import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

/** Who is reading this page, or nobody. */
export async function currentUser() {
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
}
