import { NextResponse } from "next/server";

import { serverClient } from "../../../lib/supabase/server";

/**
 * Where Google sends somebody back to.
 *
 * Supabase hands back a short lived code rather than a session. This exchanges
 * it for one, which writes the session cookies, and then sends the person on to
 * wherever they were going.
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/account";

  /*
    `next` decides where somebody lands after signing in, and it arrives in a
    URL anybody can write. Without this check a link could carry
    `next=https://somewhere.else` and this route would bounce a freshly signed
    in person straight off the site, which is how a convincing phishing page
    gets its first visitor. Only a path on this site is allowed.
  */
  const destination = next.startsWith("/") && !next.startsWith("//") ? next : "/account";

  if (code === null) {
    return NextResponse.redirect(new URL("/account?signin=refused", url.origin));
  }

  const db = await serverClient();

  if (db === null) {
    return NextResponse.redirect(new URL("/account?signin=unavailable", url.origin));
  }

  const { error } = await db.auth.exchangeCodeForSession(code);

  if (error !== null) {
    return NextResponse.redirect(new URL("/account?signin=failed", url.origin));
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
