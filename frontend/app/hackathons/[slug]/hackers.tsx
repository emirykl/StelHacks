import { Measure } from "../../components/primitives";
import { SpecHeading, SpecLabel } from "../../components/spec";
import { hackersOf, type Hacker } from "../../../lib/hackers";

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
      <SpecLabel index="01">Approved</SpecLabel>

      <SpecHeading className="mt-3">
        {hackers.length === 0
          ? "Nobody yet"
          : `${hackers.length} ${hackers.length === 1 ? "hacker" : "hackers"}`}
      </SpecHeading>

      {hackers.length === 0 ? (
        <p className="mt-6 max-w-[36rem] text-[0.9375rem] leading-relaxed text-ink-soft">
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
 * The address is always shown and always shown in full type, because it is the
 * part anybody can go and check. The name sits above it as the friendlier
 * label, never instead of it.
 */
function One({ hacker }: { hacker: Hacker }) {
  const named = hacker.displayName ?? hacker.username;

  return (
    <li className="flex items-center gap-3 border border-rule bg-paper p-4">
      <Avatar hacker={hacker} />

      <div className="min-w-0">
        {named === null ? (
          <p className="label text-ink-faint">no account attached</p>
        ) : (
          <p className="truncate text-[0.9375rem] font-medium text-ink">{named}</p>
        )}

        <p className="tabular mt-1 truncate text-[0.75rem] text-ink-soft">
          {shorten(hacker.address)}
        </p>
      </div>
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
          : "bg-ink text-[0.875rem] font-semibold text-signal"
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
