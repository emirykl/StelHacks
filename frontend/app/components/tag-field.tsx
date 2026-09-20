"use client";

import { useState } from "react";

/**
 * Tags as things rather than as a sentence about things.
 *
 * They were one box holding "#payments, #stellar, #soroban", which asks
 * somebody to remember a punctuation rule while typing and gives no sign of
 * what was understood until the hackathon is already created. A tag with a
 * stray space, a doubled comma or a trailing one was silently a different tag
 * or no tag at all.
 *
 * Each one is committed as it is typed, so what is on screen is exactly what
 * will be stored, and removing one is a press rather than an edit in the middle
 * of a line.
 *
 * The value stays a comma separated string, because that is what both callers
 * hold and what the handler already takes. The chips are how it is edited, not
 * a second shape for it to be in.
 */

/** As many as the listing's filter can show without becoming a wall. */
const MOST = 8;

export function TagField({
  value,
  onChange,
  label = "Tags",
}: {
  /** Comma separated, the way it is stored and sent. */
  value: string;
  onChange: (next: string) => void;
  label?: string;
}) {
  const [typing, setTyping] = useState("");

  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  const full = tags.length >= MOST;

  function add() {
    /* The hash comes off here because everybody writes a tag with one and
       storing it would make the same word typed both ways two tags. */
    const tag = typing.trim().replace(/^#+/, "").trim().toLowerCase();

    if (tag.length === 0 || full || tags.includes(tag)) {
      setTyping("");
      return;
    }

    onChange([...tags, tag].join(", "));
    setTyping("");
  }

  function drop(at: number) {
    onChange(tags.filter((_, index) => index !== at).join(", "));
  }

  return (
    <div className="grid gap-2">
      <span className="label text-[0.875rem] text-ink">{label}</span>

      <div className="flex flex-wrap items-center gap-2">
        {tags.map((tag, at) => (
          <span
            key={tag}
            className="flex items-center gap-1.5 rounded-full bg-paper-sunk py-1.5 pl-3.5 pr-2 text-[0.9375rem] text-ink"
          >
            #{tag}

            <button
              type="button"
              onClick={() => drop(at)}
              aria-label={`Remove ${tag}`}
              className="grid size-5 place-items-center rounded-full text-ink-faint transition-colors duration-150 ease-settle hover:bg-rule hover:text-ink"
            >
              <svg
                aria-hidden
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="size-3"
              >
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          </span>
        ))}
      </div>

      {!full && (
        <div className="flex items-center gap-2">
          <input
            value={typing}
            onChange={(event) => setTyping(event.target.value.slice(0, 24))}
            /* Enter as well as the button, because a row of short words is
               typed without the hands leaving the keyboard. A comma commits it
               too, so anybody who pastes the old format still gets tags. */
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                add();
              }
            }}
            onBlur={add}
            placeholder="payments"
            className="h-11 w-full max-w-[16rem] rounded-[0.625rem] bg-paper px-4 text-[1rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-2 focus:ring-ink"
          />

          <button
            type="button"
            onClick={add}
            disabled={typing.trim().length === 0}
            aria-label="Add tag"
            className="grid size-11 shrink-0 place-items-center rounded-[0.625rem] bg-paper text-ink-soft ring-1 ring-inset ring-rule transition-colors duration-150 ease-settle hover:text-ink hover:ring-ink disabled:opacity-40 disabled:hover:text-ink-soft disabled:hover:ring-rule"
          >
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="size-4"
            >
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
        </div>
      )}

      <span className="text-[0.875rem] text-ink-faint">
        {full ? `Eight is the most a listing shows.` : `${MOST - tags.length} more if you want them.`}
      </span>
    </div>
  );
}
