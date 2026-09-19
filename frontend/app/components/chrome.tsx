import { Badge, ButtonLink, Measure } from "./primitives";

/**
 * The frame every page is read inside.
 *
 * Lives in the layout rather than in each page, because a header that a page
 * has to remember to include is a header some page will eventually forget.
 */

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-rule bg-paper/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[76rem] items-center justify-between px-6">
        <a href="/" className="display text-xl tracking-normal">
          StelHacks
        </a>

        <nav className="hidden items-center gap-1 sm:flex" aria-label="Sections">
          {[
            ["Hackathons", "/hackathons"],
            ["How it works", "/how-it-works"],
            ["Builders", "/builders"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-3.5 py-2 text-[0.875rem] text-ink-soft transition-colors duration-150 ease-settle hover:bg-paper-sunk hover:text-ink"
            >
              {label}
            </a>
          ))}
        </nav>

        <ButtonLink href="/hackathons" size="sm">
          Browse
          <Badge>→</Badge>
        </ButtonLink>
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
            Running on Stellar testnet. Contract addresses and build hashes are
            published.
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
