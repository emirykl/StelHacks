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
const EDGE = "#5c5753";

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
      baseColor={EDGE}
      intensity={1}
      shineSize={10}
      shineFade={40}
      thickness={1}
      blur={0}
      followMouse
      /* Nearer than the default two hundred and fifty. On a page with two of
         these the light should answer the cursor that is coming for it, not
         every cursor that passes the middle of the screen. */
      proximity={180}
      /* Never on its own. A button that glows while nobody is pointing at it is
         motion the reader did not ask for, and this product turns that off
         everywhere else. */
      autoAnimate={false}
      disabled={disabled}
      {...(href === undefined ? { type } : { href })}
      {...(onClick === undefined ? {} : { onClick })}
    >
      {children}
    </SpecularButton>
  );
}
