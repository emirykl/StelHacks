/**
 * Telling us something happened.
 *
 * There is a review screen for organizer applications and it is where the
 * decisions are made, so this is not the record of anything: it is the nudge
 * that stops the screen from being somewhere somebody has to remember to look.
 * That distinction decides everything else in this file. Nothing here is allowed
 * to fail an action, because an application that landed in the database is an
 * application whether or not a mail server was reachable, and refusing it over a
 * notification would lose the thing that matters to save the thing that does
 * not.
 *
 * Resend, because it is one HTTP call with one key and no SDK, and because the
 * alternative for a product with a single recipient is a mail server nobody is
 * going to run. Unset key means unset feature: a deployment without one still
 * takes applications and still reviews them, it just does not get told.
 */

const endpoint = "https://api.resend.com/emails";

interface Note {
  subject: string;
  /** Plain text. Nothing here is worth a template, and a text mail cannot spoof itself. */
  body: string;
}

export async function tellUs({ subject, body }: Note): Promise<void> {
  const key = process.env["RESEND_API_KEY"];
  const to = process.env["APPLICATIONS_EMAIL"];

  if (key === undefined || to === undefined) {
    return;
  }

  /* Resend's shared sender, which only delivers to the address that owns the
     Resend account. That is exactly the shape of this feature, so it is the
     default rather than something to configure before anything works. A
     deployment with its own verified domain overrides it. */
  const from = process.env["APPLICATIONS_FROM"] ?? "StelHacks <onboarding@resend.dev>";

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text: body }),
    });
  } catch {
    /* Swallowed on purpose. See the note at the top: the caller has already
       done the thing that mattered and this was the postscript. */
  }
}
