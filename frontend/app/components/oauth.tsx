"use client";

import { useState } from "react";

import { PROVIDER_NAMES, type Provider } from "../../lib/providers";
import { browserClient } from "../../lib/supabase/client";

/**
 * The other ways in.
 *
 * Same layer as the email code and no more powerful: whichever of these
 * somebody uses, what arrives is an address and a session. None of them can
 * sign anything on chain, and a wallet still has to be attached afterwards. A
 * Google account here buys exactly what a Gmail address typed into the box
 * above buys, which is a name.
 *
 * The marks are drawn rather than fetched. Every provider publishes an SVG on a
 * CDN and using one would make this page ask a third party for an image before
 * anybody has agreed to anything, and tell them about it in the network tab.
 */

export function OAuthButtons({
  providers,
  next = "/account",
}: {
  providers: Provider[];
  next?: string;
}) {
  const [going, setGoing] = useState<Provider | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  if (providers.length === 0) {
    return null;
  }

  async function go(provider: Provider) {
    const db = browserClient();

    if (db === null) {
      setRefused("Sign in is not configured on this deployment.");
      return;
    }

    setGoing(provider);
    setRefused(null);

    const { error } = await db.auth.signInWithOAuth({
      provider,
      options: {
        /* Built from where the page is actually running rather than from a
           configured base URL, so a preview deployment sends people back to the
           preview and not to production. The route it lands on is the same one
           the emailed link uses. */
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error !== null) {
      setGoing(null);
      setRefused(error.message);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-4">
        <span className="h-px flex-1 bg-rule" />
        <span className="label text-ink-faint">or</span>
        <span className="h-px flex-1 bg-rule" />
      </div>

      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          onClick={() => void go(provider)}
          disabled={going !== null}
          className="flex h-11 items-center justify-center gap-3 rounded-full bg-paper text-[0.9375rem] font-medium text-ink ring-1 ring-inset ring-rule-strong transition-colors duration-150 ease-settle hover:bg-paper-sunk active:translate-y-px disabled:opacity-50"
        >
          <Mark provider={provider} />
          {going === provider
            ? `Taking you to ${PROVIDER_NAMES[provider]}`
            : `Continue with ${PROVIDER_NAMES[provider]}`}
        </button>
      ))}

      {refused !== null && <p className="text-[0.875rem] text-broken">{refused}</p>}
    </div>
  );
}

function Mark({ provider }: { provider: Provider }) {
  if (provider === "google") {
    return (
      <svg aria-hidden viewBox="0 0 18 18" className="size-[1.125rem] shrink-0">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
        />
        <path
          fill="#FBBC05"
          d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className="size-[1.125rem] shrink-0">
      <path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.62 2.29 6.69 5.47 7.77.4.08.55-.18.55-.4l-.01-1.37c-2.23.5-2.7-1.1-2.7-1.1-.36-.96-.89-1.21-.89-1.21-.73-.51.06-.5.06-.5.8.06 1.23.85 1.23.85.71 1.26 1.87.9 2.33.68.07-.53.28-.9.51-1.1-1.78-.21-3.65-.91-3.65-4.06 0-.9.31-1.63.83-2.2-.09-.21-.36-1.05.07-2.19 0 0 .67-.22 2.2.84a7.5 7.5 0 0 1 4 0c1.53-1.06 2.2-.84 2.2-.84.44 1.14.16 1.98.08 2.19.51.57.82 1.3.82 2.2 0 3.16-1.87 3.85-3.66 4.05.29.25.54.75.54 1.51l-.01 2.24c0 .22.15.48.55.4A8.21 8.21 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z" />
    </svg>
  );
}
