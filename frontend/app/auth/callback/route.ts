import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { serverClient } from "../../../lib/supabase/server";

/**
 * Where the link in a sign in email lands.
 *
 * Most people never reach this route. The sign in form asks for the six digit
 * code and checks it in the tab they started in, which is the flow that works
 * on a phone where the mail app opens a different browser. This is here for
 * whoever clicks the link in the message instead.
 *
 * Two shapes arrive, because which one Supabase sends depends on the email
 * template the project is using, and a route that only understood one would
 * break silently the day somebody edited a template in a dashboard.
 *
 *   `code`       the project's own verify endpoint already checked the link and
 *                handed back something to exchange for a session.
 *   `token_hash` the link came through untouched and this route is what checks
 *                it, which is the shape the current templates default to.
 *
 * Either way the session cookies are written here and the person is sent on to
 * wherever they were going.
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const hash = url.searchParams.get("token_hash");
  const kind = url.searchParams.get("type");
  const next = url.searchParams.get("next") ?? "/account";

  /*
    `next` decides where somebody lands after signing in, and it arrives in a
    URL anybody can write. Without this check a link could carry
    `next=https://somewhere.else` and this route would bounce a freshly signed
    in person straight off the site, which is how a convincing phishing page
    gets its first visitor. Only a path on this site is allowed.
  */
  const destination = next.startsWith("/") && !next.startsWith("//") ? next : "/account";

  if (code === null && hash === null) {
    return NextResponse.redirect(new URL("/account?signin=refused", url.origin));
  }

  const db = await serverClient();

  if (db === null) {
    return NextResponse.redirect(new URL("/account?signin=unavailable", url.origin));
  }

  const { error } =
    code !== null
      ? await db.auth.exchangeCodeForSession(code)
      : await db.auth.verifyOtp({
          token_hash: hash as string,
          /* A link that arrives without saying what it is is treated as an
             ordinary email sign in, which is the only kind this product
             sends. */
          type: (kind ?? "email") as EmailOtpType,
        });

  if (error !== null) {
    return NextResponse.redirect(new URL("/account?signin=failed", url.origin));
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
