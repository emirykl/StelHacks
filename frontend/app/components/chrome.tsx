import { AccountMenu } from "./account-menu";
import { Measure } from "./primitives";
import { currentUser } from "../../lib/supabase/server";

/**
 * The frame every page is read inside.
 *
 * Lives in the layout rather than in each page, because a header that a page
 * has to remember to include is a header some page will eventually forget.
 */

export async function Header() {
  const user = await currentUser();

  /* The bottom corners are rounded, which turns the hairline underneath into a
     line that curls up as it reaches either edge rather than running off the
     side of the screen. It is what makes the header read as a piece of
     furniture sitting on the page instead of a band painted across it, and the
     curl is small enough to be felt rather than noticed. */
  return (
    <header className="sticky top-0 z-10 rounded-b-[1.25rem] border-b border-rule bg-paper/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[96rem] items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2.5">
          {/* The mark ships on its own black tile rather than transparent. The
              art has a black laptop screen and a black shadow in it, so a
              cut out version loses half of itself the moment it lands on a
              dark surface. A square of night is a surface this system already
              uses, so the tile reads as deliberate in both colour schemes. */}
          <img
            src="/mark.png"
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-[0.45rem]"
          />

          <span className="display text-xl tracking-normal">StelHacks</span>
        </a>

        <nav className="hidden items-center gap-1 sm:flex" aria-label="Sections">
          {/* One link, because there is one thing to go to. "How it works" and
              "Create" belong to the landing page's argument rather than to the
              header: a nav with three items and no hierarchy makes a reader
              choose before they know what any of them are. */}
          {[["Hackathons", "/hackathons"]].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-3.5 py-2 text-[0.875rem] text-ink-soft transition-colors duration-150 ease-settle hover:bg-paper-sunk hover:text-ink"
            >
              {label}
            </a>
          ))}
        </nav>

        {/* The one control on the right, and it changes with the situation: a
            way in, then the person, then the connected address beside them.
            "Browse" used to sit here and said the same thing as the Hackathons
            link beside it. */}
        <AccountMenu email={user?.email ?? null} />
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-rule py-12">
      <Measure wide>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.8125rem] text-ink-faint">
            Stellar testnet. Contract addresses and build hashes are published.
          </p>

          <nav className="flex gap-5 text-[0.8125rem] text-ink-soft" aria-label="Elsewhere">
            <a href="/how-it-works" className="hover:text-ink">
              How it works
            </a>
            <a href="/hackathons" className="hover:text-ink">
              Hackathons
            </a>
          </nav>
        </div>
      </Measure>
    </footer>
  );
}
