-- The service role can read a profile.
--
-- It could not, and the reason is worth writing down because it will come up
-- again with every table added from here.
--
-- Bypassing row level security is not the same as being granted the table.
-- `service_role` skips the policies, so it never sees a "no rows" answer, but
-- it still needs the grant to touch the table at all. With the project's new
-- tables setting turned off, nothing is granted to anybody automatically, so a
-- table reads as missing to the backend until a line like this one exists. The
-- failure looks like an empty result rather than an error through PostgREST,
-- which is exactly the shape that would otherwise be mistaken for "no data yet".
--
-- Read only, deliberately. A profile belongs to the person it describes, and
-- the indexer has no business writing one; the signup trigger creates it and
-- the owner edits it. Everything the backend needs from a profile, it needs in
-- order to show something, not to change it.

grant select on public.profiles to service_role;
