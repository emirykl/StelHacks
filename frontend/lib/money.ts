/**
 * What a prize is worth, in the token and in dollars.
 *
 * The token amount is the fact: it is what the constitution says and what the
 * vault holds, and it does not move. The dollar figure is a convenience and is
 * treated as one — it comes from outside, it can be stale, and when it cannot
 * be had the card shows the amount without it rather than a number nobody can
 * stand behind.
 *
 * That distinction is the reason these are separate fields rather than one
 * pre-formatted string. A page that could not tell them apart would be free to
 * print an estimate in the place where the product promises a fact.
 */

/**
 * The two tokens a prize can be paid in: the native lumen and USDC.
 *
 * Both as their Stellar Asset Contract addresses, because that is what the
 * constitution stores and what the vault is bound against. There is no third
 * option and the create form offers exactly these, which is the point of the
 * list being here rather than in the form: an asset the form could offer but
 * this file did not recognise would have its prize printed as an unknown token
 * on every card that showed it.
 */
export const PRIZE_ASSETS = [
  {
    code: "XLM",
    name: "Lumens",
    contract: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    dollars: "quoted",
  },
  {
    code: "USDC",
    name: "USD Coin",
    contract: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    /* A dollar stablecoin is quoted at a dollar rather than looked up. Asking a
       price feed what a dollar is worth would add a dependency and a way to be
       wrong about the one asset that cannot be. */
    dollars: "one-to-one",
  },
] as const satisfies readonly {
  code: string;
  name: string;
  contract: string;
  dollars: "one-to-one" | "quoted";
}[];

const KNOWN: Record<string, { code: string; dollars: "one-to-one" | "quoted" }> =
  Object.fromEntries(
    PRIZE_ASSETS.map((asset) => [asset.contract, { code: asset.code, dollars: asset.dollars }]),
  );

export interface Worth {
  /** The token's own symbol, or a shortened address when it is not one we know. */
  code: string;
  /** In dollars, or absent when no honest figure is available. */
  dollars: number | null;
}

/**
 * The lumen price, fetched once and remembered for a while.
 *
 * Cached in the module rather than per request, because every card on a page
 * asks and the answer is the same for all of them. Fifteen minutes, because a
 * prize is a decision somebody makes over a weekend and a fresher number would
 * not change it.
 */
let quoted: { price: number; at: number } | null = null;
const QUOTE_TTL_MS = 15 * 60 * 1000;

export async function lumenPrice(): Promise<number | null> {
  if (quoted !== null && Date.now() - quoted.at < QUOTE_TTL_MS) {
    return quoted.price;
  }

  try {
    /* A short timeout. This is a nicety on a page whose real content is on
       chain, and it must never be the reason a listing is slow. */
    const answer = await fetch(
      "https://api.coinbase.com/v2/prices/XLM-USD/spot",
      { signal: AbortSignal.timeout(2_000), next: { revalidate: 900 } },
    );

    if (!answer.ok) {
      return null;
    }

    const said = (await answer.json()) as { data?: { amount?: string } };
    const price = Number(said.data?.amount);

    if (!Number.isFinite(price) || price <= 0) {
      return null;
    }

    quoted = { price, at: Date.now() };

    return price;
  } catch {
    return null;
  }
}

/** What one prize is worth, given the asset the rules name and the amount. */
export async function worthOf(asset: string | null, amount: bigint | null): Promise<Worth> {
  const known = asset === null ? undefined : KNOWN[asset];

  const code =
    known?.code ?? (asset === null ? "tokens" : `${asset.slice(0, 4)}…${asset.slice(-4)}`);

  if (amount === null || known === undefined) {
    return { code, dollars: null };
  }

  /* Seven decimals is the Stellar convention and both assets here use it. */
  const units = Number(amount) / 10_000_000;

  if (known.dollars === "one-to-one") {
    return { code, dollars: units };
  }

  const price = await lumenPrice();

  return { code, dollars: price === null ? null : units * price };
}

/**
 * A prize as one figure, in the currency somebody thinks in.
 *
 * Dollars lead. A reader comparing five hackathons is comparing what they are
 * worth, and ten thousand of a token they have never held is not a number they
 * can weigh; the token follows so they still know what they would be paid in.
 *
 * A dollar stablecoin is already the answer, so it says "500 USDC" rather than
 * converting a dollar into a dollar and printing it twice.
 */
export function prizeLabel(worth: Worth, amount: bigint | null): { figure: string; code: string } {
  if (worth.code === "USDC" && amount !== null) {
    return { figure: round(Number(amount) / 10_000_000), code: "USDC" };
  }

  if (worth.dollars !== null) {
    return { figure: `${round(worth.dollars)}$`, code: worth.code };
  }

  /* No honest conversion, so the token amount stands on its own rather than
     being dressed up as money nobody quoted. */
  return {
    figure: amount === null ? "—" : round(Number(amount) / 10_000_000),
    code: worth.code,
  };
}

/**
 * Whole numbers wherever a whole number is honest.
 *
 * A prize is compared, not audited, and "$1,247.38" is harder to weigh against
 * its neighbour than "$1,247". The exception is an amount small enough that
 * rounding it would print zero, which reads as free.
 */
function round(value: number): string {
  if (value >= 1) {
    return Math.round(value).toLocaleString("en-US");
  }

  return value < 0.01 ? "<0.01" : value.toFixed(2);
}

/**
 * A token amount in its seven decimals, written the way a person would.
 *
 * The fraction is kept when there is one. Rounding to whole units printed a
 * prize of ten thousand stroops as "0", which is the one number on a funding
 * screen that must never read as nothing when it is not.
 */
export function units(amount: bigint): string {
  const scale = BigInt(10_000_000);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(7, "0").replace(/0+$/, "");

  return fraction.length === 0
    ? whole.toLocaleString("en-US")
    : `${whole.toLocaleString("en-US")}.${fraction}`;
}
