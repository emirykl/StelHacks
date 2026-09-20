"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";

import { CommitButton } from "../components/commit-button";
import { Mark } from "../components/marks";
import { saveProfile, type Saved } from "./actions";
import type { Profile } from "../../lib/profile";

/**
 * Everything about somebody that they typed themselves.
 *
 * One form and one save, rather than a field that writes as you leave it.
 * Saving on blur is pleasant until a half typed handle is committed because
 * somebody clicked away to check it, and this form holds three fields that are
 * only correct once they are finished.
 *
 * The labels carry the whole explanation. Every field had a line of grey help
 * under it and together they made a page of instructions for six boxes whose
 * names already said what they were; what those lines actually explained was
 * the shape of a valid answer, and the form now says that only when an answer
 * is wrong, which is when somebody needs it.
 *
 * The links are handles, not addresses. Somebody pastes their profile URL, we
 * keep the part that identifies them, and the surface builds the link. Storing
 * what was pasted would let the same account arrive as x.com/ada and
 * twitter.com/ada and appear to be two people.
 */

const START: Saved = { ok: false, message: null };

export function ProfileForm({
  profile,
  email,
  countries,
  suggestedName,
}: {
  profile: Profile;
  /** Shown, never edited. It belongs to the account this session came in on. */
  email: string | null;
  /**
   * Named on the server and handed over, rather than named here.
   *
   * `Intl.DisplayNames` is backed by whatever ICU data the runtime carries, and
   * Node's is not the browser's: the server called one island "Falkland Islands
   * (Islas Malvinas)" and Chrome called it "Falkland Islands", which is a
   * hydration mismatch that throws the whole form away and rebuilds it on the
   * client. One of the two has to win, and it has to be the one that rendered
   * the HTML.
   */
  countries: { code: string; name: string }[];
  /** What the provider called them, offered when they have not said otherwise. */
  suggestedName: string | null;
}) {
  const [state, act, saving] = useActionState(saveProfile, START);

  return (
    <form action={act} className="grid gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          name="displayName"
          label="Display name"
          defaultValue={profile.displayName ?? suggestedName ?? ""}
          placeholder="Ada Lovelace"
        />

        <Field
          name="username"
          label="Username"
          defaultValue={profile.username}
          placeholder="ada"
        />
      </div>

      {/*
        Read only, and not part of the save.

        It is the address the account was created with and it is changed where
        it lives, which is the provider you sign in through. A box here that
        looked editable would be a promise this form cannot keep, and the
        version of it that could keep the promise was a second form with its own
        confirmation flow sitting under a heading of its own, which is a lot of
        page for something almost nobody does.
      */}
      <label className="grid gap-1.5">
        <span className="text-[0.8125rem] font-semibold text-ink">Email</span>

        <input
          value={email ?? "no address on this account"}
          readOnly
          aria-readonly
          tabIndex={-1}
          className="h-11 cursor-default bg-paper-sunk px-3.5 text-[0.9375rem] text-ink-soft ring-1 ring-inset ring-rule outline-none"
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-[0.8125rem] font-semibold text-ink">Bio</span>

        <textarea
          name="bio"
          defaultValue={profile.bio ?? ""}
          rows={3}
          maxLength={500}
          placeholder="What you build, in a sentence."
          className="resize-y bg-paper p-3 text-[0.9375rem] leading-relaxed text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
        />
      </label>

      {/* A list for the country and a box for the city.

          The country is picked because it is stored as a code and read back as
          a name, and free text would put Turkey, Türkiye and TR in three rows
          that no query could ever bring together. The city has no list worth
          shipping and nothing will ever group by it, so it is left as typing. */}
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-[0.8125rem] font-semibold text-ink">Country</span>

          <select
            name="country"
            defaultValue={profile.country ?? ""}
            className="h-11 appearance-none bg-paper bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%20stroke%3D%22%23a8a29c%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m4%206%204%204%204-4%22/%3E%3C/svg%3E')] bg-[length:1rem] bg-[right_0.875rem_center] bg-no-repeat pl-3.5 pr-10 text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
          >
            <option value="">Not saying</option>

            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </label>

        <Field
          name="city"
          label="City"
          defaultValue={profile.city ?? ""}
          placeholder="Istanbul"
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <Field
          name="github"
          label="GitHub"
          defaultValue={profile.github ?? ""}
          placeholder="ada"
          icon={<Mark where="github" />}
        />

        <Field
          name="x"
          label="X"
          defaultValue={profile.x ?? ""}
          placeholder="ada"
          icon={<Mark where="x" className="size-[0.9375rem]" />}
        />

        <Field
          name="linkedin"
          label="LinkedIn"
          defaultValue={profile.linkedin ?? ""}
          placeholder="https://linkedin.com/in/ada"
          icon={<Mark where="linkedin" />}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <CommitButton type="submit" disabled={saving}>
          {saving ? "Saving" : "Save profile"}
        </CommitButton>

        {/* One line, in the colour of the answer. A form that says nothing after
            a save leaves somebody pressing the button again to find out. */}
        {state.message !== null && (
          <p
            className={`text-[0.875rem] leading-relaxed ${
              state.ok ? "text-verified" : "text-broken"
            }`}
            role="status"
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  icon,
}: {
  name: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  /** Sits inside the box, so the mark reads as belonging to what is typed. */
  icon?: ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[0.8125rem] font-semibold text-ink">{label}</span>

      {/* The ring is on the wrapper rather than the input, so a mark inside the
          box is inside the frame that lights up on focus rather than beside a
          second one. */}
      <div className="flex h-11 items-center gap-2.5 bg-paper px-3.5 ring-1 ring-inset ring-rule transition-shadow duration-150 ease-settle focus-within:ring-ink">
        {icon !== undefined && <span className="grid w-4 place-items-center">{icon}</span>}

        <input
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none"
        />
      </div>
    </label>
  );
}
