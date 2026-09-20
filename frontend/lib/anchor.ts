/**
 * Turning a prize into money somebody can spend.
 *
 * The contracts pay a winner in whatever token the constitution named, and
 * there the product used to stop. What the winner then did with that balance
 * was their problem: an exchange, a KYC queue, a bank transfer, days. The prize
 * was verifiable and unspendable, which is half a promise.
 *
 * An anchor is the other half. It issues a Stellar asset against real money and
 * redeems it back, so a winner can hand back what they were paid and take fiat.
 * We are the client side of that: nothing here holds anybody's money, sees a
 * document, or decides who may withdraw. The anchor does all of it, and the
 * only thing crossing our boundary is a URL we open and a status we poll.
 *
 * Nothing about which anchor is written down. Every endpoint comes out of the
 * anchor's own `stellar.toml`, so pointing this at a different one is a change
 * of domain and nothing else. That matters more than it looks: the anchor this
 * ships against will not be the anchor it was written against.
 */

const passphrase = process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"];

/** The anchor's home domain. The only thing about it we are told. */
export const ANCHOR_DOMAIN = process.env["NEXT_PUBLIC_ANCHOR_DOMAIN"];

/** What an anchor says it can do, read from its own file. */
export interface Anchor {
  domain: string;
  /** SEP-10, where a wallet proves it holds an address. */
  auth: string;
  /** SEP-24, where a transfer is started. */
  transfer: string;
  /** The key whose signature makes a challenge genuine. */
  signingKey: string;
  currencies: { code: string; issuer: string | null }[];
}

/**
 * Read an anchor's `stellar.toml` and keep only what a client needs.
 *
 * Parsed by hand rather than with a TOML library. The file is a flat list of
 * keys and a repeated `[[CURRENCIES]]` table, and the alternative is shipping a
 * parser to read eight lines. If an anchor ever needs more than this, that is
 * the moment to add the dependency rather than now.
 */
export async function discover(domain: string): Promise<Anchor> {
  /*
    Shape checked before it reaches a URL.

    This is the only place a hostname enters a request, and the value should
    only ever be the configured one. Checking it here means a caller that one
    day reads a domain off a query string cannot turn that into a fetch to an
    arbitrary host, and cannot smuggle a path or a port past the template with
    a slash or a colon.
  */
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) {
    throw new Error("that is not a domain");
  }

  const answer = await fetch(`https://${domain}/.well-known/stellar.toml`);

  if (!answer.ok) {
    throw new Error(`${domain} published no stellar.toml`);
  }

  const toml = await answer.text();
  const one = (key: string) => /^\s*([^"']+)["']?/.exec(value(toml, key) ?? "")?.[1]?.trim() ?? null;

  const auth = one("WEB_AUTH_ENDPOINT");
  const transfer = one("TRANSFER_SERVER_SEP0024");
  const signingKey = one("SIGNING_KEY");

  if (auth === null || transfer === null || signingKey === null) {
    throw new Error(`${domain} does not offer hosted withdrawals`);
  }

  /* Checked rather than assumed. An anchor on the other network issues assets
     this deployment cannot hold, and the failure without this check happens
     three steps later inside somebody's wallet. */
  const theirs = one("NETWORK_PASSPHRASE");

  if (theirs !== null && passphrase !== undefined && theirs !== passphrase) {
    throw new Error(`${domain} is on a different network`);
  }

  return { domain, auth, transfer, signingKey, currencies: currencies(toml) };
}

function value(toml: string, key: string): string | null {
  const found = new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, "m").exec(toml);

  return found?.[1]?.replace(/^["']|["'].*$/g, "") ?? null;
}

function currencies(toml: string): { code: string; issuer: string | null }[] {
  return toml
    .split(/\[\[CURRENCIES\]\]/)
    .slice(1)
    .map((block) => ({
      code: value(block, "code") ?? "",
      issuer: value(block, "issuer"),
    }))
    .filter((one) => one.code.length > 0);
}

/**
 * Prove to the anchor that this browser holds the address, and get a token.
 *
 * SEP-10. The anchor builds a transaction that can never be submitted — its
 * sequence number is zero — and asks the wallet to sign it. Signing it proves
 * the key without spending anything or authorising anything.
 *
 * The signature comes from the same wallet kit the rest of the product signs
 * with, so a person who has already connected does not meet a second, different
 * idea of what their wallet is.
 *
 * What comes back is a bearer token: whoever holds it is the account, for as
 * long as it lasts. It is returned rather than stored, and callers are to keep
 * it in memory and let it die with the page. Putting it in local storage would
 * put it within reach of any script that ever runs on this origin, to buy back
 * a signature that takes one press.
 */
export async function authenticate(anchor: Anchor, address: string): Promise<string> {
  const asked = await fetch(`${anchor.auth}?account=${address}`);

  if (!asked.ok) {
    throw new Error(`${anchor.domain} refused to start: ${asked.status}`);
  }

  const { transaction, network_passphrase: theirs } = (await asked.json()) as {
    transaction?: string;
    network_passphrase?: string;
  };

  if (transaction === undefined) {
    throw new Error(`${anchor.domain} sent no challenge`);
  }

  await check(anchor, transaction, address, theirs ?? passphrase);

  const { signTransaction } = await import("./wallet");
  const signed = await signTransaction(transaction);

  const answered = await fetch(anchor.auth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: signed }),
  });

  if (!answered.ok) {
    throw new Error(`${anchor.domain} rejected the signature: ${answered.status}`);
  }

  const { token } = (await answered.json()) as { token?: string };

  if (token === undefined) {
    throw new Error(`${anchor.domain} sent no token`);
  }

  return token;
}

