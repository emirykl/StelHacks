import { Opening } from "./opening";
import { nameOf } from "../../../../lib/chain";

/**
 * The last thing between a written hackathon and a live one, on its own page.
 *
 * It was a card at the top of the panel, above the tabs, and it carried its own
 * reading of everything about to be frozen. The panel carries that same reading
 * in its overview, so the two sat one under the other saying the same thing, and
 * what should have been a workspace looked like the create form a second time.
 *
 * They are different jobs. Setting up happens once, is irreversible, and asks
 * for one decision; managing happens every day afterwards and asks for none.
 * A page each keeps the panel free of a card that will never be seen again, and
 * keeps this moment free of tabs that have nothing in them yet.
 */

export const dynamic = "force-dynamic";

export default async function Open({ params }: PageProps<"/manage/[contract]/open">) {
  const { contract } = await params;
  const written = await nameOf(contract);

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-[64rem] px-6 py-10 sm:py-12">
        <p className="label text-[0.8125rem] tracking-[0.16em] text-ink-faint">Organizer</p>

        <h1 className="mt-2 text-[clamp(1.75rem,3.5vw,2.5rem)]">
          {written?.name ?? "Your hackathon"}
        </h1>
      </div>

      <div className="mx-auto w-full max-w-[64rem] px-6 pb-24">
        <Opening contractId={contract} />
      </div>
    </main>
  );
}
