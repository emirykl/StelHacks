/**
 * What went wrong, in words, whatever it was thrown as.
 *
 * Not everything thrown here is an `Error`. The Supabase client rejects with a
 * plain object carrying `message` and `code`, and so does the RPC client, and a
 * template string turns either into "[object Object]".
 *
 * That is not only ugly. Two places decide what to do next by reading the
 * message — one retries a range the server has aged out, the other reports it —
 * and while they each read it their own way, one of them saw the object's words
 * and the other saw nothing, so the retry never ran and the contract never
 * moved. They read it here now, once.
 */
export function explain(thrown: unknown): string {
  if (thrown instanceof Error) {
    return thrown.message;
  }

  if (typeof thrown === "object" && thrown !== null) {
    const said = thrown as { message?: unknown; code?: unknown };

    if (typeof said.message === "string") {
      return said.code === undefined ? said.message : `${said.message} (${String(said.code)})`;
    }

    return JSON.stringify(thrown).slice(0, 300);
  }

  return String(thrown);
}

/** Whether the cursor asked for a ledger the server no longer serves. */
export function fellOffTheWindow(thrown: unknown): boolean {
  return /startLedger must be within/.test(explain(thrown));
}
