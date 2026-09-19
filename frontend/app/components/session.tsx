"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "./primitives";
import { browserClient } from "../../lib/supabase/client";

/**
 * Starting and ending a session.
 *
 * Google is identity and nothing else here. It says which person is reading the
 * page; it never says which address they hold, and it can never move money. The
 * two are deliberately different layers, and a Google account with no wallet
 * attached to it can still do exactly nothing on chain.
 */

export function SignIn({ next = "/account" }: { next?: string }) {
  const [going, setGoing] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  async function go() {
    const db = browserClient();

    if (db === null) {
      setRefused("Sign in is not configured on this deployment.");
      return;
    }

    setGoing(true);

    const { error } = await db.auth.signInWithOAuth({
      provider: "google",
      options: {
        /* Built from where the page is actually running rather than from a
           configured base URL, so a preview deployment sends people back to
           the preview and not to production. */
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error !== null) {
      setGoing(false);
      setRefused(error.message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={() => void go()} disabled={going} className="self-start">
        {going ? "Taking you to Google" : "Continue with Google"}
      </Button>

      {refused !== null && (
        <p className="text-[0.875rem] text-broken">{refused}</p>
      )}
    </div>
  );
}

export function SignOut() {
  const router = useRouter();
  const [going, setGoing] = useState(false);

  async function go() {
    const db = browserClient();

    if (db === null) {
      return;
    }

    setGoing(true);
    await db.auth.signOut();

    /* Refresh rather than push. Every server component on the page read the
       session while rendering, so the page has to be asked again rather than
       navigated to. */
    router.refresh();
    setGoing(false);
  }

  return (
    <Button intent="ghost" size="sm" onClick={() => void go()} disabled={going}>
      {going ? "Signing out" : "Sign out"}
    </Button>
  );
}
