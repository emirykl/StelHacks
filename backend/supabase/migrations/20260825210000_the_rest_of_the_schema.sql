-- Everything the data layer still needed: the sealed tables, the tables the
-- indexer rebuilds from chain events, the write paths for the text people type,
-- and one correction to the gallery rule.
--
-- Three kinds of table live here and they are kept apart on purpose, because
-- the rules that apply to them are different and mixing them would blur both.
--
--   Sealed      Scorecards and ballots, held before their Merkle root is
--               published. No client role can read them at all, including the
--               organizer's. This is the one place the product asks anybody to
--               trust a server, and the smaller that place is the better.
--
--   Derived     Rebuilt by replaying events from ledger zero. No client can
--               write them, because a row somebody typed in could not be
--               regenerated and would quietly outrank the chain it mirrors.
--
--   Written     Names, descriptions, screenshots. A person types these, so a
--               person can change them, and the policy has to work out which
--               person by way of an address the chain already recorded.

-- The correction ---------------------------------------------------------------

-- The gallery rule read like this:
--
--     using (gallery_is_public(contract_id) or is_participant(contract_id))
--
-- and being a participant let somebody through whatever the setting said. A
-- `Restricted` event is meant to be closed to everybody who arrives through
-- this API, its own participants included; an event the indexer has not
-- published yet is meant to be closed to everybody at all. Under that rule a
-- participant read both.
--
-- The mistake was structural rather than a typo. Two predicates joined by `or`
-- cannot express a rule where one level grants less than another, because each
-- one can only ever add. Reading the setting once and branching on it can, so
-- `Restricted` is now a case that returns false rather than a case nothing
-- happens to mention, and a missing row falls to the same place.

create or replace function public.may_see_gallery(hackathon public.contract_address)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case (select visibility from public.hackathon_state where contract_id = hackathon)
    when 0 then true                                  -- Public
    when 1 then public.is_participant(hackathon)      -- Participants
    else false                                        -- Restricted, or not published yet
  end;
$$;

drop policy "a project is readable when the gallery allows it" on public.projects;

create policy "a project is readable when the gallery allows it"
  on public.projects for select to anon, authenticated
  using (public.may_see_gallery(contract_id));

drop function public.gallery_is_public(public.contract_address);

-- Who somebody is, in terms the policies can use --------------------------------

-- Whether the person behind this request holds an address they proved.
--
-- Every write rule below reduces to this. A session says who somebody signed in
-- as; an address says what the chain recorded them doing. `wallet_links` is the
-- one join between the two, and no client can write it, which is what makes the
-- whole chain of reasoning hold.
create function public.holds_address(addr public.stellar_address)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.wallet_links
    where address = addr
      and profile_id = (select auth.uid())
  );
$$;

-- An event has exactly one organizer address, so this is `holds_address` asked
-- about that one. An event the indexer has not published has no organizer to
-- hold, and the comparison against nothing answers false, which closes the
-- write path for the same reason and in the same direction as the read one.
create function public.is_organizer(hackathon public.contract_address)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.holds_address(
    (select organizer from public.hackathon_state where contract_id = hackathon)
  );
$$;

-- Team membership, as the chain recorded it (derived) ---------------------------

create table public.team_members (
  contract_id public.contract_address not null,
  team_id integer not null,
  address public.stellar_address not null,
  joined_at_ledger bigint not null,

  primary key (contract_id, team_id, address),
  constraint team_members_team_id_positive check (team_id > 0)
);

comment on table public.team_members is
  'Derived from chain events. Who may edit a team page, and who a prize was split between.';

create index team_members_by_address on public.team_members (address);

create function public.is_team_member(hackathon public.contract_address, team integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members m
    join public.wallet_links w on w.address = m.address
    where m.contract_id = hackathon
      and m.team_id = team
      and w.profile_id = (select auth.uid())
  );
$$;

-- Sealed ------------------------------------------------------------------------

-- A judge's scorecard, before the root that commits to it is published.
--
-- This is the trust the product does not remove, so it is worth being exact
-- about its shape. Between a judge submitting and the root going on chain, the
-- collection service could in principle leave a scorecard out. It cannot change
-- one, because the judge signed the same leaf the tree commits to, and it
-- cannot deny receiving one, because it returned a signed receipt. What is left
-- is omission, and omission is detectable by the judge holding that receipt the
-- moment the root is published.
--
-- The written feedback sits here rather than on chain because it decides
-- nothing and would cost real money to store. The scores that do decide
-- something are on chain in `scores` once revealed.
create table public.scorecards (
  contract_id public.contract_address not null,
  team_id integer not null,
  judge public.stellar_address not null,
  scores jsonb not null,
  feedback text,
  leaf bytea not null,
  signature bytea not null,
  received_at timestamptz not null default now(),

  primary key (contract_id, team_id, judge),
  constraint scorecards_feedback_length check (char_length(feedback) <= 5000)
);

comment on table public.scorecards is
  'Sealed. Unreadable by every client role; the collection service is the only reader until the reveal.';

create table public.ballots (
  contract_id public.contract_address not null,
  voter public.stellar_address not null,
  team_id integer not null,
  leaf bytea not null,
  signature bytea not null,
  received_at timestamptz not null default now(),

  primary key (contract_id, voter),
  constraint ballots_team_id_positive check (team_id > 0)
);

comment on table public.ballots is
  'Sealed. One ballot per wallet per event, unreadable by every client role until the reveal.';

-- Derived -----------------------------------------------------------------------

-- The raw stream, which is what every other derived table is rebuilt from.
--
-- The key is what makes a replay safe. Writing the same ledger range twice has
-- to change nothing, so the position of an event in the chain is its identity
-- rather than anything the indexer decides.
create table public.chain_events (
  contract_id public.contract_address not null,
  ledger bigint not null,
  event_index integer not null,
  name text not null,
  payload jsonb not null,
  occurred_at timestamptz not null,

  primary key (contract_id, ledger, event_index)
);

