"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";

import { Button } from "../components/primitives";
import { applyToOrganize, type Sent } from "./actions";

/**
 * The seven things we need before deciding whether somebody runs events here.
 *
 * Seven, and each one is a question a reviewer would otherwise have to write an
 * email to ask. Nothing is here to qualify a lead: a field whose answer would
 * not change the decision is a field that costs every applicant time and earns
 * us nothing.
 *
 * No help text under the boxes. The labels say what goes in them, and the one
 * thing a reader could get wrong, the shape of a valid answer, is said only when
 * an answer is wrong. That is the same arrangement the profile form arrived at.
 *
 * The same component is the whole of the modal and the whole of the page,
 * because a form that exists twice is a form that disagrees with itself
 * eventually.
 */

const START: Sent = { ok: false, message: null };

export function ApplicationForm({
  email,
  onSent,
}: {
  /** The address the account signed in with, offered as the one to write back to. */
  email: string | null;
  /** The modal uses this to change what it is showing. The page does not need it. */
  onSent?: () => void;
}) {
  const [state, act, sending] = useActionState(applyToOrganize, START);

  /* Answered in place rather than by closing. Somebody who has just filled in
     seven fields is owed a sentence saying it arrived, and a panel that
     vanishes on success leaves them wondering whether it did. */
  if (state.ok) {
    return (
      <div className="grid gap-5">
        <p className="text-[1.0625rem] leading-relaxed text-ink">
          Sent. We read these by hand and write back to the address you gave.
        </p>

        {onSent !== undefined && (
          <div>
            <Button type="button" intent="quiet" onClick={onSent}>
              Close
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={act} className="grid gap-5">
      <Field name="organization" label="Who is running it" placeholder="Acme, or your name" />

      <Field
        name="contactEmail"
        label="Contact email"
        defaultValue={email ?? ""}
        placeholder="you@example.com"
      />

      {/* One box for whichever link they have. Asking for a site and a handle
          separately gets two empty boxes from anybody who has only one. */}
      <Field name="link" label="Website or X" placeholder="https://" />

      <Field name="eventName" label="Event name" placeholder="A working name is fine" />

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Free text rather than a date picker. A month is the real answer at
            the point somebody is asking permission, and a picker would force a
            day that is not decided and then look like a promise. */}
        <Field name="eventWindow" label="When" placeholder="March 2026" />

        <Field
          name="participantsEstimate"
          label="Expected hackers"
          placeholder="150"
          inputMode="numeric"
        />
      </div>

      {/* In dollars whatever the prize will be denominated in, because this
          number's job is to be comparable across applications rather than
          faithful to an asset nobody has chosen yet. */}
      <Field
        name="prizeEstimate"
        label="Prize pool, in US dollars"
        placeholder="10000"
        inputMode="numeric"
      />

      <div className="mt-1 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={sending}>
          {sending ? "Sending" : "Send application"}
        </Button>

        {state.message !== null && (
          <p className="text-[0.875rem] leading-relaxed text-broken" role="status">
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
  inputMode,
  icon,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  inputMode?: "numeric";
  icon?: ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[0.8125rem] font-semibold text-ink">{label}</span>

      <div className="flex h-11 items-center gap-2.5 bg-paper px-3.5 ring-1 ring-inset ring-rule transition-shadow duration-150 ease-settle focus-within:ring-ink">
        {icon !== undefined && <span className="grid w-4 place-items-center">{icon}</span>}

        <input
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none"
        />
      </div>
    </label>
  );
}
