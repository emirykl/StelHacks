"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "./primitives";
import { CommitButton } from "./commit-button";
import { Swap } from "./motion";
import { browserClient } from "../../lib/supabase/client";

/**
 * Starting and ending a session.
 *
 * An email address is identity and nothing else here. It says which person is
 * reading the page; it never says which address they hold, and it can never
 * move money. The two are deliberately different layers, and an account with no
 * wallet attached to it can still do exactly nothing on chain.
 *
 * Sign in used to go through Google, which meant a person could only get in if
 * they had a Google account and we could only offer it after registering an
 * OAuth client with a third party. A one time code sent to whatever address
 * somebody already reads costs neither, and it is the same proof of control
 * either way: a message arrives somewhere only they can open.
 *
 * The code is checked in this tab rather than followed as a link. A magic link
 * opens wherever the mail client decides, which on a phone is a browser that is
 * not the one holding the half filled form, and the flow ends with somebody
 * signed in on the wrong screen. Six digits typed back into the tab they
 * started in end where they began. The link still works for anybody who
 * prefers it; `app/auth/callback` accepts both.
 */

/** Supabase refuses a second send inside a minute, so the button says so. */
const RESEND_AFTER = 60;

export function SignIn({ next = "/account" }: { next?: string }) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  /* Focused on arrival at the second step, because the only thing to do there
     is type six digits and asking somebody to click the field first is asking
     for nothing. */
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) {
      return;
    }

    const tick = setTimeout(() => setWait(wait - 1), 1_000);

    return () => clearTimeout(tick);
  }, [wait]);

  async function send() {
    const db = browserClient();

    if (db === null) {
      setRefused("Sign in is not configured on this deployment.");
      return;
    }

    setBusy(true);
    setRefused(null);

    const { error } = await db.auth.signInWithOtp({
      email,
      options: {
        /* First sign in and every one after it are the same gesture. Nobody has
           anything to register beforehand, so a separate sign up step would be
           a form asking for a password nothing on this site would ever use. */
        shouldCreateUser: true,
        /* Built from where the page is actually running rather than from a
           configured base URL, so a preview deployment sends people back to the
           preview and not to production. Only used by whoever follows the link
           instead of typing the code. */
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setBusy(false);

    if (error !== null) {
      setRefused(error.message);
      return;
    }

    setSent(true);
    setWait(RESEND_AFTER);
    setTimeout(() => box.current?.focus(), 220);
  }

  async function verify() {
    const db = browserClient();

    if (db === null) {
      return;
    }

    setBusy(true);
    setRefused(null);

    const { error } = await db.auth.verifyOtp({ email, token: code, type: "email" });

    if (error !== null) {
      setBusy(false);
      setCode("");
      setRefused(error.message);
      box.current?.focus();
      return;
    }

    /* Refresh before navigating. Every server component on the page read the
       session while rendering, so the page has to be asked again rather than
       only navigated to. */
    router.refresh();
    router.push(next);
  }

  return (
    <div className="max-w-[26rem]">
      <Swap step={sent ? "code" : "address"}>
        {sent ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void verify();
            }}
            className="grid gap-4"
          >
            <label className="grid gap-1.5">
              <span className="label text-ink-faint">Code sent to {email}</span>

              <input
                ref={box}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                aria-label="The six digit code from your email"
                className="tabular h-12 bg-paper px-4 text-[1.25rem] tracking-[0.35em] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <CommitButton type="submit" disabled={busy || code.length < 6}>
                {busy ? "Checking" : "Sign in"}
              </CommitButton>

              <Button
                type="button"
                intent="ghost"
                size="sm"
                disabled={busy || wait > 0}
                onClick={() => void send()}
              >
                {wait > 0 ? `Send again in ${wait}s` : "Send again"}
              </Button>

              <Button
                type="button"
                intent="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setSent(false);
                  setCode("");
                  setRefused(null);
                }}
              >
                Different address
              </Button>
            </div>

            <Refusal message={refused} />
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="grid gap-4"
          >
            <label className="grid gap-1.5">
              <span className="label text-ink-faint">Email address</span>

              <input
                value={email}
                onChange={(event) => setEmail(event.target.value.trim())}
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="h-12 bg-paper px-4 text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
              />
            </label>

            <div className="justify-self-start">
              <CommitButton type="submit" disabled={busy || email.length === 0}>
                {busy ? "Sending a code" : "Send me a code"}
              </CommitButton>
            </div>

            <Refusal message={refused} />
          </form>
        )}
      </Swap>
    </div>
  );
}

/** Whatever went wrong, said where the thing that failed is. */
function Refusal({ message }: { message: string | null }) {
  if (message === null) {
    return null;
  }

  return <p className="text-[0.875rem] text-broken">{message}</p>;
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
