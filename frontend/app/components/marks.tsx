/**
 * The marks for the places somebody is already found.
 *
 * Drawn rather than fetched. Every one of these is published as an SVG on
 * somebody's CDN, and using one would make a profile page ask a third party for
 * an image and tell them who was looking.
 *
 * They live here rather than beside either surface because the profile shows
 * them as links and the form shows them beside the field that writes them, and
 * two copies of a path this long is two chances for one of them to be the
 * stale one.
 *
 * Each one carries its own colour. These are somebody else's marks and a logo
 * recoloured to match a page is a logo nobody recognises at a glance, which is
 * the entire job a logo has here: three of them in a row have to be told apart
 * without being read. It is the one place in this product where a colour is not
 * ours to choose.
 */

/* The published brand colours. GitHub and X are all but black and that is
   correct: it is what makes LinkedIn's blue do the work of separating them. */
const COLOURS = {
  github: "#181717",
  x: "#000000",
  linkedin: "#0A66C2",
} as const;

export type Where = "github" | "x" | "linkedin";

export function Mark({ where, className = "size-4" }: { where: Where; className?: string }) {
  if (where === "github") {
    return (
      <svg aria-hidden viewBox="0 0 16 16" fill={COLOURS.github} className={`${className} shrink-0`}>
        <path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.62 2.29 6.69 5.47 7.77.4.08.55-.18.55-.4l-.01-1.37c-2.23.5-2.7-1.1-2.7-1.1-.36-.96-.89-1.21-.89-1.21-.73-.51.06-.5.06-.5.8.06 1.23.85 1.23.85.71 1.26 1.87.9 2.33.68.07-.53.28-.9.51-1.1-1.78-.21-3.65-.91-3.65-4.06 0-.9.31-1.63.83-2.2-.09-.21-.36-1.05.07-2.19 0 0 .67-.22 2.2.84a7.5 7.5 0 0 1 4 0c1.53-1.06 2.2-.84 2.2-.84.44 1.14.16 1.98.08 2.19.51.57.82 1.3.82 2.2 0 3.16-1.87 3.85-3.66 4.05.29.25.54.75.54 1.51l-.01 2.24c0 .22.15.48.55.4A8.21 8.21 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z" />
      </svg>
    );
  }

  if (where === "x") {
    return (
      <svg aria-hidden viewBox="0 0 16 16" fill={COLOURS.x} className={`${className} shrink-0`}>
        <path d="M12.6 0h2.45l-5.35 6.12L16 16h-4.93l-3.86-5.05L2.79 16H.34l5.72-6.54L0 0h5.06l3.49 4.61L12.6 0Zm-.86 14.54h1.36L4.32 1.38H2.87l8.87 13.16Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden viewBox="0 0 16 16" fill={COLOURS.linkedin} className={`${className} shrink-0`}>
      <path d="M3.6 5.3H.9V16h2.7V5.3ZM2.25 0a1.57 1.57 0 1 0 0 3.13 1.57 1.57 0 0 0 0-3.13ZM16 9.7c0-3-1.6-4.6-3.9-4.6-1.5 0-2.36.73-2.83 1.5h-.05V5.3H6.6V16h2.7v-5.4c0-1.44.5-2.35 1.75-2.35 1.16 0 1.62.86 1.62 2.35V16H16V9.7Z" />
    </svg>
  );
}
