-- Somewhere to put a hackathon's logo and banner.
--
-- The create form asked for two URLs, which meant artwork could only come from
-- a page that already hosted it. An organizer has a file on the machine in
-- front of them, not a CDN, so the form asked for the one thing they did not
-- have and every event that skipped it rendered as a grey card.
--
-- Separate from `avatars` rather than reusing it. The size limit and the
-- allowed shapes are different — a banner is sixteen hundred pixels wide and an
-- avatar is ninety six — and one bucket sized for the larger would raise the
-- ceiling on the smaller for nothing.
--
-- Public read, because a hackathon card is drawn for signed out visitors and a
-- signed URL that expires would put a broken image on the listing.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hackathon-art',
  'hackathon-art',
  true,
  -- Four megabytes. A banner is a wide photograph and is legitimately bigger
  -- than a portrait, but past this it is a file nobody has looked at.
  4194304,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The first path segment is the uploader's account id, and that is the whole
-- access rule. It is deliberately the account rather than the contract: the
-- artwork is chosen while the form is being filled in, before any contract
-- exists to own it.
drop policy if exists "hackathon artwork is readable by anyone" on storage.objects;
drop policy if exists "hackathon artwork is written only by its uploader" on storage.objects;
drop policy if exists "hackathon artwork is replaced only by its uploader" on storage.objects;
drop policy if exists "hackathon artwork is removed only by its uploader" on storage.objects;

create policy "hackathon artwork is readable by anyone"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'hackathon-art');

create policy "hackathon artwork is written only by its uploader"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'hackathon-art'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "hackathon artwork is replaced only by its uploader"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'hackathon-art'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "hackathon artwork is removed only by its uploader"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'hackathon-art'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
