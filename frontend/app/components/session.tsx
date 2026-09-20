"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "./primitives";
import { browserClient } from "../../lib/supabase/client";

/**
 * Ending a session.
 *
 * An email address is identity and nothing else here. It says which person is
 * reading the page; it never says which address they hold, and it can never
 * move money. The two are deliberately different layers, and an account with no
 * wallet attached to it can still do exactly nothing on chain.
 *
 * Starting one lives in `oauth.tsx` and nowhere else. A one time code to an
 * inbox used to sit here as well, so there were two ways in and this was the
 * only screen in the product asking somebody to choose between them. The
 * provider hands over the same thing the typed address did, which is a name.
 */

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

  /* Red, here and in the header menu and nowhere else it is not this. Leaving
     is the one thing on an account page somebody can do by accident, and a
     control that looks like every other control is one they will. */
  return (
    <Button intent="danger" onClick={() => void go()} disabled={going}>
      {going ? "Signing out" : "Sign out"}
    </Button>
  );
}