/**
 * Read the challenge before signing it, rather than after.
 *
 * A wallet is about to be asked to sign something a third party wrote, and the
 * person pressing the button cannot read XDR. Three things make a challenge
 * safe and all three are checkable here: it is signed by the key the anchor
 * published, it names the address we are proving, and its sequence number is
 * zero so it can never be submitted as a real transaction.
 *
 * Without this, an anchor whose domain was mistyped could hand back a genuine
 * payment and the wallet would present it as a login.
 */
async function check(
  anchor: Anchor,
  xdr: string,
  address: string,
  theirs: string | undefined,
): Promise<void> {
  const { TransactionBuilder, Transaction, Keypair } = await import("@stellar/stellar-sdk/base");

  const built = TransactionBuilder.fromXDR(xdr, theirs ?? "");

  if (!(built instanceof Transaction)) {
    throw new Error("that challenge is a fee bump, which SEP-10 does not use");
  }

  const tx = built;

  if (tx.sequence !== "0") {
    throw new Error("that challenge could be submitted as a real transaction");
  }

  const hash = tx.hash();

  const signed = tx.signatures.some((entry) => {
    try {
      return Keypair.fromPublicKey(anchor.signingKey).verify(hash, signatureBytes(entry));
    } catch {
      return false;
    }
  });

  if (!signed) {
    throw new Error(`that challenge was not signed by ${anchor.domain}`);
  }

  /* The first operation names whose key is being proved. An anchor that named
     somebody else would be asking this wallet to vouch for another account. */
  const first = tx.operations[0];

  if (first === undefined || first.type !== "manageData" || first.source !== address) {
    throw new Error("that challenge is for a different account");
  }

  /*
    And it names the anchor, which is the half that catches a replay.

    SEP-10 puts `<home domain> auth` in that operation's key. Without checking
    it, a challenge the anchor signed for one domain it serves could be
    presented as a login to another, and the signature check above would pass
    because it really is their signature. The domain is what the person thought
    they were signing into.
  */
  if (first.name !== `${anchor.domain} auth`) {
    throw new Error(`that challenge is not for ${anchor.domain}`);
  }
}

