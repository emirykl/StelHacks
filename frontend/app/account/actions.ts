"use server";

import { revalidatePath } from "next/cache";

import { currentUser, serverClient } from "../../lib/supabase/server";
import { whatIsWrong, type ProfileEdit } from "../../lib/profile";

/**
 * Saving a profile, on the server, as the person who owns it.
 *
 * A server action rather than a fetch from the form: the client never gets to
 * name which row it is writing. The session cookie decides that, the update is
 * keyed by `auth.uid()`, and the policy in the schema refuses anything else. A
 * request that tried to save somebody else's profile would fail at Postgres,
 * not here, and that is the arrangement worth keeping.
 */

export interface Saved {
  ok: boolean;
  /** Said in the person's terms, or absent when nothing went wrong. */
  message: string | null;
}

export async function saveProfile(_before: Saved, form: FormData): Promise<Saved> {
  const edit: ProfileEdit = {
    username: read(form, "username").toLowerCase(),
    displayName: read(form, "displayName"),
    bio: read(form, "bio"),
    github: read(form, "github").replace(/^@/, ""),
    linkedin: read(form, "linkedin"),
    x: read(form, "x").replace(/^@/, ""),
    country: read(form, "country").toUpperCase(),
    city: read(form, "city"),
  };

  const wrong = whatIsWrong(edit);

  if (wrong !== null) {
    return { ok: false, message: wrong };
  }

  const db = await serverClient();
  const user = await currentUser();

  if (db === null || user === null) {
    return { ok: false, message: "Your session has expired. Sign in again." };
  }

  const columns = {
    username: edit.username,
    display_name: blank(edit.displayName),
    bio: blank(edit.bio),
    github_username: blank(edit.github),
    linkedin_url: blank(edit.linkedin),
    x_username: blank(edit.x),
    country: blank(edit.country),
    city: blank(edit.city),
  };

  /*
    Written without the later columns when they are not there yet, so a
    deployment whose database is a migration behind can still save the fields it
    does have. The alternative is a save button that fails whole and says
    nothing about which field the reader cannot have.
  */
  let { error } = await db.from("profiles").update(columns).eq("id", user.id);

  if (error !== null && /x_username|country|city/.test(error.message)) {
    const { x_username: _x, country: _country, city: _city, ...rest } = columns;
    ({ error } = await db.from("profiles").update(rest).eq("id", user.id));
  }

  if (error !== null) {
    /* The one failure worth naming, because it is the only one the person can
       do anything about. */
    return {
      ok: false,
      message: /duplicate key|unique/i.test(error.message)
        ? "That username is taken."
        : error.message,
    };
  }

  /* The header renders the name too, so the whole tree is asked again rather
     than only this page. */
  revalidatePath("/", "layout");

  return { ok: true, message: "Saved." };
}

function read(form: FormData, field: string): string {
  const value = form.get(field);

  return typeof value === "string" ? value.trim() : "";
}

/** Empty is absent. A profile with an empty string in it renders a link to nowhere. */
function blank(value: string): string | null {
  return value.length === 0 ? null : value;
}

/**
 * The picture, written on its own.
 *
 * Separate from the profile save because it is chosen at the top of the page
 * and the rest is typed further down. Nothing else has to be valid for a
 * picture to be true, so making it wait behind a username that is currently
 * mistyped would be inventing a dependency the data does not have.
 */
export async function saveAvatar(url: string): Promise<Saved> {
  if (!url.startsWith("https://")) {
    return { ok: false, message: "A picture has to be an https address." };
  }

  const db = await serverClient();
  const user = await currentUser();

  if (db === null || user === null) {
    return { ok: false, message: "Your session has expired. Sign in again." };
  }

  const { error } = await db.from("profiles").update({ avatar_url: url }).eq("id", user.id);

  if (error !== null) {
    return { ok: false, message: error.message };
  }

  /* The header draws it too. */
  revalidatePath("/", "layout");

  return { ok: true, message: null };
}
