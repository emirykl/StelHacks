/**
 * The two tokens a prize can be paid in, as their own marks.
 *
 * A figure with a ticker beside it is a figure somebody has to read; a figure
 * with the token's mark beside it is one they recognise across a grid of cards
 * without stopping. The ticker stays — the mark is the second signal, not a
 * replacement for the word.
 *
 * Inlined rather than fetched, like every other glyph in this interface. Two
 * more files in `public/` would be two more requests on the page that lists
 * every hackathon, and a mark that fails to load leaves a hole where a prize
 * is. These are the official marks from the CC0 `cryptocurrency-icons` set,
 * with USDC's disc corrected to Circle's own `#2775CA`; the set ships a shade
 * beside it.
 *
 * Only the two assets `PRIZE_ASSETS` names. Anything else is drawn as its
 * shortened address by the code that formats prizes, and inventing a mark for
 * a token nobody recognised would be the interface claiming to know it.
 */

/** Which mark to draw, keyed by the ticker the prize is quoted in. */
export function TokenMark({ code, className = "size-5" }: { code: string; className?: string }) {
  if (code === "XLM") {
    return <Lumens className={className} />;
  }

  return code === "USDC" ? <Circle className={className} /> : null;
}

function Lumens({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={`${className} shrink-0`}
      role="img"
    >
      <circle cx="16" cy="16" r="16" fill="#000" />
      <path
        fill="#FFF"
        d="M23.13 9.292l-2.4 1.224-11.598 5.907A6.909 6.909 0 0119.35 9.498l1.374-.7.205-.105a8.439 8.439 0 00-13.371 7.472 1.535 1.535 0 01-.834 1.484l-.725.37v1.724l2.134-1.088.691-.353.681-.347 12.226-6.23 1.374-.699 2.84-1.447V7.856L23.13 9.292zm2.816 2.012L10.201 19.32l-1.374.7L6 21.463v1.723l2.808-1.43 2.401-1.224 11.61-5.916a6.909 6.909 0 01-10.229 6.93l-.085.045-1.49.76a8.439 8.439 0 0013.372-7.475 1.536 1.536 0 01.833-1.483l.726-.37v-1.718z"
      />
    </svg>
  );
}

function Circle({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={`${className} shrink-0`}
      role="img"
    >
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <g fill="#FFF">
        <path d="M20.022 18.124c0-2.124-1.28-2.852-3.84-3.156-1.828-.243-2.193-.728-2.193-1.578 0-.85.61-1.396 1.828-1.396 1.097 0 1.707.364 2.011 1.275a.458.458 0 00.427.303h.975a.416.416 0 00.427-.425v-.06a3.04 3.04 0 00-2.743-2.489V9.142c0-.243-.183-.425-.487-.486h-.915c-.243 0-.426.182-.487.486v1.396c-1.829.242-2.986 1.456-2.986 2.974 0 2.002 1.218 2.791 3.778 3.095 1.707.303 2.255.668 2.255 1.639 0 .97-.853 1.638-2.011 1.638-1.585 0-2.133-.667-2.316-1.578-.06-.242-.244-.364-.427-.364h-1.036a.416.416 0 00-.426.425v.06c.243 1.518 1.219 2.61 3.23 2.914v1.457c0 .242.183.425.487.485h.915c.243 0 .426-.182.487-.485V21.34c1.829-.303 3.047-1.578 3.047-3.217z" />
        <path d="M12.892 24.497c-4.754-1.7-7.192-6.98-5.424-11.653.914-2.55 2.925-4.491 5.424-5.402.244-.121.365-.303.365-.607v-.85c0-.242-.121-.424-.365-.485-.061 0-.183 0-.244.06a10.895 10.895 0 00-7.13 13.717c1.096 3.4 3.717 6.01 7.13 7.102.244.121.488 0 .548-.243.061-.06.061-.122.061-.243v-.85c0-.182-.182-.424-.365-.546zm6.46-18.936c-.244-.122-.488 0-.548.242-.061.061-.061.122-.061.243v.85c0 .243.182.485.365.607 4.754 1.7 7.192 6.98 5.424 11.653-.914 2.55-2.925 4.491-5.424 5.402-.244.121-.365.303-.365.607v.85c0 .242.121.424.365.485.061 0 .183 0 .244-.06a10.895 10.895 0 007.13-13.717c-1.096-3.46-3.778-6.07-7.13-7.162z" />
      </g>
    </svg>
  );
}
