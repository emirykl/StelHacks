-- The rest of the links a person puts on a profile.
--
-- `github_username` and `linkedin_url` were here from the first migration and
-- X was not, which made the profile page offer two of the three places a
-- hacker is actually found. One column, and the shapes for all three.
--
-- The shapes live here rather than in the form for the reason the username's
-- does: a check in a page is a check one client honours, and the next thing
-- to write a profile is a script.

alter table public.profiles
  add column if not exists x_username text;

comment on column public.profiles.x_username is
  'The handle without the @, which is what the profile URL is built from.';

-- Stored bare, so the surface owns how it is displayed and how it is linked.
-- Storing a URL instead would let two people save the same account as
-- x.com/ada and twitter.com/ada and make them look like different accounts.
alter table public.profiles
  add constraint profiles_x_username_shape check (
    x_username is null or x_username ~ '^[A-Za-z0-9_]{1,15}$'
  );

-- The two that already existed get the same treatment, and `not valid` is the
-- careful half of that: it enforces the shape on everything written from here
-- on without failing the migration over a row somebody saved before there was
-- a rule. Nothing in this schema is allowed to become unreachable because a
-- deploy could not finish.
alter table public.profiles
  add constraint profiles_github_username_shape check (
    github_username is null or github_username ~ '^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$'
  ) not valid;

alter table public.profiles
  add constraint profiles_linkedin_url_shape check (
    linkedin_url is null or linkedin_url ~ '^https://([a-z]{2,3}\.)?linkedin\.com/.{1,180}$'
  ) not valid;

-- Grants are per column, so a new column is unreachable until it is named.
-- The policy already decides whose row it is.
grant update (x_username) on public.profiles to authenticated;
