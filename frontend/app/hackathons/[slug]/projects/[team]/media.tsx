"use client";

import { useRef, useState } from "react";

import { DeckViewer } from "./deck";

/**
 * The deck and the video, opened where they are rather than somewhere else.
 *
 * Both used to be links out. A deck downloaded as a file somebody then had to
 * find, and a video opened YouTube in a new tab, which is the moment a reader
 * stops reading this page. Neither is a document you go and fetch; they are the
 * pitch, and a pitch belongs in front of the person being pitched.
 *
 * So both render in place, and both start open. A page about one project is a
 * page somebody chose to open; making them press again to see the pitch is the
 * download link again with an extra step. Closing is still there, for a reader
 * who wants the write up and the team without a video in the way.
 */

/** A PDF, shown at the shape a slide is drawn in. */
export function Deck({ url }: { url: string }) {
  const [open, setOpen] = useState(true);

  return (
    <section className="rounded-[1.25rem] bg-paper p-8 ring-1 ring-rule sm:p-10">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[1.25rem] text-ink">Pitch deck</h2>

        <div className="flex items-center gap-1">
          <Toggle open={open} onClick={() => setOpen(!open)} />

          {/* Kept beside it rather than replaced by it. Somebody who wants the
              file wants the file, and reading it here does not give them one. */}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label="Download the deck"
            title="Download the deck"
            className="grid size-8 place-items-center rounded-full text-ink-faint transition-colors duration-150 ease-settle hover:bg-paper-sunk hover:text-ink"
          >
            <Download />
          </a>
        </div>
      </div>

      {open && <DeckViewer url={url} />}
    </section>
  );
}

/** A demo video, played here when it is one this can embed. */
export function Video({ url }: { url: string }) {
  const [open, setOpen] = useState(true);
  const stage = useRef<HTMLDivElement | null>(null);
  const embedded = embed(url);

  async function expand() {
    const box = stage.current;

    if (box === null) {
      return;
    }

    try {
      /* Safari on iPhone has neither, and its own player takes the screen when
         the video starts. Nothing to do about that, and nothing to say about
         it: the button is simply inert there rather than throwing. */
      if (globalThis.document.fullscreenElement !== null) {
        await globalThis.document.exitFullscreen();
      } else {
        await box.requestFullscreen();
      }
    } catch {
      /* Refused, which is a decision the browser is allowed to make. */
    }
  }

  return (
    <section className="rounded-[1.25rem] bg-paper p-8 ring-1 ring-rule sm:p-10">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[1.25rem] text-ink">Demo video</h2>

        <div className="flex items-center gap-1">
          {/* A link this cannot embed still gets a way out. Vimeo, Loom and a
              file on somebody's own server all end up here, and offering a
              player that would render an error is worse than offering none. */}
          {embedded === null ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-[0.8125rem] text-ink-soft underline decoration-rule underline-offset-4 transition-colors duration-150 ease-settle hover:text-ink hover:decoration-ink"
            >
              Watch it
            </a>
          ) : (
            <Toggle open={open} onClick={() => setOpen(!open)} />
          )}
        </div>
      </div>

      {open && embedded !== null && (
        <div
          ref={stage}
          /* The element that goes full screen is this box rather than the frame
             inside it, so the black behind a letterboxed video is ours and the
             player fills what it is given. */
          className="relative mt-6 aspect-video w-full overflow-hidden rounded-[0.75rem] bg-ink ring-1 ring-inset ring-rule"
        >
          <iframe
            src={embedded}
            title="Demo video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="size-full"
          />

          {/* Our own control as well as the player's. YouTube draws its full
              screen button inside its own chrome, which does not appear until
              somebody moves the pointer over the video and disappears again;
              a reader who wants the whole screen should not have to find it. */}
          <button
            type="button"
            onClick={() => void expand()}
            aria-label="Full screen"
            title="Full screen"
            className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-ink/70 text-paper ring-1 ring-inset ring-paper/20 backdrop-blur transition-colors duration-150 ease-settle hover:bg-ink/90"
          >
            <Expand />
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * The player URL for a watch link, or nothing when there is not one.
 *
 * Teams paste whatever their browser was showing, which is a watch page, a
 * share link or a `youtu.be`. All three carry the same id and none of them is
 * embeddable as pasted.
 */
function embed(url: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1);

    return id.length === 0 ? null : `https://www.youtube-nocookie.com/embed/${id}`;
  }

  if (host === "youtube.com" || host === "m.youtube.com") {
    /* Already an embed, so it is left alone rather than rebuilt from a `v` it
       does not have. */
    if (parsed.pathname.startsWith("/embed/")) {
      return `https://www.youtube-nocookie.com${parsed.pathname}`;
    }

    const id = parsed.searchParams.get("v");

    return id === null ? null : `https://www.youtube-nocookie.com/embed/${id}`;
  }

  if (host === "vimeo.com") {
    const id = parsed.pathname.split("/").filter((part) => part.length > 0)[0];

    return id === undefined || !/^\d+$/.test(id) ? null : `https://player.vimeo.com/video/${id}`;
  }

  return null;
}

/** Open and shut, as one control that says which it will do. */
function Toggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="label px-2.5 py-1.5 text-ink-soft transition-colors duration-150 ease-settle hover:bg-paper-sunk hover:text-ink"
    >
      {open ? "Hide" : "Show"}
    </button>
  );
}

function Download() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="size-4 shrink-0"
    >
      <path d="M8 2v8m0 0 3-3m-3 3L5 7M2.5 12.5v1h11v-1" />
    </svg>
  );
}

/** Four corners pushed outward, which is what full screen looks like. */
function Expand() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
    >
      <path d="M6 2H2v4M14 6V2h-4M10 14h4v-4M2 10v4h4" />
    </svg>
  );
}
