/**
 * Which ways in this deployment actually offers.
 *
 * Every provider here needs two things that live outside this repository: an
 * application registered with the provider, and a client id and secret pasted
 * into the Supabase dashboard. Neither is something the code can check, and a
 * button for a provider nobody has registered does not fail quietly. It sends
 * somebody to a consent screen that says the app is misconfigured, which is a
 * worse first impression than not offering it.
 *
 * So the list is configuration rather than a constant. A deployment names what
 * it has wired up and the page offers exactly that, which is the same rule
 * `authConfigured` follows for signing in at all.
 *
 * This list is now the whole of it. A one time code to an inbox used to sit
 * beside these and needed no registration anywhere, so it was always offered;
 * with it gone, a deployment that names nothing here has no way in at all and
 * the sign in page says so rather than showing an empty card.
 */

export const PROVIDERS = ["google", "github"] as const;

export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_NAMES: Record<Provider, string> = {
  google: "Google",
  github: "GitHub",
};

export function providersOffered(): Provider[] {
  const named = process.env["NEXT_PUBLIC_OAUTH_PROVIDERS"];

  if (named === undefined || named.trim().length === 0) {
    return [];
  }

  /* Filtered against the list rather than trusted, so a typo in an environment
     variable drops one button instead of rendering a provider Supabase has
     never heard of and failing at the redirect. */
  return named
    .split(",")
    .map((one) => one.trim().toLowerCase())
    .filter((one): one is Provider => (PROVIDERS as readonly string[]).includes(one));
}
