import { AccountMenu } from "./account-menu";
import { ApplyTrigger } from "./organizer-apply";
import { Measure } from "./primitives";
import { currentUser, serverClient } from "../../lib/supabase/server";
import { isStaff, mayOrganize } from "../../lib/organizing";
import { profileOf } from "../../lib/profile";

/**
 * The frame every page is read inside.
 *
 * Lives in the layout rather than in each page, because a header that a page
 * has to remember to include is a header some page will eventually forget.
 */

export async function Header() {
  const user = await currentUser();

  /* Only for the handle, which is what the menu's Profile row links to. A menu
     that had to guess the address would guess it wrong for anybody who has
     changed their username. */
  const db = user === null ? null : await serverClient();

  /* Three reads for one menu, asked together rather than one after another.
     The menu is on every page, so the difference between these being parallel
     and being sequential is two round trips added to every request in the
     product. */
  const [profile, organizer, staff] =
    db === null || user === null
      ? [null, false, false]
      : await Promise.all([profileOf(db, user.id), mayOrganize(db), isStaff(db)]);

  /* A bar that floats rather than one painted across the top.

     Only the bottom corners used to be rounded, and the curl was invisible
     until something scrolled underneath it: at rest the header sat flush to
     three edges of the window and the only thing anybody could see was one
     straight line. So the hairline goes all the way around and the header is
     held off every edge by the same gap, which makes the shape the same
     whether the page has moved or not. The radius stays small enough to be
     felt rather than noticed. */
  return (
    <>
      {/*
        The strip the floating bar does not cover.

        Holding the header off every edge leaves a gap above it and a margin
        down each side, and the page scrolls through all three. A video panel
        or a banner passing behind the bar arrived sharp in that gap and blurred
        under the bar, so the one thing meant to read as a single sheet of glass
        read as a pane with a hole cut round it.

        This is that glass. It reaches to the bar's lower edge and fades out
        rather than stopping on a line, because a blur that ends abruptly is
        just a second edge to explain. It sits under the header and over the
        page, and it takes no pointer events: it is a surface, not a control.
      */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-10 h-[5.5rem] backdrop-blur-xl [mask-image:linear-gradient(to_bottom,black_0,black_4.75rem,transparent_5.5rem)]"
      />

      {/* The height is stated on the header itself rather than on the row
          inside it, so the space this bar occupies is one number and not that
          number plus two hairlines. The sign in page pulls its artwork up by
          exactly this much and the difference was two pixels of scrollbar. */}
      <header className="sticky top-3 z-20 mx-3 mt-3 h-16 rounded-[1.25rem] border border-rule bg-paper/92 backdrop-blur-xl">
      <div className="mx-auto flex h-full w-full max-w-[96rem] items-center justify-between px-5 sm:px-6">
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
              className="rounded-full px-4 py-2.5 text-[1rem] text-ink-soft transition-colors duration-150 ease-settle hover:bg-paper-sunk hover:text-ink"
            >
              {label}
            </a>
          ))}
        </nav>

        {/* The one control on the right, and it changes with the situation: a
            way in, then the person, then the connected address beside them.
            "Browse" used to sit here and said the same thing as the Hackathons
            link beside it. */}
        <AccountMenu
          email={user?.email ?? null}
          username={profile?.username ?? null}
          avatarUrl={profile?.avatarUrl ?? null}
          organizer={organizer}
          staff={staff}
        />
      </div>
      </header>
    </>
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

          <nav className="flex flex-wrap gap-5 text-[0.8125rem] text-ink-soft" aria-label="Elsewhere">
            <a href="/how-it-works" className="hover:text-ink">
              How it works
            </a>
            <a href="/hackathons" className="hover:text-ink">
              Hackathons
            </a>

            {/* The footer is where somebody looks for the thing a site did not
                offer them anywhere else, and running an event is that thing.
                It opens the same panel as the landing card rather than a page
                of its own: two doors into one room, and the room is written
                once. */}
            <ApplyTrigger className="hover:text-ink">Run a hackathon</ApplyTrigger>
          </nav>
        </div>
      </Measure>
    </footer>
  );
}
