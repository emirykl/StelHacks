"use client";

import type { Placement } from "../../../lib/results";
import type { Mark } from "../../../lib/team-names";

/**
 * The top three, standing where everybody already knows to look for them.
 *
 * A results table gives every place the same row, which is right for a document
 * and wrong for the moment somebody opens this page. Winning is not one more
 * value in a column, and a reader looking for who won should not have to
 * compare percentages to find out.
 *
 * First is centre and tallest, second to its left, third to its right — the
 * arrangement anybody has seen since they were a child, so it reads before it
 * is read. Everything past third goes back to being a row, because fourth is a
 * result rather than a podium.
 */

const HEIGHTS = ["h-40", "h-28", "h-20"];

/* First in the colour this product already uses for money and attention,
   second and third in plain ink. Bronze and silver would be two more colours
   invented for one component, and the ordering is already carried by height. */
const BLOCKS = [
  "bg-signal text-signal-ink",
  "bg-ink text-paper",
  "bg-ink-soft text-paper",
];

export function Podium({
  places,
  marks,
}: {
  places: Placement[];
  /** What each team called itself and drew, by team id. */
  marks: Map<number, Mark>;
}) {
  const top = places.filter((place) => place.rank <= 3).sort((a, b) => a.rank - b.rank);

  if (top.length === 0) {
    return null;
  }

  /* Second, first, third — the order they stand in rather than the order they
     placed. A single winner is centred on their own; two put first in the
     middle with an empty space where third would be, which is honest about a
     podium that was never filled. */
  const standing = [top[1], top[0], top[2]];

  return (
    <ol className="flex items-end justify-center gap-3 sm:gap-4">
      {standing.map((place, index) =>
        place === undefined ? (
          <li key={index} className="hidden w-28 sm:block" aria-hidden />
        ) : (
          <li key={place.rank} className="flex w-28 flex-col items-center sm:w-36">
            {/* The project's own mark above its name. A podium of three
                rectangles is three rectangles; the thing somebody recognises a
                project by is the picture they chose for it. Round, as it is
                everywhere else the project appears, and the hatch when there is
                none so the three keep the same shape. */}
            <div className="mb-3 size-12 overflow-hidden rounded-full border border-rule bg-paper">
              {marks.get(place.team)?.logoUrl == null ? (
                <div className="hatch size-full" aria-hidden />
              ) : (
                <img
                  src={marks.get(place.team)!.logoUrl!}
                  alt=""
                  className="size-full object-cover"
                />
              )}
            </div>

            <p className="mb-1 w-full truncate text-center text-[1rem] font-medium text-ink">
              {marks.get(place.team)?.name ?? `Team ${place.team}`}
            </p>

            <p className="tabular mb-3 text-[0.875rem] text-ink-soft">
              {percent(place.finalScore)}
            </p>

            <div
              className={`grid w-full place-items-center rounded-t-[0.75rem] ${
                HEIGHTS[place.rank - 1] ?? "h-16"
              } ${BLOCKS[place.rank - 1] ?? "bg-ink-soft text-paper"}`}
            >
              <span className="display text-[2.5rem] leading-none">{place.rank}</span>
            </div>

            {place.paid && <p className="label mt-2 text-verified">paid</p>}
          </li>
        ),
      )}
    </ol>
  );
}

/**
 * The score, rounded only for reading.
 *
 * The contract holds weighted totals at full scale — a criterion out of a
 * hundred times ten thousand basis points, so a perfect card is a million. The
 * same sum is done on the results board; both round here rather than anywhere
 * the number is still being worked with.
 */
const MAX_WEIGHTED_SCORE = 100 * 10_000;

function percent(score: number): string {
  return `${((score / MAX_WEIGHTED_SCORE) * 100).toFixed(1)}%`;
}
