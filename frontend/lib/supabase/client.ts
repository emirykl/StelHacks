"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * The same database, from the browser.
 *
 * Its one job is starting and ending a session. Reading is done on the server,
 * where a page can render what it found rather than a spinner that turns into
 * content, so nothing else should reach for this.
 */

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const key = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

export function browserClient() {
  if (url === undefined || key === undefined) {
    return null;
  }

  return createBrowserClient(url, key);
}
