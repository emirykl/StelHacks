import { redirect } from "next/navigation";

import { OAuthButtons } from "../components/oauth";
import { SignIn } from "../components/session";
import { authConfigured, currentUser } from "../../lib/supabase/server";
import { providersOffered } from "../../lib/providers";

/**
 * A page whose only job is getting somebody in.
 *
 * Signing in used to be a form on the account page, which meant the way in was
 * behind a door labelled with what is on the other side of it. Somebody who has
 * never signed in has no account to visit, so "Account" was the wrong name for
 * the only link that took them anywhere.
 *
 * The page is split. On the left the artwork, which is the one place in this
 * product where a picture is doing the talking. On the right the form, and
 * under it the line that matters: an account is a name and nothing else. Saying
 * that limit before the field rather than after it is deliberate, because
 * somebody handing over an address deserves to know what it buys.
 *
 * The order of the three ways in is the order of how much they cost the
 * reader. The email code needs nothing but an inbox. Google and GitHub need an
 * account somewhere else and appear only where they have been wired up.
 */

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const asked = await searchParams;
  const wanted = Array.isArray(asked["next"]) ? asked["next"][0] : asked["next"];

  /* Only a path on this site. `next` arrives in a URL anybody can write, and
     without this a link could carry `next=https://somewhere.else` and bounce a
     freshly signed in person straight off the site, which is how a convincing
     phishing page gets its first visitor. */
  const next =
    typeof wanted === "string" && wanted.startsWith("/") && !wanted.startsWith("//")
      ? wanted
      : "/account";

  /* Already in, so there is nothing here to do. Showing the form anyway would
     let somebody sign in as themselves twice and wonder which one took. */
  if ((await currentUser()) !== null) {
    redirect(next);
  }

  const providers = providersOffered();

  return (
    <main className="flex-1">
      <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Hidden on a narrow screen. Stacked above a form a picture becomes an
            obstacle between somebody and the field they came to fill in. */}
        <aside className="relative hidden overflow-hidden bg-night lg:block">
          <img
            src="/login-screen.png"
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        </aside>

        <div className="grid place-items-center px-6 py-16">
          <div className="w-full max-w-[24rem]">
            <h1 className="text-[clamp(2rem,4vw,2.75rem)]">Welcome</h1>

            <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-soft">
              {authConfigured()
                ? offered(providers.length)
                : "Sign in is not configured on this deployment."}
            </p>

            {authConfigured() ? (
              <>
                <div className="mt-8">
                  <SignIn next={next} />
                </div>

                <div className="mt-6">
                  <OAuthButtons providers={providers} next={next} />
                </div>
              </>
            ) : (
              /* Said plainly rather than shown as a button that fails. A
                 deployment without the keys is one where signing in does not
                 exist, and offering it anyway teaches somebody to distrust the
                 next button too. */
              <p className="mt-6 text-[0.9375rem] leading-relaxed text-ink-soft">
                Everything a signed in person can verify can still be verified
                here without an account.
              </p>
            )}

            <p className="mt-10 border-t border-rule pt-5 text-[0.8125rem] leading-relaxed text-ink-faint">
              An account is a name and nothing else. Your wallet does every
              signature, you attach one after this, and no account can move money
              without it. You do not need one to read a hackathon, check a digest
              or recompute a result.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

/** What is on offer, named rather than left to be discovered by scrolling. */
function offered(count: number): string {
  return count === 0
    ? "Put in an address you can read and a six digit code arrives. No password."
    : "Continue with an email code, or with an account you already have.";
}
