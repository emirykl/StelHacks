-- What a sponsor wants said beside their name.
--
-- The contract has always had somewhere to put this. `sponsor_tier` takes a
-- thirty two byte note and the record it writes calls it "digest of who the
-- sponsor is and whatever they wanted said beside their name, which lives off
-- chain for the same reason the hackathon's own description does: a logo and a
-- sentence are not rules". Until now the interface sent thirty two zeroes,
-- because there was nowhere to keep the thing being committed to. This is that
-- place, and the digest the chain stores is taken over exactly these fields.
--
-- Nullable, all three. A contribution is valid without any of them — the money
-- reaches the winner whatever the sponsor chose to say about themselves — and a
-- wallet that donated before this landed has a credit row with nothing in these
-- columns rather than a row that has to be invented. The wall falls back to the
-- account's own display name, and then to the address.
--
-- Lengths are bounded here rather than only in the form. These are printed on
-- somebody else's event page, and a check that lives in the browser is a check
-- whoever is not using the browser does not have.

alter table public.sponsor_credits
  add column sponsor_name text,
  add column sponsor_url text,
  add column sponsor_note text;

alter table public.sponsor_credits
  add constraint sponsor_credits_name_length
    check (sponsor_name is null or char_length(sponsor_name) between 1 and 80),
  add constraint sponsor_credits_url_length
    check (sponsor_url is null or char_length(sponsor_url) between 1 and 200),
  add constraint sponsor_credits_note_length
    check (sponsor_note is null or char_length(sponsor_note) between 1 and 500);

comment on column public.sponsor_credits.sponsor_name is
  'What the backer asked to be called. Covered by the digest the contract stores against the contribution.';
