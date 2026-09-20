import { Console } from "./console";
import { Measure } from "../../components/primitives";
import { currentUser } from "../../../lib/supabase/server";
import { presentationOf } from "../../../lib/chain";

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

  /* Both together: one dresses the panel, the other is whose folder the artwork
     in the details tab lands in. */
  const [written, user] = await Promise.all([presentationOf(contract), currentUser()]);

  return (
    <main className="flex-1">
      {/* The measure the public hackathon page uses, not the narrower column
          the create form is set in. This is a workspace with a rail beside a
          banner, and holding it to a reading width left the whole thing in the
          middle of the screen with paper down both sides. */}
      <Measure wide className="py-10 pb-24 sm:py-12">
        <Console
          contractId={contract}
          written={written}
          userId={user?.id ?? null}
        />
      </Measure>
    </main>
  );
}
