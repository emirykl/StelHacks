import { PRIZE_ASSETS } from "./money";
import { browserClient } from "./supabase/client";

/**
 * What an address has been paid, across every event it entered.
 *
 * A prize is read from the payment the contract made, not from the ranking that
 * earned it: a team can be first and unpaid, and what somebody can cash out is
 * the money that actually moved. The indexer records each payment as its own
 * row, so this is a read of the log rather than a second opinion about it.
 *
 * It lives on the account page because a withdrawal takes days. Somebody who
 * started one, closed the tab and came back is not going to remember which
 * hackathon it was; they are going to look at their own account.
 */

export interface Prize {
  contractId: string;
  /** The event's page, when it has one. A contract with no row still paid. */
  slug: string | null;
  name: string;
  track: string;
  rank: number;
  /** Stroops, at the asset's own scale. */
  amount: bigint;
  /** The token contract the prize was paid in, from the event's frozen rules. */
  assetContract: string | null;
  when: number;
}

export async function prizesFor(address: string): Promise<Prize[]> {
  const db = browserClient();

  if (db === null) {
    return [];
  }

  const { data: paid } = await db
    .from("payments")
    .select("contract_id, track, rank, amount, ledger")
    .eq("recipient", address)
    /* Newest first, because the one somebody came back for is the one they were
       just doing. */
    .order("ledger", { ascending: false });

  if (paid === null || paid.length === 0) {
    return [];
  }

  const contracts = [...new Set(paid.map((row) => String(row.contract_id)))];

  /* Two reads for the names and the assets rather than a join, because
     `payments` has no foreign key to either and must not: the contract paid an
     address whether or not this product ever knew about the event. */
  const [{ data: events }, { data: state }] = await Promise.all([
    db.from("hackathons").select("contract_id, slug, name").in("contract_id", contracts),
    db.from("hackathon_state").select("contract_id, prize_asset").in("contract_id", contracts),
  ]);

  const named = new Map(
    (events ?? []).map((row) => [
      String(row.contract_id),
      { slug: String(row.slug), name: String(row.name) },
    ]),
  );

  const assets = new Map(
    (state ?? []).map((row) => [String(row.contract_id), text(row.prize_asset)]),
  );

  return paid.map((row) => {
    const contractId = String(row.contract_id);
    const event = named.get(contractId);

    return {
      contractId,
      slug: event?.slug ?? null,
      /* An event this product has no row for still paid somebody, and saying so
         is better than leaving the row out. The address is the whole of what is
         known about it. */
      name: event?.name ?? `${contractId.slice(0, 6)}…${contractId.slice(-4)}`,
      track: String(row.track),
      rank: Number(row.rank),
      amount: BigInt(String(row.amount)),
      assetContract: assets.get(contractId) ?? null,
      when: Number(row.ledger),
    };
  });
}

/**
 * The code an asset contract is known by, when it is one this product offers.
 *
 * Read from the same table the create wizard picks from, so a prize and the
 * form that set it cannot disagree. An address that is not on that list is
 * shown as an address rather than guessed at.
 */
export function codeFor(assetContract: string | null): string | null {
  return PRIZE_ASSETS.find((choice) => choice.contract === assetContract)?.code ?? null;
}

/**
 * Stroops as the decimal string the ledger reads back.
 *
 * Built from the integer rather than divided, because dividing is where a value
 * that has to survive a round trip stops being exact. Seven places is what
 * every Stellar asset holds.
 */
export function amountOf(stroops: bigint): string {
  const negative = stroops < BigInt(0);
  const digits = (negative ? -stroops : stroops).toString().padStart(8, "0");
  const whole = digits.slice(0, -7);
  const fraction = digits.slice(-7).replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction.length > 0 ? `.${fraction}` : ""}`;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
