import { Eyebrow, Measure } from "../components/primitives";
import { SignIn } from "../components/session";
import { Wizard } from "./wizard";
import { currentUser } from "../../lib/supabase/server";

/**
 * Writing a hackathon's rules.
 *
 * Two gates before the form, and neither is decoration. Signing in is who the
 * draft belongs to; a connected wallet is what signs it onto the chain and what
 * the contract will treat as the organizer from then on. Showing the form
 * without both would let somebody fill in twenty fields and then find out.
 */

export const metadata = { title: "Create a hackathon" };

export const dynamic = "force-dynamic";

export default async function Create() {
  const user = await currentUser();


  return (
    <main className="flex-1">
      <section className="border-b border-rule">
        <Measure wide className="py-16 sm:py-20">
          <Eyebrow>Organizer</Eyebrow>

          <h1 className="mt-4 text-[clamp(2rem,4.5vw,3rem)]">Create a hackathon</h1>

          <p className="mt-5 max-w-[40rem] text-[1.0625rem] leading-relaxed text-ink-soft">
            Everything here becomes one object, hashed and frozen when you lock
            it. Until then nothing is binding and you can change any of it.
          </p>
        </Measure>
      </section>

      <Measure wide className="py-16">
        {user === null ? (
          <div className="max-w-[34rem]">
            <SignIn next="/create" />

            <p className="mt-5 text-[0.875rem] leading-relaxed text-ink-soft">
              A draft belongs to an account, and the wallet you connect after
              this is the one the contract will treat as the organizer.
            </p>
          </div>
        ) : (
          <Wizard />
        )}
      </Measure>
    </main>
  );
}
