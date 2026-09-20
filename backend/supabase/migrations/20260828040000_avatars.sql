-- Somewhere to put a picture.
--
-- The profile stored a URL and the form asked somebody to paste one, which
-- meant a picture could only come from a page that already hosted it. Almost
-- nobody has one of those. A file from the machine in front of them is what
-- everybody has, so there has to be somewhere to put it.
--
-- Public read, because an avatar appears beside a person on a page a signed out
-- visitor can see, and a signed URL that expires would put a broken image
-- there.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  -- Two megabytes. An avatar is displayed at ninety six pixels and anything
  -- past this is a photograph somebody has not looked at, uploaded once and
  -- then served to every visitor forever.
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The first path segment is the owner's id, and that is the whole access rule.
-- A person may write under their own folder and nowhere else, which is checked
-- by Postgres rather than by whatever client is doing the uploading.
drop policy if exists "an avatar is readable by anyone" on storage.objects;
drop policy if exists "an avatar is written only by the person it belongs to" on storage.objects;
drop policy if exists "an avatar is replaced only by the person it belongs to" on storage.objects;
drop policy if exists "an avatar is removed only by the person it belongs to" on storage.objects;

create policy "an avatar is readable by anyone"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

create policy "an avatar is written only by the person it belongs to"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "an avatar is replaced only by the person it belongs to"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "an avatar is removed only by the person it belongs to"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
