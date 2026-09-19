import Link from "next/link";

/**
 * Narrowing the list, in the URL rather than in a component's memory.
 *
 * Every choice is a link, so a filtered list can be sent to somebody, opened in
 * a second tab, and returned to with the back button. A set of buttons holding
 * the same state in React would look identical and do none of that.
 *
 * It also means the filtering happens where the data is. The page reads these
 * off the request and asks the chain only about the cards it is going to show,
 * which is the difference between a list that pages and one that gets slower
 * the more hackathons exist.
 */

export interface Applied {
  stage?: string | undefined;
  tag?: string | undefined;
  q?: string | undefined;
}

const stages = [
  { value: "", label: "All" },
  { value: "open", label: "Running" },
  { value: "upcoming", label: "Not open yet" },
  { value: "finished", label: "Finished" },
] as const;

export function Filters({
  applied,
  tags,
  showing,
  total,
}: {
  applied: Applied;
  tags: string[];
  showing: number;
  total: number;
}) {
  return (
    <div className="border-y border-rule">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-4">
        <nav className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Stage">
          {stages.map((stage) => (
            <Choice
              key={stage.value}
              href={linkTo({ ...applied, stage: stage.value })}
              chosen={(applied.stage ?? "") === stage.value}
            >
              {stage.label}
            </Choice>
          ))}
        </nav>

        {/* Said plainly rather than left to be counted. A page showing twelve of
            thirty three should say so, or a reader takes the twelve for all of
            them. */}
        <p className="label text-ink-faint">
          {showing === total ? `${total} in all` : `${showing} of ${total}`}
        </p>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-t border-rule py-4">
          <Choice href={linkTo({ ...applied, tag: "" })} chosen={(applied.tag ?? "") === ""}>
            Everything
          </Choice>

          {tags.map((tag) => (
            <Choice
              key={tag}
              href={linkTo({ ...applied, tag })}
              chosen={applied.tag === tag}
            >
              {tag}
            </Choice>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One choice, and whether it is the one in force.
 *
 * The chosen one is filled rather than outlined. An outline that thickens is
 * the usual way to show this and it is the one that disappears on a screen
 * somebody is glancing at.
 */
function Choice({
  href,
  chosen,
  children,
}: {
  href: string;
  chosen: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={chosen ? "true" : undefined}
      className={`label px-3 py-2 transition-colors duration-150 ease-settle ${
        chosen ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-sunk hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

/** The same page with one thing changed, and empty choices left out of the URL. */
function linkTo(applied: Applied): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(applied)) {
    if (typeof value === "string" && value.length > 0) {
      params.set(key, value);
    }
  }

  const query = params.toString();

  return query.length === 0 ? "/hackathons" : `/hackathons?${query}`;
}
