import { Eyebrow, Measure } from "../components/primitives";
import { SpecLabel, SpecRow, SpecRows, SpecValue } from "../components/spec";
import { SignIn, SignOut } from "../components/session";
import { Wallet } from "./wallet";
import { authConfigured, currentUser, serverClient } from "../../lib/supabase/server";

/**
 * Your account, in the order the two halves actually depend on each other.
 *
 * Google says who you are. A wallet says what you hold. They are separate
 * layers and neither is a login for the other, but they are not
 * interchangeable in time: a wallet is attached to a profile, so there has to
 * be a profile first.
 *
 * That is why the wallet section is absent rather than disabled when nobody is
 * signed in. Connecting without a session cannot be finished at all, because a
 * challenge is issued to a person and there is nobody to issue it to. Offering
 * the button anyway would show an address and then have nowhere to put it.
 */

export const metadata = { title: "Account" };

/** Read fresh. A page that shows a stale session is showing somebody else's. */
export const dynamic = "force-dynamic";

export default async function Account() {
  const user = await currentUser();

  return (
    <main className="flex-1">
      <section className="border-b border-rule">
        <Measure wide className="py-16 sm:py-20">
          <Eyebrow>Your account</Eyebrow>

          <h1 className="mt-4 text-[clamp(2rem,4.5vw,3rem)]">
            {user === null ? "Sign in" : "Account"}
          </h1>
        </Measure>
      </section>

      <section className="hatch">
        <Measure wide className="py-16">
          {user === null ? <SignedOut /> : <SignedIn user={user} />}
        </Measure>
      </section>
    </main>
  );
}

function SignedOut() {
  if (!authConfigured()) {
    /* Said plainly rather than shown as a button that fails. A deployment
       without the keys is one where signing in does not exist, and offering it
       anyway teaches somebody to distrust the next button too. */
    return (
      <p className="max-w-[34rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        Sign in is not configured on this deployment. Everything a signed in
        person can verify can still be verified here without an account.
      </p>
    );
  }

  return (
    <div className="max-w-[34rem]">
      <SignIn />

      <p className="mt-5 text-[0.875rem] leading-relaxed text-ink-soft">
        Google is only your name. Your wallet does the signing, and you attach
        one after this.
      </p>
    </div>
  );
}

async function SignedIn({ user }: { user: { id: string; email?: string | undefined } }) {
  const db = await serverClient();

  /* Created by a trigger the moment the account exists, so this is a read
     rather than an upsert. A page that had to create a profile would be a
     second, weaker place where identity begins. */
  const { data: profile } = (await db
    ?.from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle()) ?? { data: null };

  return (
    <>
      <SpecLabel index="01">Identity</SpecLabel>

      <div className="mt-8">
        <SpecRows>
          <SpecRow index="01" label="Signed in as">
            <SpecValue>{user.email ?? "no address on this account"}</SpecValue>
          </SpecRow>

          <SpecRow index="02" label="Username">
            <SpecValue>{profile?.username ?? "not created yet"}</SpecValue>
          </SpecRow>
        </SpecRows>
      </div>

      <div className="mt-6">
        <SignOut />
      </div>

      <div className="mt-16">
        <Wallet />
      </div>
    </>
  );
}
