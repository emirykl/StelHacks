"use client";

import { SpecularButton } from "./specular-button";
import type { ReactNode } from "react";

/**
 * The button for a press somebody has to mean.
 *
 * There are two of those in this product and only two: signing in, and
 * entering a hackathon. Everything else is a link, a filter or a step in a
 * flow, and all of those use the flat capsule in `primitives.tsx`.
 *
 * That restraint is the whole point of using it at all. A rim light that
 * follows the cursor is decoration, and decoration spent everywhere stops
 * being noticed and starts being cost: this one carries a WebGL context, a
 * shader and an animation frame apiece. Spent on the two presses that matter,
 * it says which two those are without a word.
 *
 * The palette lives here rather than at each call site, for the same reason
 * the capsule's does: the moment there are two ways to configure this, some
 * screen will use both and they will not match. The hex values are the design
 * tokens resolved, because the shader takes colours as numbers and cannot read
 * a custom property.
 */

/* Resolved from `--color-ink` and `--color-signal`. Kept as literals and not
   as `var(...)`: `tint` and `textColor` reach CSS and could be either, but
   `lineColor` and `baseColor` are parsed by the shader, and a shader given the
   string "var(--color-ink)" silently renders black. One spelling for all four
   is worth more than the indirection. */
const INK = "#171310";
const SIGNAL = "#f0c630";

/*
  The permanent edge, and the reason it is light.

  `baseColor` is not part of the moving highlight: the shader draws it around
  the whole rim at a fixed strength, and it is what gives the button an edge
  when nobody is pointing at it. The component ships with a dark grey, which is
  right on the dark page it was designed against and invisible here, where a
  dark stroke sits on a dark fill on light paper. Set light, it reads as a bevel
  catching the room, which is the effect the shine then travels along.

  Without this the button was flat until the cursor was almost on it, and a
  reader who never brought the cursor near never saw anything at all.
*/
const BEVEL = "#b6ada2";

export function CommitButton({
  children,
  href,
  size = "md",
  disabled = false,
  type = "button",
  onClick,
}: {
  children: ReactNode;
  /** Present when the press navigates, which keeps it a real link. */
  href?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: React.MouseEventHandler<HTMLElement>;
}) {
  return (
    <SpecularButton
      size={size}
      /* Larger than the button is tall, which the component clamps to a pill.
         Every other button in this system is a capsule and this one is not
         allowed to be the exception that makes the header look assembled. */
      radius={999}
      tint={INK}
      tintOpacity={1}
      textColor={SIGNAL}
      lineColor="#ffffff"
      baseColor={BEVEL}
      /* All three pushed well past the defaults, which are tuned for a white
         line on a dark page. Against paper the same line has almost nothing to
         be brighter than, so it has to be wider, stronger and drawn over more
         of the rim before it reads as light rather than as an artefact. */
      intensity={2.2}
      thickness={2.4}
      shineSize={26}
      shineFade={34}
      blur={0}
      followMouse
      /* Further than the default. On paper the shine is the only thing that
         says this button is different from a black rectangle, so it should be
         lit by the time somebody is deciding whether to press it rather than
         once they have already arrived. */
      proximity={340}
      /* Never on its own. A button that glows while nobody is pointing at it is
         motion the reader did not ask for, and this product turns that off
         everywhere else. The bevel is what carries it at rest. */
      autoAnimate={false}
      disabled={disabled}
      {...(href === undefined ? { type } : { href })}
      {...(onClick === undefined ? {} : { onClick })}
    >
      {children}
    </SpecularButton>
  );
}
