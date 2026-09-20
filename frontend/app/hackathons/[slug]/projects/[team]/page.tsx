import { explorerFor } from "../../../../../lib/explorer";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ButtonLink, Measure } from "../../../../components/primitives";
import { Deck, Video } from "./media";
import { findHackathon } from "../../../../../lib/chain";
import { entriesOf } from "../../../../../lib/submissions";
import { membersOf, projectOf, type Member } from "../../../../../lib/project";

/**
 * One project, laid out the way somebody reads one.
 *
 * The banner and the logo are the team's work and go first, because a page that
 * opens on a digest is a page that says the chain matters more than the thing
 * it recorded. It does not: the chain is what makes the record trustworthy, and
 * the record is of somebody's weekend.
 *
 * So the order is theirs, then the argument. The write up runs down the middle,
 * the fixed facts sit in a rail beside it, and the deck and the video open
 * underneath it rather than in somebody else's tab.
 *
 * What the contract pinned used to close this page: the entry digest, the
 * pinned link and the category, set as a specification table. It was the only
 * part of the page nobody could read. The digest proves the write up was not
 * edited after the deadline, which matters, and matters to a judge or a
 * challenger rather than to somebody deciding whether to look at a project. It
 * belongs on a surface for checking, and the chain still holds it whether or not
 * this page prints it.
 */

