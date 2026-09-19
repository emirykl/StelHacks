-- A hackathon, the teams in it, and what they entered.
--
-- Everything here is text and pictures. The chain holds the constitution hash,
-- the phase, the ranking and every payment; this holds the name somebody typed
-- and the screenshot they uploaded. If a row here disagrees with the chain, the
-- row is wrong, and the page shows the chain.
--
-- The split runs through the file. Tables an organizer or a team writes are
-- ordinary rows with an owner. Tables the indexer writes are marked derived and
-- have no client write path at all, because they must be droppable and
-- rebuildable by replaying events from ledger zero; a row somebody typed into
-- one of those could not be regenerated and would quietly become authoritative.

-- A Soroban contract address, which is how a hackathon is named here. There is
-- no separate identifier: the contract is the hackathon.
create domain public.contract_address as text
  check (value ~ '^C[A-Z2-7]{55}$');

create domain public.stellar_address as text
  check (value ~ '^G[A-Z2-7]{55}$');

-- The event, as the organizer describes it ----------------------------------

create table public.hackathons (
  contract_id public.contract_address primary key,
  slug extensions.citext not null unique,
  name text not null,
  tagline text,
  description text,
  logo_url text,
  website_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint hackathons_slug_shape check (slug::text ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  constraint hackathons_name_length check (char_length(name) between 1 and 120),
  constraint hackathons_tagline_length check (char_length(tagline) <= 200),
  constraint hackathons_description_length check (char_length(description) <= 20000)
);

comment on table public.hackathons is
  'What an organizer wrote about their event. The rules that decide the outcome are on chain.';

create trigger hackathons_touch_updated_at
  before update on public.hackathons
  for each row execute function public.touch_updated_at();

-- The event, as the chain reports it (derived) --------------------------------

-- Kept apart from the table above rather than folded into it, and the reason is
-- the rebuild rule. Everything here comes from events and can be thrown away
-- and rebuilt; everything above was typed by a person and cannot. One table
-- holding both would be neither droppable nor safely writable.
create table public.hackathon_state (
  contract_id public.contract_address primary key,
  organizer public.stellar_address not null,
  constitution_hash bytea not null,
  phase smallint not null,
  visibility smallint not null,
  prize_asset public.contract_address,
  vault_id public.contract_address,
  observed_at_ledger bigint not null,

  constraint hackathon_state_phase_range check (phase between 0 and 9),
  constraint hackathon_state_visibility_range check (visibility between 0 and 2)
);

comment on table public.hackathon_state is
  'Derived from chain events. Droppable: replaying from ledger zero must reproduce it exactly.';

-- Who is allowed inside a closed event (derived) -------------------------------

-- One row per approved participant, rebuilt from the approval events. It exists
-- so that row level security can answer "may this person see this gallery"
-- without calling out to the chain on every request.
create table public.participants (
  contract_id public.contract_address not null,
  address public.stellar_address not null,
  approved_at_ledger bigint not null,

  primary key (contract_id, address)
);

comment on table public.participants is
  'Derived from chain events. The electorate and the guest list, as the chain recorded them.';

-- Teams and what they entered -------------------------------------------------

create table public.teams (
  contract_id public.contract_address not null,
  team_id integer not null,
  name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (contract_id, team_id),
  constraint teams_team_id_positive check (team_id > 0),
  constraint teams_name_length check (char_length(name) between 1 and 80)
);

create trigger teams_touch_updated_at
  before update on public.teams
  for each row execute function public.touch_updated_at();

create table public.projects (
  contract_id public.contract_address not null,
  team_id integer not null,
  title text not null,
  summary text,
  description text,
  logo_url text,
  repository_url text,
  demo_video_url text,
  live_url text,
  screenshot_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (contract_id, team_id),
  foreign key (contract_id, team_id) references public.teams (contract_id, team_id) on delete cascade,
  constraint projects_title_length check (char_length(title) between 1 and 120),
  constraint projects_summary_length check (char_length(summary) <= 300),
  constraint projects_description_length check (char_length(description) <= 20000),
  constraint projects_screenshot_count check (array_length(screenshot_urls, 1) is null
    or array_length(screenshot_urls, 1) <= 10)
);

comment on table public.projects is
  'The write up a team uploaded. Its digest is on chain, so anyone can check this is what was judged.';

create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

-- Who may see what ------------------------------------------------------------

-- Whether the person behind this request holds an address that was approved
-- into this hackathon.
--
-- `security definer` because the check has to read `participants` and
-- `wallet_links` on behalf of somebody who cannot read them both, and because a
-- policy that queried those tables directly would re-enter their own policies.
-- The function takes the hackathon rather than reading it from a row, so it can
-- be used from any table that knows which event it belongs to.
create function public.is_participant(hackathon public.contract_address)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.participants p
    join public.wallet_links w on w.address = p.address
    where p.contract_id = hackathon
      and w.profile_id = (select auth.uid())
  );
$$;

-- Whether this hackathon's gallery is open to the world.
create function public.gallery_is_public(hackathon public.contract_address)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select visibility = 0 from public.hackathon_state where contract_id = hackathon),
    false
  );
$$;

-- A hackathon with no state row yet is treated as closed by both functions
-- above. That is deliberate: the indexer is what publishes an event's
-- visibility, so until it has, nothing is visible. Failing closed is the only
-- safe direction for a default.

alter table public.hackathons enable row level security;
alter table public.hackathon_state enable row level security;
alter table public.participants enable row level security;
alter table public.teams enable row level security;
alter table public.projects enable row level security;

grant select on public.hackathons, public.hackathon_state, public.participants,
  public.teams, public.projects to anon, authenticated;
grant select on public.hackathons, public.hackathon_state, public.participants,
  public.teams, public.projects to service_role;
grant insert, update, delete on public.hackathon_state, public.participants to service_role;

-- The event itself is always public, whatever the gallery setting. A closed
-- hackathon still produces a receipt a stranger can verify; they simply cannot
-- read what the projects were.
create policy "an event is readable by anyone"
  on public.hackathons for select to anon, authenticated using (true);

create policy "the chain's view of an event is readable by anyone"
  on public.hackathon_state for select to anon, authenticated using (true);

create policy "the guest list is readable by anyone"
  on public.participants for select to anon, authenticated using (true);

create policy "a team is readable by anyone"
  on public.teams for select to anon, authenticated using (true);

-- The gallery is the one thing visibility actually closes.
--
-- `Public` shows the projects to everyone. `Participants` shows them to people
-- approved into that event. `Restricted` shows them to nobody through this
-- policy at all; the organizing team and the judges reach them another way,
-- which is not built yet and is deliberately absent rather than approximated.
create policy "a project is readable when the gallery allows it"
  on public.projects for select to anon, authenticated
  using (
    public.gallery_is_public(contract_id)
    or public.is_participant(contract_id)
  );

-- No client write policies anywhere in this file yet.
--
-- Writing an event, a team or a project has to be tied to holding the address
-- the chain recorded as its organizer or its member, and that check needs the
-- indexer to have published who those are. The tables and their read rules land
-- first because the read rules are what the visibility promise rests on; the
-- write paths follow once there is something to check them against.
