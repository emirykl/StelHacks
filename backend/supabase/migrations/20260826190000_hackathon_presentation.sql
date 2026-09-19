-- What a hackathon looks like on a card, which the chain has no opinion about.
--
-- Everything that decides an outcome is in the constitution and hashed. None of
-- this is: a banner, a location and a set of tags change nothing about who wins
-- or what they are paid, which is exactly why they live here rather than on
-- chain. Putting them in the constitution would mean paying ledger rent to
-- freeze a picture, and would make changing a typo in a category a thing that
-- cannot be done.
--
-- The card needs them all the same. A grid of names and prizes is a list; a
-- reader deciding between six hackathons is looking for whether it is remote,
-- what it is about, and whether they can still get in.

alter table public.hackathons
  add column if not exists banner_url text,
  add column if not exists location text,
  add column if not exists tags text[] not null default '{}';

-- A banner is decoration and a logo is identity, so they are separate columns
-- rather than one image reused at two sizes: a wide banner cropped to a square
-- is a bad logo, and a square logo stretched to a banner is worse.
comment on column public.hackathons.banner_url is
  'Wide image for the top of the hackathon page. Decoration; nothing reads it to decide anything.';

-- Null means the organizer has not said. That is different from remote, and a
-- card that prints "Virtual" for both is inventing a fact about an event that
-- might be in a building.
comment on column public.hackathons.location is
  'Where it happens, in the organizer''s words. Null when unsaid; "Virtual" is a value like any other.';

comment on column public.hackathons.tags is
  'What it is about, for reading rather than filtering. Free text, because the subjects hackathons are about are not a list anybody can fix in advance.';

-- Bounded, because these reach a card and a card has a size. A tagline already
-- has a limit for the same reason and these follow it.
alter table public.hackathons
  add constraint hackathons_location_length check (char_length(location) <= 80),
  add constraint hackathons_banner_url_length check (char_length(banner_url) <= 2048),
  add constraint hackathons_tags_bounded check (
    cardinality(tags) <= 8
    and not exists (select 1 from unnest(tags) as tag where char_length(tag) > 40)
  );

-- No new grants. `hackathons` is already readable by everyone and writable only
-- by the service role, and these columns are part of the same row: a column
-- added later inherits the table's policies rather than quietly arriving
-- without any.
