import { ApplyPanel } from "../components/organizer-apply";
import { ButtonLink, Measure } from "../components/primitives";
import { Wizard } from "./wizard";
import { currentUser, serverClient } from "../../lib/supabase/server";
import { FEE_BPS, tierOf } from "../../lib/organizing";
import { standingNow } from "../../lib/standing";

/**
 * Writing a hackathon's rules.
 *
 * Three gates before the form now, and none is decoration. Signing in is who
 * the draft belongs to. Being an approved organizer is whether this site will
 * carry the event at all. A connected wallet is what signs it onto the chain and
 * what the contract will treat as the organizer from then on. Showing the form
 * without all three would let somebody fill in twenty fields and then find out.
 *
 * The middle gate is the one added last and it is the one that was missing
 * entirely: this page had no link into it from anywhere in the product and no
 * check on whoever typed the address, which is the worst pair of properties a
 * page can have. It could not be found by the people it was for and it could be
 * used by everybody else.
 *
 * It fails closed. If the grant cannot be read the answer is no, because the
 * failure mode of the other arrangement is a stranger running an event under
 * our name while a database is unreachable.
 */

export const dynamic = "force-dynamic";

export default async function Create({ searchParams }: PageProps<"/create">) {
  /* An existing hackathon whose draft rules are being rewritten, when there is
     one. The same form writes both, because it is the same document; what
     changes is one call at the end of it. */
  const { edit } = await searchParams;
  const editing = typeof edit === "string" && edit.length === 56 ? edit : null;

  const user = await currentUser();
  const db = user === null ? null : await serverClient();

  /* The grant answers both questions at once: whether they may create anything,
     and what this event will be charged. Reading the tier rather than calling
     `may_organize` separately keeps the two from ever disagreeing, which is the
     kind of disagreement that quotes somebody a rate they were not granted. */
  const tier = db === null || user === null ? null : await tierOf(db, user.id);

  return (
    <main className="flex-1">
      {/* Centred, and no rule under it. The form below is a column of cards
          down the middle of the window, and a heading pinned to the left edge
          with a hairline running the full width was the page introducing itself
          in one layout and then behaving in another. */}
      <section>
        {/* The sentence about hashing and freezing used to sit under the title.
            It described a property of the whole product to somebody who had not
            yet typed anything, and the form says the same thing once, at the
            bottom, next to the button it actually applies to. Two places saying
            it made the top of the page an essay in front of a form. */}
        <Measure className="py-16 text-center sm:py-20">
          <p className="label text-[0.875rem] tracking-[0.16em] text-ink-soft">Organizer</p>

          <h1 className="mt-4 text-[clamp(2.5rem,6vw,4rem)]">
            {editing === null ? "Create a hackathon" : "Edit the rules"}
          </h1>
        </Measure>
      </section>

      {/* Its own measure rather than the shared one. The reading column is
          forty six rem, which is right for prose and too narrow for a form whose
          rows are two fields wide with a running total beside them; `wide` is
          ninety six and leaves a third of the window empty. Sixty is the width
          at which a pair of fields is comfortable and a line of type is still
          one line. */}
      <div className="mx-auto w-full max-w-[60rem] px-6 pb-24">
        {user === null ? (
          /* Sent to the one page that knows how signing in works rather than
             carrying a second copy of it. A form here would be a way in that
             the sign in page does not offer, which is how the two drift. */
          <div className="mx-auto max-w-[34rem] text-center">
            <ButtonLink href="/login?next=%2Fcreate">Sign in to start</ButtonLink>

            <p className="mt-5 text-[0.875rem] leading-relaxed text-ink-soft">
              A draft belongs to an account, and the wallet you connect after
              this is the one the contract will treat as the organizer.
            </p>
          </div>
        ) : tier !== null ? (
          <Wizard feeBps={FEE_BPS[tier]} userId={user.id} editing={editing} />
        ) : (
          /* The same panel the footer and the landing card open, rather than a
             refusal. Somebody who reached this page wants exactly the thing the
             panel offers, and sending them away to look for it would be the
             product knowing the answer and making them go and find it. */
          <div className="mx-auto max-w-[34rem] rounded-[1.25rem] bg-paper p-8 ring-1 ring-rule">
            <ApplyPanel standing={await standingNow()} />
          </div>
        )}
      </div>
    </main>
  );
}
