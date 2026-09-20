import { ApplyPanel } from "../components/organizer-apply";
import { Eyebrow, Measure } from "../components/primitives";
import { standingNow } from "../../lib/standing";

/**
 * The same panel, at an address.
 *
 * The modal is the way most people meet this, opened over the page they were
 * reading. A page is needed anyway for the two cases a modal cannot serve:
 * somebody who was sent to sign in and has to land somewhere afterwards, and
 * somebody who was sent a link to this by a colleague.
 *
 * It renders the identical component rather than its own copy of the form, so
 * the two can never end up asking for different things.
 */

export const dynamic = "force-dynamic";

export default async function Organize() {
  const standing = await standingNow();

  return (
    <main className="flex-1">
      <section className="border-b border-rule">
        <Measure wide className="py-16 sm:py-20">
          <Eyebrow>Organizer</Eyebrow>

          <h1 className="mt-4 text-[clamp(2rem,4.5vw,3rem)]">Run a hackathon here</h1>

          <p className="mt-5 max-w-[40rem] text-[1.0625rem] leading-relaxed text-ink-soft">
            Not everybody can open one. Tell us what you want to run and we
            answer by hand.
          </p>
        </Measure>
      </section>

      <Measure className="py-16">
        <ApplyPanel standing={standing} />
      </Measure>
    </main>
  );
}
