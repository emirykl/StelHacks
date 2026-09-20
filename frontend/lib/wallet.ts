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
  /** The kit's id for that wallet, which is how we find its icon. */
  id: string;
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
    const module = instance.selectedModule;

    return { address, wallet: module.productName, id: module.productId };
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
 * The address the kit already has, without opening anything.
 *
 * The kit keeps the last connected address in local storage, so somebody who
 * connected on the account page and then navigated is still connected. Reading
 * it back is what lets the header say so on every page rather than only on the
 * one where the button was pressed.
 */
export async function restore(): Promise<Connection | null> {
  const instance = await kit();

  try {
    const { address } = await instance.getAddress();

    if (address.length === 0) {
      return null;
    }

    const module = instance.selectedModule;

    return { address, wallet: module.productName, id: module.productId };
  } catch {
    /* No wallet selected yet. Not a failure: it is the ordinary state of
       somebody who has never connected. */
    return null;
  }
}

/** Forget the wallet, on this site only. The wallet itself is untouched. */
export async function disconnect(): Promise<void> {
  const instance = await kit();
  await instance.disconnect();
}

/**
 * Watch for the address changing underneath us.
 *
 * Somebody can switch accounts inside their wallet extension without touching
 * this page, and a header still showing the old address would be quietly
 * wrong about which key is about to sign something.
 */
export async function watch(onChange: (address: string | undefined) => void): Promise<() => void> {
  const [instance, { KitEventType }] = await Promise.all([
    kit(),
    import("@creit.tech/stellar-wallets-kit/types"),
  ]);

  const stopState = instance.on(KitEventType.STATE_UPDATED, (event) => {
    onChange(event.payload.address);
  });

  const stopDisconnect = instance.on(KitEventType.DISCONNECT, () => {
    onChange(undefined);
  });

  return () => {
    stopState();
    stopDisconnect();
  };
}

/**
 * Which network the wallet itself is pointed at.
 *
 * Asked rather than assumed, because a wallet extension has its own network
 * setting and nothing keeps it in step with this deployment's. Signing across
 * that mismatch fails somewhere deep in whichever library notices first, with a
 * message about stacks or bytes rather than about the one thing that is wrong.
 */
export async function walletNetwork(): Promise<string | null> {
  try {
    const instance = await kit();

    return (await instance.getNetwork()).networkPassphrase;
  } catch {
    /* A wallet that will not say is not evidence of a mismatch, and refusing to
       go on because of one would be worse than the mismatch. */
    return null;
  }
}

/** Whether the wallet and this deployment are on the same network. */
export async function onTheSameNetwork(): Promise<boolean> {
  const theirs = await walletNetwork();

  return theirs === null || network === undefined || theirs === network;
}

/**
 * Hand a built transaction to the wallet and get the signed bytes back.
 *
 * The kit talks to the extension; nothing here sees a key. What comes back is
 * an envelope with a signature on it, ready to submit.
 */
export async function signTransaction(xdr: string): Promise<string> {
  const instance = await kit();

  try {
    const { signedTxXdr } = await instance.signTransaction(xdr, {
      networkPassphrase: network,
    });

    return signedTxXdr;
  } catch (thrown) {
    throw new Error(explain(thrown));
  }
}

/**
 * Sign one address's half of a call that needs two signatures.
 *
 * `add_member` requires the captain and the joiner to authorize the same
 * invocation, and they are never at the same keyboard. Soroban's answer is that
 * each address signs its own authorization entry, so the one who is not
 * submitting can sign theirs early and hand it over.
 *
 * What comes back carries a signature expiration ledger, which is what makes a
 * request go stale rather than sit there forever. The surface that stores one is
 * responsible for saying so when it lapses.
 */
export async function signAuthEntry(xdr: string): Promise<string> {
  const instance = await kit();

  try {
    const { signedAuthEntry } = await instance.signAuthEntry(xdr, {
      networkPassphrase: network,
    });

    return signedAuthEntry;
  } catch (thrown) {
    throw new Error(explain(thrown));
  }
}

/**
 * A wallet's signature in the encoding the server verifies.
 *
 * Wallets hand back base64 and `signedByOrganizer` reads hex, and each new
 * caller was converting on its own or, twice, forgetting to. A signature in the
 * wrong encoding fails as "not the organizer", which is the same message a
 * forgery gets, so the mistake is invisible until somebody wonders why their
 * team has no name.
 */
export async function proveAddressHex(address: string, challenge: string): Promise<string> {
  const raw = atob(await proveAddress(address, challenge));
  let out = "";

  for (let index = 0; index < raw.length; index += 1) {
    out += raw.charCodeAt(index).toString(16).padStart(2, "0");
  }

  return out;
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
