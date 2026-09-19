/**
 * Connecting a wallet, and proving it is yours.
 *
 * Two separate things happen here and conflating them is the usual mistake.
 * Connecting tells this page an address. It proves nothing: any page can be
 * handed any string. Proving is the signature over a challenge the server
 * issued, and only that is allowed to create a `wallet_links` row.
 *
 * So nothing in this file writes anything. It returns an address and a
 * signature, and the server decides whether they mean what they claim.
 */

const network = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

/** What a wallet is, as far as the rest of the app is concerned. */
export interface Connection {
  address: string;
  /** Which wallet answered, for showing back to the person who picked it. */
  wallet: string;
}

/**
 * The kit is loaded on demand, and never during a render.
 *
 * It brings its own UI runtime with it, so a visitor reading a hackathon page
 * should not pay for it. It is also strictly a browser thing: it reaches for
 * `window` on construction, which is why there is no module level instance.
 */
let started = false;

async function kit() {
  const [{ StellarWalletsKit }, { Networks }, { FreighterModule }, { xBullModule }, { LobstrModule }, { AlbedoModule }] =
    await Promise.all([
      import("@creit.tech/stellar-wallets-kit"),
      import("@creit.tech/stellar-wallets-kit/types"),
      import("@creit.tech/stellar-wallets-kit/modules/freighter"),
      import("@creit.tech/stellar-wallets-kit/modules/xbull"),
      import("@creit.tech/stellar-wallets-kit/modules/lobstr"),
      import("@creit.tech/stellar-wallets-kit/modules/albedo"),
    ]);

  if (!started) {
    /* Named one by one rather than through the kit's "every module" helper.
       That helper drags in WalletConnect, Ledger, Trezor and Coinbase, which
       is a lot of browser to ship for wallets nobody here has asked for. Four
       covers the extension, the mobile and the hardware-free cases; a fifth is
       one line. */
    StellarWalletsKit.init({
      modules: [
        new FreighterModule(),
        new xBullModule(),
        new LobstrModule(),
        new AlbedoModule(),
      ],
      network:
        network === "Public Global Stellar Network ; September 2015"
          ? Networks.PUBLIC
          : Networks.TESTNET,
    });

    started = true;
  }

  return StellarWalletsKit;
}

/**
 * Open the picker and return whatever the person chose, or nothing.
 *
 * Closing the picker is not a failure, so it comes back as `null` rather than
 * as an exception the caller has to recognise. The first version of this told
 * the two apart by looking for words in the message, which broke the moment
 * the wording changed and put `[object Object]` on the page.
 */
export async function connect(): Promise<Connection | null> {
  const instance = await kit();

  try {
    const { address } = await instance.authModal();
    return { address, wallet: instance.selectedModule.productName };
  } catch (thrown) {
    if (cancelled(thrown)) {
      return null;
    }

    throw new Error(explain(thrown));
  }
}

/**
 * The kit rejects with a plain object, not an `Error`.
 *
 * `{ code, message }`, where `-1` is the person closing the picker. Nothing in
 * the type signatures says so, so both of these read the shape defensively: a
 * wallet extension that answers in some third way should still produce a
 * sentence rather than `[object Object]`.
 */
function cancelled(thrown: unknown): boolean {
  return (
    typeof thrown === "object" &&
    thrown !== null &&
    "code" in thrown &&
    (thrown as { code: unknown }).code === -1
  );
}

function explain(thrown: unknown): string {
  if (thrown instanceof Error) {
    return thrown.message;
  }

  if (typeof thrown === "object" && thrown !== null && "message" in thrown) {
    const said = (thrown as { message: unknown }).message;

    if (typeof said === "string" && said.length > 0) {
      return said;
    }
  }

  return "your wallet refused without saying why";
}

/**
 * Sign the server's challenge.
 *
 * The wallet signs a plain message rather than a transaction, because nothing
 * is being submitted: this is an assertion about who holds a key, and dressing
 * it up as a transaction would ask somebody to approve something that looks
 * like it moves money when it does not.
 */
export async function proveAddress(address: string, challenge: string): Promise<string> {
  const instance = await kit();

  try {
    const { signedMessage } = await instance.signMessage(challenge, { address });
    return signedMessage;
  } catch (thrown) {
    throw new Error(explain(thrown));
  }
}