export const revalidate = 0;

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string; team: string }>;
}) {
  const { slug, team } = await params;
  const teamId = Number(team);

  if (!Number.isInteger(teamId) || teamId <= 0) {
    notFound();
  }

  const hackathon = await findHackathon(slug);

  if (hackathon === null) {
    notFound();
  }

  /* The entry from the chain and the description from our side, together. The
     first is what was pinned, the second is what it says it is. */
  const [entries, project] = await Promise.all([
    entriesOf(hackathon.contract_id),
    projectOf(hackathon.contract_id, teamId),
  ]);

  const entry = entries.find((one) => one.team === teamId) ?? null;

  if (entry === null && project === null) {
    notFound();
  }

  const roster = entry?.members ?? [];
  const people = await membersOf(roster, roster[0] ?? "");

  const title = project?.title ?? `Team ${teamId}`;

  return (
    <main className="flex-1">
      <Measure wide className="py-8">
        {/* Where this is, said before what it is. A project belongs to an event
            and to a list within it, and arriving from a link with no way back
            up is how somebody ends up at a dead end. */}
        <p className="label text-ink-faint">
          <a
            href={`/hackathons/${slug}`}
            className="transition-colors duration-150 ease-settle hover:text-ink"
          >
            {hackathon.name}
          </a>
          {" / "}
          <a
            href={`/hackathons/${slug}?tab=projects`}
            className="transition-colors duration-150 ease-settle hover:text-ink"
          >
            Projects
          </a>
          {entry !== null && <span className="text-ink"> / {entry.track}</span>}
        </p>

        {/* The banner, with the mark sitting over its lower left corner. Round
            and large, because it is the thing somebody recognises the project by
            and a small square beside the name is a favicon. */}
        <div className="relative mt-4">
          <div className="aspect-[4/1] w-full overflow-hidden border border-rule">
            {project?.bannerUrl == null ? (
              <div className="hatch size-full" aria-hidden />
            ) : (
              <img src={project.bannerUrl} alt="" className="size-full object-cover" />
            )}
          </div>

          <div className="absolute -bottom-10 left-8 size-28 overflow-hidden rounded-full border-4 border-paper bg-paper-sunk">
            {project?.logoUrl == null ? (
              <div className="hatch size-full" aria-hidden />
            ) : (
              <img src={project.logoUrl} alt="" className="size-full object-cover" />
            )}
          </div>
        </div>

        <div className="mt-16 grid gap-12 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-16">
          {/*
            The rail carries the identity: what it is called, what it does in a
            line, and the two or three places to go and look at it. Those belong
            together because they are one act — deciding whether to open the
            thing — and they were spread across a masthead and a sidebar.
          */}
          <aside className="grid content-start gap-8">
            <div>
              <h1 className="text-[1.75rem] leading-tight text-ink">{title}</h1>

              {project?.summary != null && (
                <p className="mt-3 text-[1rem] leading-relaxed text-ink-soft">
                  {project.summary}
                </p>
              )}

              {entry?.invalid === true && (
                /* Struck out during screening. Said here rather than left to be
                   inferred from a missing rank later, because a team reading
                   their own page deserves to be told. */
                <p className="mt-4 text-[0.9375rem] text-broken">
                  Ruled out at screening. It stays on the page; it is not ranked.
                </p>
              )}
            </div>

            {/* Two ways in, not three. The demo video used to be a third button
                of equal weight and it is not a third place to go: it plays on
                this page now, beside the write up, so the rail is left with the
                two links that actually leave. Each carries its mark, because a
                row of identical pills makes somebody read three labels to find
                the repository. */}
            {(project?.liveUrl != null ||
              project?.repositoryUrl != null ||
              project?.contractAddress != null) && (
              <div className="grid gap-2">
                {project?.liveUrl != null && (
                  <ButtonLink
                    href={project.liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full justify-center gap-2"
                  >
                    <Globe />
                    Web
                  </ButtonLink>
                )}

                {project?.repositoryUrl != null && (
                  <ButtonLink
                    intent="quiet"
                    href={project.repositoryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full justify-center gap-2"
                  >
                    <Repo />
                    GitHub
                  </ButtonLink>
                )}

                {/* Under the other two, because it is the one a reader follows
                    last: the code and the running thing are what a project is,
                    and the deployment is what it became. */}
                {project?.contractAddress != null && (
                  <ButtonLink
                    intent="quiet"
                    href={explorerFor("contract", project.contractAddress)}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full justify-center gap-2"
                  >
                    <Stellar />
                    Contract
                  </ButtonLink>
                )}
              </div>
            )}

            {/* In the same card the write up and the deck are in, because the
                people are part of the pitch rather than a footnote under it. A
                rule and a grey caption was the weight of a caption, and it read
                as one beside two headings the same size as the project's name. */}
            <section className="rounded-[1.25rem] bg-paper p-6 ring-1 ring-rule">
              <h2 className="text-[1.3125rem] text-ink">Team</h2>

              {project?.teamName != null && (
                <p className="mt-1 text-[1rem] text-ink-soft">{project.teamName}</p>
              )}

              <ul className="mt-5 grid gap-4">
                {people.map((person) => (
                  <Person key={person.address} person={person} />
                ))}
              </ul>
            </section>
          </aside>

          {/* Each part of the pitch in its own card, the shape the submission
              form asked for them in. Loose on the page they ran together: a
              heading in small grey caps, then prose, then another, with nothing
              but white space saying where one ended. */}
          <div className="grid min-w-0 gap-6">
            <section className="rounded-[1.25rem] bg-paper p-8 ring-1 ring-rule sm:p-10">
              <h2 className="text-[1.3125rem] text-ink">About</h2>

              {project?.description == null ? (
                <p className="mt-4 text-[1rem] leading-relaxed text-ink-soft">
                  This team entered without writing anything about their project.
                </p>
              ) : (
                <div className="mt-4 whitespace-pre-line text-[1.0625rem] leading-relaxed text-ink">
                  {project.description}
                </div>
              )}
            </section>

            {/* What it is, then the demo, then the deck. The video is the two
                minutes somebody will actually spend, and putting the slides in
                front of it asks for the longer commitment first. */}
            {project?.demoVideoUrl != null && <Video url={project.demoVideoUrl} />}

            {project?.pitchDeckUrl != null && <Deck url={project.pitchDeckUrl} />}
          </div>
        </div>
      </Measure>
    </main>
  );
}

/* The two marks on the rail's buttons, drawn rather than fetched. GitHub is
   filled because that is the logo; the globe is stroked because it is a symbol
   for "the live thing" rather than anybody's mark. */

function Repo() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className="size-4 shrink-0">
      <path d="M8 .8a7.2 7.2 0 0 0-2.28 14.03c.36.07.49-.16.49-.35v-1.23c-2 .44-2.43-.96-2.43-.96-.33-.83-.8-1.06-.8-1.06-.65-.45.05-.44.05-.44.72.05 1.1.74 1.1.74.64 1.1 1.68.78 2.09.6.07-.47.25-.79.46-.97-1.6-.18-3.28-.8-3.28-3.56 0-.79.28-1.43.74-1.93-.07-.19-.32-.92.07-1.91 0 0 .6-.2 1.98.73a6.8 6.8 0 0 1 3.6 0c1.37-.93 1.97-.73 1.97-.73.4.99.15 1.72.07 1.9.47.51.75 1.15.75 1.94 0 2.77-1.69 3.38-3.29 3.56.26.22.49.66.49 1.33v1.97c0 .19.13.42.5.35A7.2 7.2 0 0 0 8 .8Z" />
    </svg>
  );
}

