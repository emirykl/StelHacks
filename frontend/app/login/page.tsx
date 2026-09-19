import { redirect } from "next/navigation";

import { SignIn } from "../components/session";
import { authConfigured, currentUser } from "../../lib/supabase/server";

/**
 * A page whose only job is getting somebody in.
 *
 * Signing in used to be a form on the account page, which meant the way in was
 * behind a door labelled with what is on the other side of it. Somebody who has
 * never signed in has no account to visit, so "Account" was the wrong name for
 * the only link that took them anywhere.
 *
 * The page is split, and the two halves are the two halves of the product. On
 * the left, in the chain's voice, is what an account is not: it never signs and
 * it never holds anything. On the right is the one thing to do. Saying the
 * limit first is deliberate. Somebody handing over an address deserves to know
 * what it buys before they type it, and what it buys here is a name.
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

  return (
    <main className="flex-1">
      <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Argument />

        <div className="grid place-items-center px-6 py-16">
          <div className="w-full max-w-[26rem]">
            <h1 className="text-[clamp(2rem,4vw,2.75rem)]">Sign in</h1>

            <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-soft">
              No password. Put in an address you can read and a six digit code
              arrives; type it back here and you are in.
            </p>

            <div className="mt-8">
              {authConfigured() ? (
                <SignIn next={next} />
              ) : (
                /* Said plainly rather than shown as a button that fails. A
                   deployment without the keys is one where signing in does not
                   exist, and offering it anyway teaches somebody to distrust
                   the next button too. */
                <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
                  Sign in is not configured on this deployment. Everything a
                  signed in person can verify can still be verified here without
                  an account.
                </p>
              )}
            </div>

            <p className="mt-10 border-t border-rule pt-5 text-[0.8125rem] leading-relaxed text-ink-faint">
              You do not need an account to read a hackathon, check a digest, or
              recompute a result. Signing in is only how a page knows to call you
              something.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * The half of the page that is not a form.
 *
 * Inverted, which in this system means a change of register rather than a
 * theme: the dark surfaces are where the chain speaks. What it says here is the
 * separation the whole product rests on, and it is said before the form rather
 * than under it because it is the thing that makes the form small.
 *
 * Hidden on a narrow screen. Stacked above a form it becomes an obstacle
 * between somebody and the field they came to fill in.
 */
function Argument() {
  return (
    <aside className="relative hidden overflow-hidden bg-night px-12 py-16 lg:flex lg:flex-col lg:justify-between">
      <div aria-hidden className="halftone absolute inset-0 opacity-60" />

      <div className="relative flex items-center gap-2.5">
        <img src="/mark.png" alt="" width={32} height={32} className="size-8 rounded-[0.45rem]" />

        <span className="display text-xl tracking-normal text-night-ink">StelHacks</span>
      </div>

      <div className="relative max-w-[26rem]">
        <h2 className="text-[clamp(1.75rem,2.6vw,2.25rem)] text-night-ink">
          An account is a name, and nothing else.
        </h2>

        <dl className="mt-10 grid gap-6">
          {[
            [
              "Your email",
              "Says which person is reading the page. It can never move money and it can never sign anything.",
            ],
            [
              "Your wallet",
              "Does every signature. You attach one after this, and the chain only ever hears from it.",
            ],
            [
              "Neither is a login for the other",
              "An account with no address does nothing on chain. An address with no account still wins prizes.",
            ],
          ].map(([term, said]) => (
            <div key={term} className="border-t border-night-rule pt-4">
              <dt className="label text-signal">{term}</dt>

              <dd className="mt-2 text-[0.9375rem] leading-relaxed text-night-ink-soft">
                {said}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}
