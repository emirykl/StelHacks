import { Console } from "./console";
import { nameOf } from "../../../lib/chain";

/**
 * Running a hackathon, keyed on the contract rather than on a name.
 *
 * A hackathon exists on chain before anybody has typed a description for it,
 * and the organizer needs somewhere to go the moment after they create one. A
 * slug would require our indexer to have caught up first, which is the wrong
 * thing to make somebody wait for.
 *
 * The name is still shown when we have it. Keyed on the address is not the same
 * as headed by the address, and this page used to be both: an organizer arrived
 * from the wizard, having just typed a name, at a page titled "Run it" over
 * fifty six characters of contract id.
 *
 * Laid out like the create form on purpose. The two are one job in two sittings
 * and were two different products to look at: cards on a measured column there,
 * a hatched full width specification sheet here.
 */

export const dynamic = "force-dynamic";

export default async function Manage({ params }: PageProps<"/manage/[contract]">) {
  const { contract } = await params;
  const written = await nameOf(contract);

  return (
    <main className="flex-1">
      <section>
        <div className="mx-auto w-full max-w-[60rem] px-6 py-16 text-center sm:py-20">
          <p className="label text-[0.875rem] tracking-[0.16em] text-ink-soft">Organizer</p>

          <h1 className="mt-4 text-[clamp(2.5rem,6vw,4rem)]">
            {written?.name ?? "Your hackathon"}
          </h1>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[60rem] px-6 pb-24">
        <Console contractId={contract} slug={written?.slug ?? null} />
      </div>
    </main>
  );
}