/* The Stellar mark: the four pointed star between two arcs. */
function Stellar() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="size-4 shrink-0">
      <path d="M12 1.6a10.4 10.4 0 0 0-9.2 5.6l1.9 1a8.3 8.3 0 0 1 14.1-1.5l1.7-1.3A10.4 10.4 0 0 0 12 1.6Zm0 20.8a10.4 10.4 0 0 0 9.2-5.6l-1.9-1a8.3 8.3 0 0 1-14.1 1.5l-1.7 1.3A10.4 10.4 0 0 0 12 22.4Z" />
      <path d="m12 7.4 1.3 3.3 3.3 1.3-3.3 1.3L12 16.6l-1.3-3.3L7.4 12l3.3-1.3L12 7.4Z" />
    </svg>
  );
}

function Globe() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      className="size-4 shrink-0"
    >
      <circle cx="8" cy="8" r="6.2" />
      <path d="M1.8 8h12.4M8 1.8c1.6 1.7 2.5 3.9 2.5 6.2S9.6 12.5 8 14.2C6.4 12.5 5.5 10.3 5.5 8S6.4 3.5 8 1.8Z" />
    </svg>
  );
}

/**
 * One member, named when the address leads to somebody who signed in.
 *
 * Named rows go to that person's profile; anonymous ones stay put, because an
 * address that nobody has claimed has no page to send anybody to.
 */
function Person({ person }: { person: Member }) {
  const name = person.displayName ?? (person.username === null ? null : `@${person.username}`);

  const inside = (
    <>
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-paper-sunk text-[0.9375rem] font-semibold text-ink-soft ring-1 ring-inset ring-rule">
        {person.avatarUrl === null ? (
          (name ?? person.address).slice(0, 1).toUpperCase()
        ) : (
          <img src={person.avatarUrl} alt="" className="size-full object-cover" />
        )}
      </span>

      <span className="min-w-0">
        {/* A name at full ink when there is one, and the address in the type
            addresses are set in when there is not. The two are different kinds
            of fact and reading them at the same weight hides which is which. */}
        <span
          className={`block truncate text-[1rem] text-ink ${
            name === null ? "tabular text-[0.9375rem]" : "font-medium"
          }`}
        >
          {name ?? `${person.address.slice(0, 4)}…${person.address.slice(-4)}`}
        </span>

        <span className="label text-[0.75rem] text-ink-faint">
          {person.captain ? "Captain" : "Member"}
        </span>
      </span>
    </>
  );

  return (
    <li>
      {person.username === null ? (
        <span className="flex items-center gap-3">{inside}</span>
      ) : (
        <Link
          href={`/u/${person.username}`}
          className="flex items-center gap-3 transition-opacity duration-150 ease-settle hover:opacity-70"
        >
          {inside}
        </Link>
      )}
    </li>
  );
}
