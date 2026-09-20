"use client";

import { SpecularButton } from "./specular-button";
import type { ReactNode } from "react";

/**
 * The button for a press somebody has to mean.
 *
 * Shared by the header, landing calls to action, registration and rule locking.
 * Ordinary filters and form steps use the flat capsule in `primitives.tsx`.
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
const SIGNAL = "#ffd91a";

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
  className,
  prominent = false,
}: {
  children: ReactNode;
  /** Present when the press navigates, which keeps it a real link. */
  href?: string;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: React.MouseEventHandler<HTMLElement>;
  className?: string;
  /** A broader rim light for the landing's large calls to action. */
  prominent?: boolean;
}) {
  return (
    <SpecularButton
      size={size}
      className={className}
      /* Larger than the button is tall, which the component clamps to a pill.
         Every other button in this system is a capsule and this one is not
         allowed to be the exception that makes the header look assembled. */
      radius={999}
      tint={INK}
      tintOpacity={1}
      textColor={SIGNAL}
      lineColor="#ffffff"
      baseColor={BEVEL}
      /* Pushed past the defaults, which are tuned for a white line on a dark
         page. Against paper the same line has almost nothing to be brighter
         than, so it has to be stronger and drawn over more of the rim before it
         reads as light rather than as an artefact.

         Thickness is the one that had to come back down. At 2.4 the line was
         wider than the curve it was following, so at the two ends of the
         capsule — where the rim turns through half a circle in a few pixels —
         the glow piled up outside the edge and read as a blister growing off
         the side of the button whenever the light swept past. */
      intensity={prominent ? 1.8 : 1.2}
      thickness={prominent ? 1.8 : 1.4}
      shineSize={prominent ? 38 : 26}
      shineFade={34}
      blur={0}
      /*
        It turns on its own, and answers the cursor when one arrives.

        Two behaviours rather than one, and the second is what makes the first
        worth having. Turning, it is the only moving thing on a still page and
        the eye finds it without being asked. Reaching it, the light leaves the
        sweep and comes to the edge the pointer is on, which is the button
        replying to a particular person rather than performing at the room.

        Both halves have been wrong here at some point. Steering alone meant the
        effect was only ever seen by somebody already reaching for the button,
        which is the one person who does not need to be told where it is. And
        turning alone, with the sweep merely stopping under the cursor, left
        hovering it feeling like the button had died rather than answered.
      */
      autoAnimate
      followMouse
      /* Further than the default. On paper the shine is the only thing that
         says this button is different from a black rectangle, so the light
         should be leaning toward somebody by the time they are deciding
         whether to press it rather than once they have already arrived. */
      proximity={340}
      /* A full turn in about eight seconds. The streak is symmetric, so the rim
         looks the same twice per turn and the felt rhythm is half of that: slow
         enough to read as a light moving over a surface rather than as
         something spinning for attention. */
      speed={0.8}
      disabled={disabled}
      {...(href === undefined ? { type } : { href })}
      {...(onClick === undefined ? {} : { onClick })}
    >
      {children}
    </SpecularButton>
  );
}
