-- A pitch deck for a project, and somewhere to put it.
--
-- Everything a team could attach so far was a link or a picture. A deck is
-- neither: it is the file they already made for the demo, and asking them to
-- host it somewhere first is asking for the one step that makes people skip it.
--
-- Optional, always, and not by omission. The contract carries three
-- requirement flags — repository, demo video, live URL — frozen at the lock,
-- and there is no flag for a deck and no way to add one, because neither
-- contract has an upgrade path. So an organizer cannot make this compulsory,
-- and the interface must not pretend otherwise.

alter table public.projects add column if not exists pitch_deck_url text;

comment on column public.projects.pitch_deck_url is
  'A PDF the team uploaded. Always optional: the frozen rules have no flag for it.';

-- Its own bucket rather than a wider list of types on the artwork one.
--
-- A deck is tens of megabytes where a banner is under four, and the size limit
-- is the whole reason to keep them apart: raising the artwork ceiling to fit a
-- deck would raise it for every logo too.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-decks',
  'project-decks',
  true,
  -- Twenty megabytes. A slide deck past this is a video with a title page.
  20971520,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The first path segment is the uploader's account id, which is the whole
-- access rule, exactly as it is for artwork. The deck is chosen while the form
-- is being filled in, before the submission exists to own it.

drop policy if exists "a pitch deck is readable by anyone" on storage.objects;
create policy "a pitch deck is readable by anyone"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'project-decks');

drop policy if exists "a pitch deck is written only by its uploader" on storage.objects;
create policy "a pitch deck is written only by its uploader"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-decks'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "a pitch deck is replaced only by its uploader" on storage.objects;
create policy "a pitch deck is replaced only by its uploader"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-decks'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "a pitch deck is removed only by its uploader" on storage.objects;
create policy "a pitch deck is removed only by its uploader"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-decks'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
