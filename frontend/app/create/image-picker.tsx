"use client";

import { useRef, useState } from "react";

import { SHAPES, uploadArtwork, type Shape } from "../../lib/artwork";

/**
 * Choosing a picture, rather than pasting a link to one.
 *
 * The field this replaces asked for a URL, which is a question almost nobody
 * can answer: an organizer has a file, not a hosted image. It also asked for it
 * twice with no indication of what either would be cropped to, so the two
 * pictures that decide what a hackathon looks like on the listing were the two
 * least likely to be filled in.
 *
 * The recommended size is printed beside the label rather than in a tooltip,
 * because it is only useful before the file is chosen.
 *
 * It uploads on choosing. Nothing else on the form has to be valid for a
 * picture to be a picture, and a preview that appeared immediately but only
 * really uploaded on submit would be lying for as long as it took to find out.
 */

export function ImagePicker({
  label,
  shape,
  userId,
  value,
  onChange,
}: {
  label: string;
  shape: Shape;
  /** Whose folder it lands in. The bucket policy checks this, not us. */
  userId: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const box = useRef<HTMLInputElement>(null);
  const spec = SHAPES[shape];

  /* The frame is the shape the picture will be cropped to, not a convenient
     rectangle. A square logo dropped into a wide box looked wrong in a way that
     read as the upload being broken rather than as the preview being the wrong
     shape, and it hid the only thing this preview exists to show: whether the
     picture survives the crop. */
  const ratio = shape === "banner" ? "aspect-[4/1]" : "aspect-square";

  /* A square at the full column width would be a picture the height of the rest
     of the card, so the logo is capped and the banner is not. */
  const width = shape === "banner" ? "" : "max-w-[13rem]";

  async function take(file: File | undefined) {
    if (file === undefined) {
      return;
    }

    setBusy(true);
    setRefused(null);

    const uploaded = await uploadArtwork(file, userId, shape);

    setBusy(false);

    if (uploaded.url === null) {
      setRefused(uploaded.message);
      return;
    }

    onChange(uploaded.url);
  }

  return (
    /*
      Packed to the top and allowed to be narrower than its column, and both
      matter for the banner beside a logo.

      The two pickers sit in one row, so this column is stretched to the height
      of the taller one. A grid whose rows may stretch hands that spare height
      to the frame, and a frame with a fixed ratio answers extra height by
      taking proportionally more width: the banner grew past the card it was
      inside and its size caption ended up over the page background. `min-w-0`
      is the same overflow closed from the other side, since a frame that wants
      to be wider than its column is otherwise allowed to be.
    */
    <div className="grid min-w-0 content-start gap-2">
      {/* The size beside the name rather than pushed to the far edge. Set with
          `justify-between` it drifted to the other side of a wide card, where a
          caption about this picker reads as a stray figure belonging to
          whatever is nearest. */}
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="label text-ink">{label}</span>

        <span className="text-[0.8125rem] text-ink-faint">
          {spec.width} × {spec.height}
        </span>
      </div>

      <input
        ref={box}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          void take(event.target.files?.[0]);
          /* Cleared so choosing the same file twice still fires, which is what
             somebody does after an upload fails. */
          event.target.value = "";
        }}
      />

      {/* Two states, and they are different elements rather than one button
          wearing two hats. Empty, the whole area is the control. Filled, the
          area is the picture and the controls sit under it, because a button
          inside a button is not a thing HTML has. */}
      {value.length === 0 ? (
        <button
          type="button"
          onClick={() => box.current?.click()}
          disabled={busy}
          className={`relative grid w-full place-items-center rounded-[0.75rem] border border-dashed border-rule bg-paper transition-colors duration-150 ease-settle hover:border-ink hover:bg-paper-sunk ${ratio} ${width}`}
        >
          <span className="flex flex-col items-center gap-1.5 px-4 text-center">
            <span aria-hidden className="text-[1.3125rem] leading-none text-ink-faint">
              +
            </span>

            <span className="label text-ink-soft">{busy ? "Uploading" : "Choose a file"}</span>
          </span>

          {busy && <span aria-hidden className="absolute inset-0 rounded-[0.75rem] bg-paper/70" />}
        </button>
      ) : (
        <div className={`overflow-hidden rounded-[0.75rem] ring-1 ring-rule ${width}`}>
          <div className={`relative grid place-items-center bg-paper-sunk ${ratio}`}>
            {/* Cropped the way the card will crop it, so the preview answers the
                question somebody is actually asking: does this picture work at
                this shape. A contained preview shows the whole file and hides
                exactly the part that will be cut off.

                Taken out of the flow, because a ratio is only a preferred size:
                an in flow image is still allowed to be taller than it, and
                since `h-full` against a row sized by that same image resolves
                to auto, a square file dropped into the banner made the frame
                square and the 4:1 crop invisible. Positioned against the frame
                the image cannot size it, so the ratio holds whatever is put
                in. */}
            <img src={value} alt="" className="absolute inset-0 h-full w-full object-cover" />

            {busy && <span aria-hidden className="absolute inset-0 bg-paper/70" />}
          </div>

          {/* Always shown rather than revealed on hover. The two things somebody
              wants once a picture is up are to change it or to take it off, and
              hiding both until the pointer happens to be over the image made
              taking it off look impossible. */}
          <div className="flex border-t border-rule">
            <button
              type="button"
              onClick={() => box.current?.click()}
              disabled={busy}
              className="label flex-1 py-2.5 text-ink-soft transition-colors duration-150 ease-settle hover:bg-paper-sunk hover:text-ink"
            >
              Replace
            </button>

            <button
              type="button"
              onClick={() => {
                setRefused(null);
                onChange("");
              }}
              disabled={busy}
              className="label flex-1 border-l border-rule py-2.5 text-ink-soft transition-colors duration-150 ease-settle hover:bg-paper-sunk hover:text-broken"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      <span className="text-[0.8125rem] leading-relaxed text-ink-faint">{spec.note}</span>

      {refused !== null && (
        <span className="text-[0.8125rem] leading-relaxed text-broken">{refused}</span>
      )}
    </div>
  );
}
