-- Who somebody is, and which wallets they have proved they hold.
--
-- Nothing in this file decides an outcome. The chain holds the addresses that
-- win prizes, cast ballots and sign scorecards; what lives here is the human
-- readable identity a page hangs off that address, and the record of somebody
-- having proved the two belong together.
--
-- The one place this file carries real weight is `wallet_links`. A row there is
-- a claim that a Stellar address belongs to a signed in person, and every
-- profile page, leaderboard and earnings total reads it. So no client role can
-- write one: the row appears only after an edge function has watched a
-- signature over a challenge it issued itself.

create extension if not exists citext with schema extensions;

-- Profiles ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext not null unique,
  display_name text,
  bio text,
  github_username text,
  linkedin_url text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A username reaches URLs and mentions, so the shape is fixed here rather
  -- than left to whichever client happens to be writing.
  --
  -- The cast to text is load bearing. `citext` makes every operator case
  -- insensitive, including this regular expression, so without it the pattern
  -- would happily accept `Ada` and the lowercase rule would be decoration.
  constraint profiles_username_shape check (
    username::text ~ '^[a-z0-9][a-z0-9_-]{2,29}$'
  ),
  constraint profiles_bio_length check (char_length(bio) <= 500),
  constraint profiles_display_name_length check (char_length(display_name) <= 60)
);

comment on table public.profiles is
  'Written identity. The derived record, hackathons joined and prizes won, is read from chain events instead.';

-- Every signed in user has a profile from their first session, because a page
-- that has to handle "signed in but no profile yet" grows a second, weaker
-- notion of identity. The placeholder username is derived from the user id so
-- it is unique without a retry loop, and the person changes it whenever they
-- like.
create function public.claim_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 12));

  return new;
end;
$$;

create trigger claim_profile_on_signup
  after insert on auth.users
  for each row execute function public.claim_profile();

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;

-- Reaching a table takes a grant as well as a policy, and this project turns
-- off the setting that hands new tables to the API roles automatically. That
-- makes every table private the moment it is created and public only where a
-- line below says so, which is the right way round: a sealed table added later
-- is unreachable by default rather than until somebody remembers to lock it.
--
-- The update grant is per column on purpose. A policy decides which rows a
-- person may touch; this decides which fields exist for them to touch at all,
-- so `id` and `created_at` are beyond reach whatever the policy says.
grant select on public.profiles to anon, authenticated;
grant update (username, display_name, bio, github_username, linkedin_url, avatar_url)
  on public.profiles to authenticated;

-- A profile is public. The gallery, the judge list and every project page show
-- one, and a signed out visitor sees all of them.
create policy "profiles are readable by anyone"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "a profile is written only by the person it belongs to"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Deliberately no insert policy: the signup trigger owns that, so a profile
-- can never exist without a user behind it. Deliberately no delete policy
-- either, because a profile referenced by a past hackathon is part of a record
-- that is supposed to outlive the account.

-- Wallets -------------------------------------------------------------------

-- A challenge is issued to one person for one address and is good once.
create table public.wallet_challenges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  address text not null,
  nonce text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,

  constraint wallet_challenges_address_shape check (address ~ '^G[A-Z2-7]{55}$')
);

create index wallet_challenges_open
  on public.wallet_challenges (profile_id, address)
  where consumed_at is null;

comment on table public.wallet_challenges is
  'Server issued nonces. Unreadable by every client role: a challenge somebody else can read is a challenge somebody else can answer.';

alter table public.wallet_challenges enable row level security;
-- No policies at all. The edge function reaches this with the service role;
-- every client role is refused by the absence of a policy rather than by one
-- that has to be read carefully to see what it forbids.

create table public.wallet_links (
  address text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  verified_at timestamptz not null default now(),

  constraint wallet_links_address_shape check (address ~ '^G[A-Z2-7]{55}$')
);

create index wallet_links_by_profile on public.wallet_links (profile_id);

comment on table public.wallet_links is
  'Proved ownership of a Stellar address. Written only by the challenge verifier, never by a client.';

alter table public.wallet_links enable row level security;

-- Read only for everyone, and no write grant for any client role at all. The
-- verifier reaches this as the service role, which is granted separately.
grant select on public.wallet_links to anon, authenticated;
grant select, insert, delete on public.wallet_links to service_role;
grant select, insert, update on public.wallet_challenges to service_role;

-- Public, because the whole point is that anyone can see which builder an
-- address belongs to and check their record against the chain themselves.
create policy "wallet links are readable by anyone"
  on public.wallet_links for select
  to anon, authenticated
  using (true);

-- No insert, update or delete policy for any client role. A client that could
-- write here could claim an address it does not hold, and every earnings total
-- and profile page in the product reads this table. The row appears only after
-- the verifier has checked a signature over a challenge it issued.