/**
 * The 64 signature bytes out of what the SDK hands back.
 *
 * Version 17 puts a js-xdr wrapper in `signatures` rather than the class that
 * used to be there, so `signature` is a field holding an opaque value, not a
 * method returning bytes. Its `toXDR()` is the XDR encoding of a variable
 * length opaque: a four byte big endian length, then that many bytes.
 *
 * Read through the length rather than sliced at a constant. The constant would
 * be 4 and 68 and would be right today, and the next reader would have no way
 * to tell whether those were the format or somebody's measurement.
 */
function signatureBytes(entry: unknown): Buffer {
  const encoded = Buffer.from(
    (entry as { signature: { toXDR(): Uint8Array } }).signature.toXDR(),
  );

  return encoded.subarray(4, 4 + encoded.readUInt32BE(0));
}

/** Where a withdrawal has got to, in the anchor's own words. */
export interface Transfer {
  id: string;
  status: string;
  /** The page the person completes the transfer in. Opened, never scraped. */
  url?: string;
  /** Where to send the asset once the anchor is ready for it. */
  withdrawAnchorAccount?: string;
  withdrawMemo?: string;
  withdrawMemoType?: string;
  amountIn?: string;
  amountOut?: string;
  message?: string;
}

/**
 * Start a withdrawal and get the page the person finishes it on.
 *
 * SEP-24 is the hosted flow on purpose. Identity documents, bank details and
 * whatever a regulator asks for stay between the person and the anchor, in the
 * anchor's own page. This product never sees them and could not leak what it
 * does not hold.
 */
export async function startWithdraw(
  anchor: Anchor,
  token: string,
  assetCode: string,
  account: string,
  amount?: string,
): Promise<Transfer> {
  const started = await fetch(`${anchor.transfer}/transactions/withdraw/interactive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      asset_code: assetCode,
      account,
      lang: "en",
      ...(amount === undefined ? {} : { amount }),
    }),
  });

  if (!started.ok) {
    throw new Error(`${anchor.domain} refused the withdrawal: ${(await started.text()).slice(0, 200)}`);
  }

  const { id, url } = (await started.json()) as { id?: string; url?: string };

  if (id === undefined || url === undefined) {
    throw new Error(`${anchor.domain} started nothing`);
  }

  return { id, status: "incomplete", url };
}

/**
 * Ask the anchor where a transfer has got to.
 *
 * Polled rather than pushed, because the alternative is an endpoint on our side
 * that anybody could call to claim a transfer had completed. The anchor is the
 * authority on its own transfers and asking it directly is the only answer that
 * cannot be forged.
 */
export async function readTransfer(
  anchor: Anchor,
  token: string,
  id: string,
): Promise<Transfer> {
  const asked = await fetch(`${anchor.transfer}/transaction?id=${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!asked.ok) {
    throw new Error(`${anchor.domain} would not say: ${asked.status}`);
  }

  const { transaction } = (await asked.json()) as { transaction?: Record<string, unknown> };

  if (transaction === undefined) {
    throw new Error("the anchor has no such transfer");
  }

  return {
    id: String(transaction["id"]),
    status: String(transaction["status"]),
    withdrawAnchorAccount: text(transaction["withdraw_anchor_account"]),
    withdrawMemo: text(transaction["withdraw_memo"]),
    withdrawMemoType: text(transaction["withdraw_memo_type"]),
    amountIn: text(transaction["amount_in"]),
    amountOut: text(transaction["amount_out"]),
    message: text(transaction["message"]),
  };
}

/**
 * The statuses that mean stop asking.
 *
 * Named here rather than compared inline, because "is it finished" is asked in
 * three places and a poll that does not know when to stop is a poll that runs
 * until the tab closes.
 */
export function settled(status: string): boolean {
  return ["completed", "refunded", "expired", "error"].includes(status);
}

/** The one status that is our turn: the anchor is waiting to be paid. */
export function awaitingTransfer(status: string): boolean {
  return status === "pending_user_transfer_start";
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
