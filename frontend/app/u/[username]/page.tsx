import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ButtonLink, Measure } from "../../components/primitives";
import { Joined } from "../../account/joined";
import { Mark, type Where } from "../../components/marks";
import { currentUser } from "../../../lib/supabase/server";
import { nameOf, profileNamed, type Profile } from "../../../lib/profile";
import { placeOf } from "../../../lib/countries";

/**
 * Somebody, at an address you can send to a person.
 *
 * The settings page and this one hold the same seven fields and are not the
 * same page, which is the distinction that was missing while there was only
 * one. Settings is a form: labelled boxes, one save, and every field editable
 * whether or not it has anything in it. This is the read: cards, only what has
 * been filled in, and nothing on it to press by accident.
 *
 * It is public and takes the anonymous key, because a profile behind a session
 * is a profile nobody can link to. What is on it is only ever what somebody
 * chose to put there.
 *
 * The links are marks under the name rather than a card of labelled rows. A row
 * reading "GitHub — ada" spends a line saying what the logo already says, and
 * three of them made a panel out of three links. As marks they are one gesture
 * wide and they are where somebody looks for them.
 *
 * The one thing here nobody typed is the list of hackathons, and it is read by
 * the connected wallet rather than by the profile. That means it appears on
 * your own profile and not on anybody else's, which is honest rather than
 * incomplete: the chain approved an address, and this product has no proof yet
 * that any address belongs to any account.
 */

export const dynamic = "force-dynamic";

export default async function PublicProfile({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;

  /* Lower cased before the lookup. `citext` would match either way, but a link
     somebody typed with a capital in it should reach the same page rather than
     a different one that happens to work. */
  const profile = await profileNamed(decodeURIComponent(username).toLowerCase());

  if (profile === null) {
    notFound();
  }

  const me = await currentUser();
  const mine = me !== null && me.id === profile.id;

  const name = nameOf(profile, null);
  const place = placeOf(profile.country, profile.city);

  return (
    <main className="flex-1">
      <section className="border-b border-rule">
        <Measure wide className="py-12 sm:py-16">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-5">
              <Portrait src={profile.avatarUrl} name={name} />

              <div className="min-w-0">
                <h1 className="text-[clamp(1.75rem,3.4vw,2.5rem)]">{name}</h1>

                <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.9375rem] text-ink-soft">
                  <span>@{profile.username}</span>

                  {place !== null && (
                    <>
                      <span aria-hidden className="text-ink-faint">
                        ·
                      </span>

                      <span className="inline-flex items-center gap-1.5">
                        <Pin />
                        {place}
                      </span>
                    </>
                  )}
                </p>

                {profile.bio !== null && (
                  <p className="mt-5 max-w-[36rem] text-[1.0625rem] leading-relaxed text-ink-soft">
                    {profile.bio}
                  </p>
                )}

                <Elsewhere profile={profile} />
              </div>
            </div>

            {/* Only on your own. A button to edit somebody else's profile is a
                button that exists to be refused. */}
            {mine && (
              <ButtonLink href="/account" intent="quiet">
                Edit profile
              </ButtonLink>
            )}
          </div>
        </Measure>
      </section>

      <Measure wide className="py-14">
        {/* One card, because there is one thing down here: the part of this
            page nobody typed. Everything else is above the rule, where it
            belongs, beside the person it is about. */}
        {mine && (
          <Panel title="Hackathons entered">
            <Joined />
          </Panel>
        )}
      </Measure>
    </main>
  );
}

/**
 * A card, which is what a read only surface gets instead of a heading and a
 * hairline.
 *
 * The settings page groups by heading because a form is a sequence somebody
 * works down. Here there is no sequence: these are separate facts about one
 * person and a reader takes them in any order, so each one is given an edge to
 * be taken in by.
 */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-paper p-6 ring-1 ring-rule">
      <h2 className="text-[1.125rem]">{title}</h2>

      <div className="mt-5">{children}</div>
    </section>
  );
}

function Portrait({ src, name }: { src: string | null; name: string }) {
  if (src !== null) {
    return (
      <img
        src={src}
        alt=""
        width={96}
        height={96}
        className="size-20 shrink-0 rounded-full object-cover ring-1 ring-rule sm:size-24"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid size-20 shrink-0 place-items-center rounded-full bg-ink text-[1.75rem] font-semibold text-signal sm:size-24 sm:text-[2rem]"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * Where else this person is, as marks.
 *
 * The mark and nothing beside it. Everybody who would follow one of these
 * already knows the logo, and the handle they would read next to it is on the
 * page it opens. Absent entirely when there are none, because a row of greyed
 * out logos is an interface advertising what somebody has not done.
 */
function Elsewhere({ profile }: { profile: Profile }) {
  const links: { key: Where; title: string; href: string }[] = [
    profile.github === null
      ? null
      : {
          key: "github" as const,
          title: `GitHub, ${profile.github}`,
          href: `https://github.com/${profile.github}`,
        },
    profile.x === null
      ? null
      : {
          key: "x" as const,
          title: `X, @${profile.x}`,
          href: `https://x.com/${profile.x}`,
        },
    profile.linkedin === null
      ? null
      : { key: "linkedin" as const, title: "LinkedIn", href: profile.linkedin },
  ].filter((one) => one !== null);

  if (links.length === 0) {
    return null;
  }

  return (
    /* Pulled left by exactly the padding inside the first target, so the marks
       start on the same vertical as the name and the bio above them rather than
       one hit area in from it. The row is the only thing on this page that is
       centred inside a box, and without this it was the only thing out of
       line. */
    <ul className="-ml-[0.5625rem] mt-5 flex flex-wrap items-center">
      {links.map((link) => (
        <li key={link.key}>
          <a
            href={link.href}
            target="_blank"
            rel="me noreferrer"
            /* The name is on the link rather than in it, so somebody reading
               with their ears is told which account they are about to open
               rather than hearing "link" three times. */
            aria-label={link.title}
            title={link.title}
            className="grid size-9 place-items-center rounded-full transition-colors duration-150 ease-settle hover:bg-paper-sunk"
          >
            {/* One size for all three. They are drawn on different grids and at
                their published proportions X reads as the small one, so the box
                spaces them evenly and the glyph is matched by eye rather than
                by number. */}
            <Mark where={link.key} className="size-[1.125rem]" />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Where somebody is, drawn rather than spelled out in front of the place. */
function Pin() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="size-4 shrink-0 text-ink-faint"
    >
      <path d="M8 14.5s5-4.2 5-7.7a5 5 0 0 0-10 0c0 3.5 5 7.7 5 7.7Z" strokeLinejoin="round" />
      <circle cx="8" cy="6.6" r="1.9" />
    </svg>
  );
}
