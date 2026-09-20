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
const rpcUrl = process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];

/** The anchor's home domain. The only thing about it we are told. */
export const ANCHOR_DOMAIN = process.env["NEXT_PUBLIC_ANCHOR_DOMAIN"];

/**
 * What an anchor says it can do, read from its own file.
 *
 * Two ways to withdraw and an anchor may publish either. SEP-24 hosts the whole
 * thing on the anchor's own page; SEP-6 hands back an account and a memo and
 * leaves the rest to the client. Which one is not our choice, so both are read
 * and the caller uses whichever is there.
 */
export interface Anchor {
  domain: string;
  /** SEP-10, where a wallet proves it holds an address. */
  auth: string;
  /** SEP-24, the hosted flow. Absent on an anchor that only speaks SEP-6. */
  hosted?: string;
  /** SEP-6, the programmatic flow. Absent on an anchor that only speaks SEP-24. */
  direct?: string;
  /** SEP-12, where a customer is registered. Only SEP-6 needs it. */
  kyc?: string;
  /** SEP-38, where a rate is quoted. What turns an amount into a local one. */
  quotes?: string;
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
  const hosted = one("TRANSFER_SERVER_SEP0024");
  const direct = one("TRANSFER_SERVER");
  const signingKey = one("SIGNING_KEY");

  if (auth === null || signingKey === null || (hosted === null && direct === null)) {
    throw new Error(`${domain} does not offer withdrawals`);
  }

  /* Checked rather than assumed. An anchor on the other network issues assets
     this deployment cannot hold, and the failure without this check happens
     three steps later inside somebody's wallet. */
  const theirs = one("NETWORK_PASSPHRASE");

  if (theirs !== null && passphrase !== undefined && theirs !== passphrase) {
    throw new Error(`${domain} is on a different network`);
  }

  return {
    domain,
    auth,
    signingKey,
    currencies: currencies(toml),
    ...(hosted === null ? {} : { hosted }),
    ...(direct === null ? {} : { direct }),
    ...(one("KYC_SERVER") === null ? {} : { kyc: one("KYC_SERVER")! }),
    ...(one("ANCHOR_QUOTE_SERVER") === null ? {} : { quotes: one("ANCHOR_QUOTE_SERVER")! }),
  };
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
  if (anchor.hosted === undefined) {
    throw new Error(`${anchor.domain} does not host withdrawals`);
  }

