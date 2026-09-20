import Link from "next/link";

import { Mark } from "../../components/marks";
import { Measure } from "../../components/primitives";
import { SpecHeading, SpecLabel } from "../../components/spec";
import { hackersOf, linksOf, type Hacker } from "../../../lib/hackers";

/**
 * Who got in, as the contract recorded it.
 *
 * This is a guest list rather than a member directory, and the difference shows
 * in what a row can be. An address that was approved and belongs to nobody is a
 * complete row here: the chain let it in, so it is on the list, and a page that
 * hid it would be describing a smaller event than the one that happened.
 *
 * A name appears only where somebody signed in and proved they hold the
 * address. That proof is a signature over a challenge, not a claim in a form,
 * which is why a name here means something and is allowed to be absent.
 */

export async function Hackers({ contractId }: { contractId: string }) {
  const hackers = await hackersOf(contractId);

  return (
    <Measure wide className="py-14">
      <SpecLabel index="1">Approved</SpecLabel>

      <SpecHeading className="mt-3">
        {hackers.length === 0
          ? "Nobody yet"
          : `${hackers.length} ${hackers.length === 1 ? "hacker" : "hackers"}`}
      </SpecHeading>

      {hackers.length === 0 ? (
        <p className="mt-6 max-w-[36rem] text-[1rem] leading-relaxed text-ink-soft">
          Either registration has not opened, or the organizer has not approved
          anybody yet. The contract is the record either way, and this list is
          rebuilt from its approval events rather than kept alongside them.
        </p>
      ) : (
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {hackers.map((hacker) => (
            <One key={hacker.address} hacker={hacker} />
          ))}
        </ul>
      )}
    </Measure>
  );
}

/**
 * One person, or one address that has not become a person yet.
 *
 * The name leads when there is one and the address leads when there is not.
 * The earlier version printed "no account attached" in that first slot, which
 * spent the most prominent line on the platform's own bookkeeping — the person
 * reading it did not do anything wrong, and neither did the address.
 *
 * A named row is a link to their profile. An anonymous one is not, because
 * there is nothing on the other side of it.
 */
function One({ hacker }: { hacker: Hacker }) {
  const named = hacker.displayName ?? hacker.username;
  const links = linksOf(hacker);

  const inside = (
    <>
      <Avatar hacker={hacker} />

      <div className="min-w-0">
        {named === null ? (
          <p className="tabular truncate text-[0.9375rem] text-ink">{shorten(hacker.address)}</p>
        ) : (
          <>
            <p className="truncate text-[1rem] font-medium text-ink">{named}</p>
            <p className="tabular mt-1 truncate text-[0.8125rem] text-ink-soft">
              {shorten(hacker.address)}
            </p>
          </>
        )}
      </div>
    </>
  );

  return (
    <li className="flex items-center gap-3 border border-rule bg-paper p-4">
      {hacker.username === null ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">{inside}</div>
      ) : (
        <Link
          href={`/u/${hacker.username}`}
          className="flex min-w-0 flex-1 items-center gap-3 transition-opacity duration-150 ease-settle hover:opacity-70"
        >
          {inside}
        </Link>
      )}

      {links.length > 0 && (
        /* Outside the profile link rather than inside it. Nesting an anchor in
           an anchor is invalid and browsers resolve it by dropping one, so the
           GitHub mark would have quietly opened the profile instead. */
        <ul className="flex shrink-0 items-center gap-0.5">
          {links.map((link) => (
            <li key={link.key}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                aria-label={link.title}
                title={link.title}
                className="grid size-7 place-items-center rounded-full text-ink-soft transition-colors duration-150 ease-settle hover:bg-paper-sunk hover:text-ink"
              >
                <Mark where={link.key} className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The person, as a circle.
 *
 * Their own picture when they uploaded one, their initial when they have a
 * name, and the first characters of the address when they have neither. Every
 * row keeps the same shape either way, so a list of anonymous addresses does
 * not read as a list of broken rows.
 */
function Avatar({ hacker }: { hacker: Hacker }) {
  if (hacker.avatarUrl !== null) {
    return (
      <img
        src={hacker.avatarUrl}
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-full object-cover ring-1 ring-rule"
      />
    );
  }

  const named = hacker.displayName ?? hacker.username;

  return (
    <span
      aria-hidden
      className={`grid size-10 shrink-0 place-items-center rounded-full ${
        named === null
          ? "label bg-paper-sunk text-ink-faint ring-1 ring-inset ring-rule"
          : "bg-ink text-[0.9375rem] font-semibold text-signal"
      }`}
    >
      {named === null ? hacker.address.slice(1, 3) : named.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Enough of an address to recognise, with the middle left out. */
function shorten(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}
