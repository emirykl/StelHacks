/**
 * The credit for whoever holds a scorecard shut.
 *
 * Sealed judging is not ours: a scorecard and a ballot are encrypted in the
 * browser with `@sub-rosa/tlock` to the Drand round derived from the judging
 * deadline, and nothing but the beacon can open them. That is the claim the
 * whole result rests on, so the name of the thing making it belongs on the
 * surfaces that promise it rather than only in `docs/decisions.md`.
 *
 * The logo is their published file, served from our own `public/` rather than
 * their host: a form page asking a third party for an image tells that third
 * party who is filling the form in. Only the cream it was drawn on is cut away,
 * because a square of it would sit visibly on our paper.
 *
 * `on="night"` puts the mark back on a tile of that cream. The lines are all
 * but black and they vanish against the landing section; recolouring them would
 * leave a logo nobody recognises, which is the one thing a credit cannot do.
 */
export function SubRosaSeal({
  on = "paper",
  className = "",
}: {
  on?: "paper" | "night";
  className?: string;
}) {
  const night = on === "night";

  return (
    <a
      href="https://sub-rosa.online"
      target="_blank"
      rel="noreferrer"
      className={`label inline-flex items-center gap-2 text-[0.6875rem] transition-colors duration-150 ease-settle ${
        night ? "text-[#8a8a80] hover:text-[#d8d8cc]" : "text-ink-faint hover:text-ink-soft"
      } ${className}`}
    >
      <img
        src="/sub-rosa.png"
        alt=""
        width={128}
        height={128}
        loading="lazy"
        decoding="async"
        className={night ? "size-5 rounded-[0.25rem] bg-[#e4e0dc] p-0.5" : "size-5"}
      />
      Sealed with Sub Rosa
    </a>
  );
}
