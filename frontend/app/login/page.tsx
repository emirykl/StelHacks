import { redirect } from "next/navigation";

import { OAuthButtons } from "../components/oauth";
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
 * product where a picture is doing the talking. On the right the way in, and
 * under it the line that matters: an account is a name and nothing else. Saying
 * that limit before the button rather than after it is deliberate, because
 * somebody handing over an address deserves to know what it buys.
 *
 * There is one way in and it is a provider somebody already has. A one time
 * code to an inbox sat above it and offering both made this the only screen in
 * the product asking a person to choose between two doors into the same room,
 * before they knew what was on the other side. The email address still arrives
 * either way, because that is all the provider hands over.
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

  /* Configured and something wired up are two different things, and only both
     together mean there is a button here that works. */
  const wayIn = authConfigured() && providers.length > 0;

  return (
    /* Pulled up by the height the header occupies, so the artwork starts at the
       very top of the window and the header floats on it. Without this the
       picture begins under a band of paper and the header's own edges vanish
       into it. */
    <main data-solo className="relative -mt-18 flex-1 overflow-hidden bg-night">
      {/* The whole page, not half of it. A split screen gives the artwork a
          column and a hard edge down the middle; letting it run under
          everything makes it the room the form is standing in, which is what a
          picture on a sign in page is for. */}
      <img
        src="/login-screen.png"
        alt=""
        className="absolute inset-0 size-full object-cover"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[96rem] items-center justify-center px-6 pt-31 pb-12 lg:justify-end lg:px-12">
        {/*
          The one card in this product that casts a real shadow.

          Everywhere else a surface is drawn with a hairline, because a shadow
          claims depth an interface this flat has no reason to claim. Here it is
          not a claim: the card is genuinely above a picture, and without the
          shadow it reads as a hole cut in the artwork rather than as paper
          lying on it.
        */}
        <div className="w-full max-w-[26rem] rounded-lg bg-paper p-8 shadow-[0_28px_70px_-24px_rgba(0,0,0,0.6)] sm:p-10">
          <h1 className="text-[2rem]">Welcome</h1>

          <p className="mt-3 text-[1rem] leading-relaxed text-ink-soft">
            {wayIn
              ? "Continue with an account you already have. Nothing to fill in and no password to keep."
              : "Sign in is not configured on this deployment."}
          </p>

          {wayIn ? (
            <div className="mt-7">
              <OAuthButtons providers={providers} next={next} />
            </div>
          ) : (
            /* Said plainly rather than shown as a button that fails. A
               deployment without the keys is one where signing in does not
               exist, and offering it anyway teaches somebody to distrust the
               next button too. */
            <p className="mt-6 text-[1rem] leading-relaxed text-ink-soft">
              Everything a signed in person can verify can still be verified
              here without an account.
            </p>
          )}

          <p className="mt-8 border-t border-rule pt-5 text-[0.875rem] leading-relaxed text-ink-faint">
            An account is a name and nothing else. Your wallet does every
            signature and you attach one after this.
          </p>
        </div>
      </div>
    </main>
  );
}
