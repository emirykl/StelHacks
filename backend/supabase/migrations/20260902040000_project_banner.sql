-- A banner for a project, the same way a hackathon has one.
--
-- The table already carried a logo and a list of screenshots, which covers the
-- card and the gallery but not the top of the page a project gets. A submission
-- is the thing a judge reads and a visitor scrolls, and it was the only page in
-- the product that opened on a hairline rather than on something the team made.
--
-- Screenshots would have done at a push. They are not the same object: a
-- screenshot is evidence of the thing working and there can be ten of them, a
-- banner is one picture that sets the top of a page. Overloading the first as
-- the second is how the gallery ends up with a header in it.

alter table public.projects add column if not exists banner_url text;

comment on column public.projects.banner_url is
  'Wide artwork across the top of the project page. Nothing here decides an outcome.';
