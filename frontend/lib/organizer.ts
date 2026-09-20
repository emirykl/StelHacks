/**
 * Deciding whether somebody may rewrite a hackathon's description.
 *
 * Kept apart from the route that uses it for the same reason the verdict rules
 * are kept apart from the network: this is an authorisation check, and the ways
 * it can be wrong are all silent. A check that accepts one signature too many
 * lets a stranger rewrite somebody's hackathon; one that accepts too few locks
 * an organizer out of their own. Neither shows up as an error anywhere.
 *
 * Three things are bound into what gets signed and each closes a way a
 * signature could be reused:
 *
 *   the contract, so one made for a hackathon is not accepted for another
 *   the account, so one captured from another session is refused here
 *   the time, so one captured at all stops working shortly afterwards
 *
 * There is no nonce. A nonce means nothing unless the server remembers which it
 * has seen, and that is a table for a signature already bound to an account and
 * a five minute window. This is the weaker guarantee and it is the one being
 * made rather than implied.
 */

/** How long a signed challenge is worth anything, in seconds. */
export const WINDOW_SECONDS = 300;

export function challengeFor(
  contract: string,
  account: string,
  issuedAt: number,
  /**
   * What the signature is for.
   *
   * Named in the message so one cannot be replayed as another. A signature
   * proving somebody holds the organizer's key long enough to edit an event
   * page should not also be a signature that names a team.
   */
  purpose: "metadata" | "team" = "metadata",
): string {
  return `stelhacks.v1.${purpose}:${contract}:${account}:${issuedAt}`;
}

/**
 * Whether a challenge is still inside its window.
 *
 * Both directions. A challenge dated in the future is as suspect as an old one,
 * and a clock nobody bounds is a window nobody closes.
 */
export function timely(issuedAt: number, now = Math.floor(Date.now() / 1000)): boolean {
  if (!Number.isFinite(issuedAt)) {
    return false;
  }

  const age = now - issuedAt;

  return age <= WINDOW_SECONDS && age >= -WINDOW_SECONDS;
}

/**
 * Whether the signature is the organizer's, under SEP-53.
 *
 * The same construction a wallet uses: the message is prefixed, hashed, and the
 * digest is what the signature covers. Verifying anything else would accept a
 * signature no wallet could have produced, or refuse every one they do.
 */
export async function signedByOrganizer({
  organizer,
  contract,
  account,
  issuedAt,
  signature,
  purpose = "metadata",
  now,
}: {
  /** The address the signature has to have come from. */
  organizer: string;
  contract: string;
  account: string;
  issuedAt: number;
  /** Hex. */
  signature: string;
  purpose?: "metadata" | "team";
  now?: number;
}): Promise<boolean> {
  const { Keypair, StrKey, hash } = await import("@stellar/stellar-sdk/base");

  if (!StrKey.isValidEd25519PublicKey(organizer)) {
    return false;
  }

  if (!timely(issuedAt, now)) {
    return false;
  }

  const message = challengeFor(contract, account, issuedAt, purpose);
  const payload = hash(Buffer.from(`Stellar Signed Message:\n${message}`, "utf8"));

  try {
    return Keypair.fromPublicKey(organizer).verify(
      Buffer.from(payload),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}
