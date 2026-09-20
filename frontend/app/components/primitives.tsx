import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * The pieces every surface is built from.
 *
 * Kept small deliberately. A design system earns its keep by having few enough
 * parts that a screen is obviously made of them, and the moment there are two
 * ways to draw a button somebody will use both on the same page.
 */

function join(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * The capsule button from the editorial layout, with Apple's restraint applied
 * to how it behaves.
 *
 * It moves a single pixel on press and nothing on hover beyond a shade. A
 * button that grows or lifts under the cursor is telling you it is a button,
 * which you already knew; a button that responds to being pressed is telling
 * you it heard you, which you did not.
 */
export function Button({
  intent = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ComponentProps<"button"> & {
  intent?: "primary" | "quiet" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      className={join(
        base(intent, size),
        "active:translate-y-px disabled:opacity-40 disabled:pointer-events-none",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** The same thing that navigates instead of acting. */
export function ButtonLink({
  intent = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & {
  intent?: "primary" | "quiet" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <Link className={join(base(intent, size), "active:translate-y-px", className)} {...rest}>
      {children}
    </Link>
  );
}

function base(
  intent: "primary" | "quiet" | "ghost" | "danger",
  size: "sm" | "md",
): string {
  const shape =
    size === "sm"
      ? "h-9 px-4 text-[0.8125rem] gap-1.5"
      : "h-11 px-5 text-[0.9375rem] gap-2";

  const look = {
    primary: "bg-ink text-paper hover:bg-ink/90",
    quiet: "bg-paper-sunk text-ink hover:bg-rule/60 ring-1 ring-inset ring-rule",
    ghost: "text-ink-soft hover:text-ink hover:bg-paper-sunk",
    /* Undoing something, and the only intent allowed to spend the broken
       colour. Signing out and disconnecting a wallet are both a person taking
       something away from themselves, and they read as the same gesture
       wherever they appear because they are drawn from here.

       Outlined rather than bare. Set as loose red text it read as a warning
       somebody had written on the page rather than as a control, and its
       padding pushed the words out of line with everything above it, so the one
       destructive thing on the page was also the only thing not on the grid.

       Drawn from `danger` rather than `broken`, which is the red that reports a
       failure. See the note on the token. */
    danger: "text-danger ring-1 ring-inset ring-danger/35 hover:bg-danger/10 hover:ring-danger/70",
  }[intent];

  return join(
    "inline-flex items-center justify-center rounded-full font-medium",
    "transition-[background-color,color,transform] duration-150 ease-settle",
    "whitespace-nowrap select-none",
    shape,
    look,
  );
}

/**
 * The circular badge that sits inside the editorial call to action.
 *
 * Decorative, so it is hidden from anybody listening rather than reading; the
 * button's own words already say where it goes.
 */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="grid size-6 place-items-center rounded-full bg-signal text-signal-ink text-xs"
    >
      {children}
    </span>
  );
}

/**
 * A surface that holds something.
 *
 * Hairline rules rather than shadows. A shadow implies a thing floating above
 * the page, which is a claim about depth an interface this flat has no reason
 * to make.
 */
export function Card({
  className,
  children,
  ...rest
}: ComponentProps<"div"> & { className?: string }) {
  return (
    <div
      className={join(
        "rounded-lg ring-1 ring-rule bg-paper p-6",
        "transition-shadow duration-200 ease-settle",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * A line of small capitals above a heading, saying what kind of thing follows.
 *
 * The editorial layout uses these to let a reader skim a long page by its
 * sections. Tracked out, because small text set tight stops being legible
 * before it stops being readable.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-ink-faint">
      {children}
    </p>
  );
}

/**
 * The page's own title, in the display face.
 *
 * Sized in viewport units with a floor and a ceiling, so it reads as a headline
 * on a phone and as one on a monitor rather than as the same headline scaled.
 */
export function Display({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={join(
        "text-[clamp(2.5rem,6vw,4.5rem)] text-balance",
        className,
      )}
    >
      {children}
    </h1>
  );
}

/** A hairline, used where a gap alone would not be enough. */
export function Rule({ className }: { className?: string }) {
  return <hr className={join("border-0 h-px bg-rule", className)} />;
}

/**
 * The width every page is read at.
 *
 * One measure, and it is narrow. A line of text past about seventy five
 * characters costs the reader the return sweep, and no amount of screen makes
 * that worth spending.
 */
export function Measure({
  children,
  wide = false,
  className,
}: {
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div
      className={join(
        "mx-auto w-full px-6",
        wide ? "max-w-[96rem]" : "max-w-[46rem]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A value the chain decided, shown as the chain holds it.
 *
 * Monospaced and tabular so a digest can be compared character by character,
 * which is the only way anybody ever actually compares one.
 */
export function Chain({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <span title={title} className="tabular text-[0.8125rem] text-ink-soft break-all">
      {children}
    </span>
  );
}
