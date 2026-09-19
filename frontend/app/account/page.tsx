import { redirect } from "next/navigation";

import { Eyebrow, Measure } from "../components/primitives";
import { SpecLabel, SpecRow, SpecRows, SpecValue } from "../components/spec";
import { SignOut } from "../components/session";
import { Wallet } from "./wallet";
import { currentUser, serverClient } from "../../lib/supabase/server";

/**
 * Your account, in the order the two halves actually depend on each other.
 *
 * An email says who you are. A wallet says what you hold. They are separate
 * layers and neither is a login for the other, but they are not
 * interchangeable in time: a wallet is attached to a profile, so there has to
 * be a profile first.
 *
 * That is why the wallet section is absent rather than disabled when nobody is
 * signed in. Connecting without a session cannot be finished at all, because a
 * challenge is issued to a person and there is nobody to issue it to. Offering
 * the button anyway would show an address and then have nowhere to put it.
 */

/** Read fresh. A page that shows a stale session is showing somebody else's. */
export const dynamic = "force-dynamic";

export default async function Account() {
  const user = await currentUser();

  /* One door, and it is `/login`. This page used to draw its own sign in form,
     which meant two surfaces could disagree about what signing in looks like
     and one of them would eventually be the stale one. */
  if (user === null) {
    redirect("/login?next=%2Faccount");
  }

  return (
    <main className="flex-1">
      <section className="border-b border-rule">
        <Measure wide className="py-16 sm:py-20">
          <Eyebrow>Your account</Eyebrow>

          <h1 className="mt-4 text-[clamp(2rem,4.5vw,3rem)]">Account</h1>
        </Measure>
      </section>

      <section className="hatch">
        <Measure wide className="py-16">
          <SignedIn user={user} />
        </Measure>
      </section>
    </main>
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
