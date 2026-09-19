-- The service role can write the metadata tables.
--
-- It could not, and the omission was invisible from the outside. Read grants
-- went to every table in the last migration; write grants went only to the two
-- derived ones, because those were the tables being thought about. The three
-- that an organizer or a team fills in got neither a client write path, which
-- was deliberate, nor a backend one, which was not.
--
-- What made it worth catching rather than shrugging at is how it failed. A
-- refused insert left the table empty, and an empty table reads exactly like a
-- policy correctly hiding a row. The visibility tests were reporting that a
-- public gallery showed nothing to anybody, and every one of those refusals
-- would have looked like a pass in a suite that only checked what could not be
-- seen.
--
-- Writing a project description cannot move money or change a result, so this
-- stays inside the rule the whole data layer is built on. What it does buy is
-- the moderation and cleanup paths, and a fixture that can set itself up.

grant insert, update, delete on public.hackathons to service_role;
grant insert, update, delete on public.teams to service_role;
grant insert, update, delete on public.projects to service_role;