  const started = await fetch(`${anchor.hosted}/transactions/withdraw/interactive`, {
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
  const asked = await fetch(`${where(anchor)}/transaction?id=${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!asked.ok) {
    throw new Error(`${anchor.domain} would not say: ${asked.status}`);
  }

  const { transaction } = (await asked.json()) as { transaction?: Record<string, unknown> };

  if (transaction === undefined) {
    throw new Error("the anchor has no such transfer");
  }

  return shape(transaction);
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


/**
 * Every transfer this account has with this anchor.
 *
 * How a person who closed the tab picks up where they left off. The alternative
 * was a table of our own holding transfer ids, and this is better than that in
 * the way that matters: the anchor is the authority on its own transfers, so
 * asking it cannot go stale, cannot disagree with itself, and cannot be edited
 * by anybody who reaches our database.
 */
export async function listTransfers(
  anchor: Anchor,
  token: string,
  assetCode: string,
): Promise<Transfer[]> {
  const asked = await fetch(
    `${where(anchor)}/transactions?asset_code=${encodeURIComponent(assetCode)}&kind=withdrawal`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!asked.ok) {
    return [];
  }

  const { transactions } = (await asked.json()) as { transactions?: Record<string, unknown>[] };

  return (transactions ?? []).map(shape);
}

/**
 * Pay the anchor what it is waiting for, so it can pay out.
 *
 * This is the one step where the money actually leaves, and the one place a
 * mistake cannot be undone. The anchor names an account, a memo and an amount;
 * a payment to the right account with the wrong memo is a payment the anchor
 * cannot match to anybody, and it is gone.
 *
 * So nothing here is trusted as it arrives. The destination is checked to be an
 * account, the amount to be a positive decimal, the memo to be one of the three
 * kinds the standard defines, and the whole thing is refused unless the anchor
 * has actually said it is waiting. Those are not defensive habits: this reads
 * values off a third party's HTTP response and turns them into an irreversible
 * transfer.
 */
export async function completeWithdraw(
  transfer: Transfer,
  asset: { code: string; issuer: string } | "native",
  from: string,
): Promise<{ ok: true; hash: string } | { ok: false; why: string; refused: boolean }> {
  if (!awaitingTransfer(transfer.status)) {
    return { ok: false, why: "the anchor is not waiting for a transfer yet", refused: false };
  }

  const to = transfer.withdrawAnchorAccount;
  const amount = transfer.amountIn;

  if (to === undefined || !/^G[A-Z2-7]{55}$/.test(to)) {
    return { ok: false, why: "the anchor named no account to pay", refused: false };
  }

  /* Seven decimal places, which is what the ledger holds. More than that is not
     a rounding question, it is a value this cannot send faithfully. */
  if (amount === undefined || !/^\d+(\.\d{1,7})?$/.test(amount) || Number(amount) <= 0) {
    return { ok: false, why: "the anchor named no amount to send", refused: false };
  }

  /*
    The memo is checked here, with the rest of what the anchor said, rather than
    where it is built further down.

    It used to be validated after the network configuration was, which made the
    test for it pass on a machine that simply had no RPC configured — the guard
    was never reached and nobody could tell. Everything the anchor sent is now
    judged before anything about this deployment is.
  */
  const memoType = transfer.withdrawMemoType;

  if (
    memoType !== undefined &&
    memoType !== "text" &&
    memoType !== "id" &&
    memoType !== "hash"
  ) {
    return { ok: false, why: "the anchor asked for a memo this cannot write", refused: false };
  }

  /* No memo at all is legitimate — some anchors give each person their own
     account. A memo with no type saying how to write it is not, and sending it
     as the wrong kind puts the wrong bytes in the transaction. */
  if (memoType === undefined && transfer.withdrawMemo !== undefined) {
    return { ok: false, why: "the anchor sent a memo without saying its kind", refused: false };
  }

  if (rpcUrl === undefined || passphrase === undefined) {
    return { ok: false, why: "this deployment is not pointed at a network", refused: false };
  }

  try {
    const [{ Asset, BASE_FEE, Memo, Operation, TransactionBuilder }, rpc, { signTransaction }] =
      await Promise.all([
        import("@stellar/stellar-sdk/base"),
        import("@stellar/stellar-sdk/rpc"),
        import("./wallet"),
      ]);

    const memo =
      memoType === "hash"
        ? Memo.hash(Buffer.from(transfer.withdrawMemo ?? "", "base64").toString("hex"))
        : memoType === "id"
          ? Memo.id(transfer.withdrawMemo ?? "")
          : memoType === "text"
            ? Memo.text(transfer.withdrawMemo ?? "")
            : Memo.none();

    const server = new rpc.Server(rpcUrl);
    const account = await server.getAccount(from);

    const built = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
      .addOperation(
        Operation.payment({
          destination: to,
          asset: asset === "native" ? Asset.native() : new Asset(asset.code, asset.issuer),
          amount,
        }),
      )
      .addMemo(memo)
      .setTimeout(180)
      .build();

    const signed = await signTransaction(built.toXDR());
    const sent = await server.sendTransaction(TransactionBuilder.fromXDR(signed, passphrase));

    if (sent.status === "ERROR") {
      return { ok: false, why: String(JSON.stringify(sent.errorResult)).slice(0, 160), refused: false };
    }

    const settled = await server.pollTransaction(sent.hash, {
      attempts: 30,
      sleepStrategy: () => 1000,
    });

    if (settled.status !== "SUCCESS") {
      return { ok: false, why: `the network returned ${settled.status}`, refused: false };
    }

    return { ok: true, hash: sent.hash };
  } catch (thrown) {
    const said = thrown instanceof Error ? thrown.message : String(thrown);

    return {
      ok: false,
      why: said.slice(0, 160),
      refused: /reject|denied|declined|cancel|user closed/i.test(said),
    };
  }
}


/**
 * Which server answers about transfers.
 *
 * Both standards serve `/transaction` and `/transactions` the same way, so
 * reading a transfer's progress does not care which one opened it. Only the
 * opening differs, and that is the one place the two are told apart.
 */
function where(anchor: Anchor): string {
  return anchor.hosted ?? anchor.direct ?? "";
}

/**
 * Register the person with the anchor, which SEP-6 requires and SEP-24 does not.
 *
 * The hosted flow collects identity on the anchor's own page and this product
 * never sees it. The programmatic one has no such page, so whatever the anchor
 * asks for is asked for here — and what it asks for is read from the anchor
 * rather than assumed, because it varies by country and by anchor and changes
 * without warning.
 *
 * What is sent is only what the caller passed. Nothing is collected that the
 * anchor did not name, and nothing is kept after it is sent: this is a relay,
 * not a record.
 */
export async function register(
  anchor: Anchor,
  token: string,
  address: string,
  fields: Record<string, string> = {},
): Promise<void> {
  if (anchor.kyc === undefined) {
    return;
  }

  const answered = await fetch(`${anchor.kyc}/customer`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ account: address, ...fields }),
  });

  if (!answered.ok) {
    throw new Error(`${anchor.domain} would not register this account`);
  }
}

/**
 * What the anchor still needs before it will pay out.
 *
 * Asked rather than guessed. An empty list is a real answer and the common one
 * in a sandbox; a list with entries is the form somebody has to fill in, and it
 * belongs to the anchor rather than to us.
 */
export async function missingFields(
  anchor: Anchor,
  token: string,
  address: string,
): Promise<string[]> {
  if (anchor.kyc === undefined) {
    return [];
  }

  const asked = await fetch(`${anchor.kyc}/customer?account=${address}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!asked.ok) {
    return [];
  }

  const { status, fields } = (await asked.json()) as {
    status?: string;
    fields?: Record<string, { optional?: boolean }>;
  };

  if (status === "ACCEPTED") {
    return [];
  }

  return Object.entries(fields ?? {})
    .filter(([, field]) => field.optional !== true)
    .map(([name]) => name);
}

/**
 * Open a withdrawal the programmatic way.
 *
 * No page to send anybody to: the anchor answers with the account and memo to
 * pay, and the payment is the whole of the rest. `completeWithdraw` takes it
 * from here unchanged, because what it validates is the same three values
 * whichever standard produced them.
 */
export async function startDirectWithdraw(
  anchor: Anchor,
  token: string,
  assetCode: string,
  amount: string,
): Promise<Transfer> {
  if (anchor.direct === undefined) {
    throw new Error(`${anchor.domain} does not offer direct withdrawals`);
  }

  /* The amount is not sent, and that is not an omission. An anchor asked
     without one answers with an account that takes whatever arrives, which is
     what a prize is: a number nobody chose. Asked with one, it holds us to a
     figure this page would have had to invent. */
  const asked = await fetch(
    `${anchor.direct}/withdraw?asset_code=${encodeURIComponent(assetCode)}&type=bank_account`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!asked.ok) {
    throw new Error(`${anchor.domain} refused the withdrawal: ${(await asked.text()).slice(0, 200)}`);
  }

  const opened = (await asked.json()) as Record<string, unknown>;
  const id = text(opened["id"]);

  if (id === undefined) {
    throw new Error(`${anchor.domain} started nothing`);
  }

  /*
    Reported as already waiting, because it is.

    SEP-6 hands back the account and the memo in this same answer rather than
    moving through `incomplete` first the way the hosted flow does. Leaving the
    status as whatever it happened to send would put the panel in a waiting
    state for a step that is this caller's to take.
  */
  return {
    id,
    status: "pending_user_transfer_start",
    withdrawAnchorAccount: text(opened["account_id"]),
    withdrawMemo: text(opened["memo"]),
    withdrawMemoType: text(opened["memo_type"]),
    amountIn: amount,
  };
}

/**
 * What an amount is worth in the anchor's local money.
 *
 * Indicative rather than firm: it is shown so somebody can see what they are
 * about to receive, and a rate held for two minutes would go stale while they
 * read it. The anchor's own answer at payout time is the one that counts, and
 * this says as much wherever it is drawn.
 */
export async function quote(
  anchor: Anchor,
  sellAsset: string,
  buyAsset: string,
  sellAmount: string,
): Promise<{ amount: string; rate: string } | null> {
  if (anchor.quotes === undefined) {
    return null;
  }

  try {
    const asked = await fetch(
      `${anchor.quotes}/price?sell_asset=${encodeURIComponent(sellAsset)}` +
        `&buy_asset=${encodeURIComponent(buyAsset)}` +
        `&sell_amount=${encodeURIComponent(sellAmount)}` +
        `&context=sep6&buy_delivery_method=bank_account`,
    );

    if (!asked.ok) {
      return null;
    }

    const { buy_amount: amount, price: rate } = (await asked.json()) as {
      buy_amount?: string;
      price?: string;
    };

    return amount === undefined || rate === undefined ? null : { amount, rate };
  } catch {
    return null;
  }
}

function shape(transaction: Record<string, unknown>): Transfer {
  return shape(transaction);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
