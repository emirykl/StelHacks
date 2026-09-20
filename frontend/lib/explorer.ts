/**
 * Which stellar.expert an address on this deployment lives on.
 *
 * Read from the passphrase rather than named separately, because those are the
 * same fact and a deployment pointed at one network while linking to the other
 * would send every reader to a page saying the contract does not exist.
 *
 * It was written out twice, in the hackathon's own facts panel and in the
 * organizer console. A third caller is the moment two copies become a thing
 * somebody will change in one place.
 */

const network =
  process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"] ===
  "Public Global Stellar Network ; September 2015"
    ? "public"
    : "testnet";

export const EXPLORER = network;

/** Where to look one up. `kind` is the explorer's own word: contract, account. */
export function explorerFor(kind: "contract" | "account" | "tx", value: string): string {
  return `https://stellar.expert/explorer/${network}/${kind}/${value}`;
}

/**
 * Whether a string is shaped like a Soroban contract id.
 *
 * Shape only. A well formed id for a contract that was never deployed passes
 * here and fails at the explorer, which is the right place for it to fail: this
 * runs in a form, and a form should not go to the network to tell somebody they
 * have typed something the wrong length.
 */
export function looksLikeContract(value: string): boolean {
  return /^C[A-Z2-7]{55}$/.test(value);
}
