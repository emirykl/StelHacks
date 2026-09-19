import { Eyebrow, Measure } from "../components/primitives";
import { SpecLabel, SpecRow, SpecRows, SpecValue } from "../components/spec";
import { SignIn, SignOut } from "../components/session";
import { Wallet } from "./wallet";
import { authConfigured, currentUser, serverClient } from "../../lib/supabase/server";

/**
 * Your account, which is two separate things stacked.
 *
 * Google says who you are. A wallet says what you hold. The product keeps them
 * apart on purpose: a Google account with no address attached can read every
 * page and do nothing on chain, and an address with no Google account behind it
 * still wins prizes perfectly well. Neither is a login for the other.
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

          <p className="mt-5 max-w-[38rem] text-[1.0625rem] leading-relaxed text-ink-soft">
            {user === null
              ? "Google is only your name here. Applying, forming a team and submitting a project are signed by your wallet, so you will need both."
              : "Google is your name. Your wallet does the signing. Applying, forming a team and submitting all need an address, so attach one below."}
          </p>
        </Measure>
      </section>

      <section className="hatch">
        <Measure wide className="py-16">
          {user === null ? <SignedOut /> : <Identity user={user} />}

          <div className="mt-16">
            <Wallet />
          </div>
        </Measure>
      </section>
    </main>
  );
}

function SignedOut() {
  return (
    <>
      <SpecLabel index="01">Identity</SpecLabel>

      <div className="mt-6 max-w-[34rem]">
        {authConfigured() ? (
          <SignIn />
        ) : (
          /* Said plainly rather than shown as a button that fails. A deployment
             without the keys is a deployment where signing in is not a thing
             that exists, and offering it anyway teaches somebody to distrust
             the next button too. */
          <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
            Sign in is not configured on this deployment. Everything a signed in
            person can verify can still be verified here without an account,
            which is the part that matters.
          </p>
        )}
      </div>
    </>
  );
}

async function Identity({ user }: { user: { id: string; email?: string | undefined } }) {
  const db = await serverClient();

  /* Created by a trigger the moment the account exists, so this is a read
     rather than an upsert. A page that had to create a profile would be a
     second, weaker place where identity begins. */
  const { data: profile } = (await db
    ?.from("profiles")
    .select("username, display_name")
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
    </>
  );
}
