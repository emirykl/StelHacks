/**
 * The contract's identifiers, and the words people use for them.
 *
 * A track and a criterion are stored on chain as `Symbol`, which holds letters,
 * digits and underscores and nothing else: no spaces and no punctuation. That
 * is a real constraint and it is not going anywhere — the digest that freezes
 * the rules is taken over these values, and the scorecards a judge signs name
 * the criterion by its symbol.
 *
 * What does not follow is that somebody should have to read `clean_code`. The
 * form used to rewrite what was being typed, character by character, into the
 * shape the contract wanted, so an organizer typing "Clean Code" watched it
 * turn into `clean_code` under their hands and then saw it printed that way on
 * their own event page, in a judge's scorecard, and in the results.
 *
 * So the two spellings are kept apart. `symbolOf` is applied once, on the way
 * to the chain; `titleOf` is applied wherever one is shown to a person. They
 * round trip: a name written here and read back on the next visit is the name
 * that was written.
 */

/** What `Symbol` accepts, which is also what the contract's own parser takes. */
const SYMBOL_LIMIT = 32;

/**
 * The identifier a phrase becomes on chain.
 *
 * Lowercased because a symbol is compared byte for byte in half a dozen places
 * — a scorecard against a rubric, a prize tier against a track — and two
 * spellings of one word would be two different criteria to the contract.
 */
export function symbolOf(said: string): string {
  return said
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, SYMBOL_LIMIT);
}

/**
 * The phrase an identifier is shown as.
 *
 * Underscores back to spaces and each word capitalised. A symbol that was never
 * a phrase — one somebody typed straight in, or one from a hackathon created
 * before this existed — still reads as words rather than as code.
 */
export function titleOf(symbol: string): string {
  return symbol
    .split(/[_\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