comment on table public.chain_events is
  'Derived. Every event the contracts published, in the order the chain published them.';

create index chain_events_by_name on public.chain_events (contract_id, name);

create table public.submissions (
  contract_id public.contract_address not null,
  team_id integer not null,
  track text not null,
  metadata_hash bytea not null,
  uri text not null,
  submitted_at timestamptz not null,
  updated_at timestamptz not null,
  status smallint not null,
  reason_hash bytea,

  primary key (contract_id, team_id),
  constraint submissions_status_range check (status between 0 and 2)
);

comment on table public.submissions is
  'Derived. The digest, the deadline and the track, which stay public in every visibility setting.';

create table public.scores (
  contract_id public.contract_address not null,
  team_id integer not null,
  judge public.stellar_address not null,
  weighted integer not null,
  revealed_at_ledger bigint not null,

  primary key (contract_id, team_id, judge),
  constraint scores_weighted_range check (weighted between 0 and 1000000)
);

comment on table public.scores is
  'Derived. Revealed scorecards, at the full precision the contract keeps them.';

create table public.results (
  contract_id public.contract_address not null,
  track text not null,
  rank integer not null,
  team_id integer not null,
  final_score integer not null,
  judge_average integer not null,
  community integer not null,
  decided_by smallint not null,

  primary key (contract_id, track, rank),
  constraint results_rank_positive check (rank > 0),
  constraint results_decided_by_range check (decided_by between 0 and 4)
);

comment on table public.results is
  'Derived. The ranking and the tie break step that produced each placing.';

create table public.payments (
  contract_id public.contract_address not null,
  track text not null,
  rank integer not null,
  recipient public.stellar_address not null,
  amount numeric(39, 0) not null,
  kind smallint not null,
  ledger bigint not null,
  tx_hash bytea not null,

  primary key (contract_id, track, rank, recipient),
  constraint payments_amount_positive check (amount >= 0),
  -- 0 paid to a winner, 1 swept back after a claim period, 2 returned by a no
  -- award. Three different endings that must never be shown as one.
  constraint payments_kind_range check (kind between 0 and 2)
);

comment on table public.payments is
  'Derived. Every unit that left a vault, and which of the three endings sent it.';

create index payments_by_recipient on public.payments (recipient);

-- Reachability -------------------------------------------------------------------

alter table public.team_members enable row level security;
alter table public.scorecards enable row level security;
alter table public.ballots enable row level security;
alter table public.chain_events enable row level security;
alter table public.submissions enable row level security;
alter table public.scores enable row level security;
alter table public.results enable row level security;
alter table public.payments enable row level security;

-- The sealed tables get no grant to any client role and no policy. Both are
-- deliberate and they are belt and braces for each other: the missing grant
-- refuses the request outright, and the missing policy would refuse every row
-- even if a grant were added by mistake later.
grant select, insert, update, delete on public.scorecards to service_role;
grant select, insert, update, delete on public.ballots to service_role;

-- Everything derived is public to read and writable only by the indexer.
grant select on public.team_members, public.chain_events, public.submissions,
  public.scores, public.results, public.payments to anon, authenticated;
grant select, insert, update, delete on public.team_members, public.chain_events,
  public.submissions, public.scores, public.results, public.payments to service_role;

create policy "team membership is readable by anyone"
  on public.team_members for select to anon, authenticated using (true);

create policy "the event stream is readable by anyone"
  on public.chain_events for select to anon, authenticated using (true);

-- A submission stays readable whatever the gallery setting says. The digest,
-- the timestamp and the track are what make a receipt checkable by a stranger,
-- and a private hackathon is still supposed to produce one; what it holds back
-- is the write up, which lives in `projects`.
create policy "a submission record is readable by anyone"
  on public.submissions for select to anon, authenticated using (true);

create policy "a revealed score is readable by anyone"
  on public.scores for select to anon, authenticated using (true);

create policy "a result is readable by anyone"
  on public.results for select to anon, authenticated using (true);

create policy "a payment is readable by anyone"
  on public.payments for select to anon, authenticated using (true);

-- Written -------------------------------------------------------------------------

-- The organizer writes the event page, and the organizer is whoever holds the
-- address the chain recorded. Until the indexer has published that address
-- nobody can write it, which is the right order: the hackathon exists on chain
-- first and acquires a description second.
grant insert, update on public.hackathons to authenticated;
grant insert, update on public.teams to authenticated;
grant insert, update on public.projects to authenticated;

create policy "an organizer writes their own event page"
  on public.hackathons for insert to authenticated
  with check (public.is_organizer(contract_id));

create policy "an organizer edits their own event page"
  on public.hackathons for update to authenticated
  using (public.is_organizer(contract_id))
  with check (public.is_organizer(contract_id));

create policy "a team writes its own page"
  on public.teams for insert to authenticated
  with check (public.is_team_member(contract_id, team_id));

create policy "a team edits its own page"
  on public.teams for update to authenticated
  using (public.is_team_member(contract_id, team_id))
  with check (public.is_team_member(contract_id, team_id));

create policy "a team writes its own project"
  on public.projects for insert to authenticated
  with check (public.is_team_member(contract_id, team_id));

create policy "a team edits its own project"
  on public.projects for update to authenticated
  using (public.is_team_member(contract_id, team_id))
  with check (public.is_team_member(contract_id, team_id));

-- No delete policy anywhere. A hackathon, a team page or a project that took
-- part in a finished event is part of a record the proof page still points at,
-- and a link that goes nowhere is a worse answer than a page saying what
-- happened.
