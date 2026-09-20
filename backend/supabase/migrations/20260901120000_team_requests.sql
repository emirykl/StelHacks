-- Asking to join somebody's team.
--
-- The contract is the reason this table exists in the shape it does. `add_member`
-- calls `require_auth` on the captain and on the joiner, so putting somebody on
-- a team is one transaction that two people have to have signed. They are never
-- at the same keyboard, so one of them has to sign early and leave it somewhere.
--
-- This is that somewhere. A request carries the joiner's half of the
-- authorization, already signed, and the captain's accept is the moment the
-- other half is added and the whole thing is submitted. Nothing here can put
-- anybody on a team: the chain does that, and it will refuse a request whose
-- signature does not check out however this row is written.
--
-- Which is why the security story is short. The worst a forged row can do is
-- appear in somebody's list and fail when they press it.

create table public.team_requests (
  id uuid primary key default gen_random_uuid(),
  contract_id public.contract_address not null,
  team_id integer not null,
  -- The address that wants in, and the one that signed the entry below.
  applicant public.stellar_address not null,

  -- The joiner's half of `add_member`, base64 XDR, signed when they asked.
  --
  -- Stored rather than rebuilt because it cannot be rebuilt: it carries a
  -- signature over a specific invocation, and only the wallet that made it can
  -- make it again.
  auth_entry text not null,

  -- The ledger the signature above stops being valid at.
  --
  -- Kept as a column rather than parsed out of the entry when needed, because
  -- the list of requests has to be able to say "this one has gone stale"
  -- without decoding XDR in the database.
  expires_at_ledger bigint not null,

  -- What they want to say for themselves. Optional, and short on purpose: a
  -- captain deciding between six requests is not reading six paragraphs.
  note text,

  status text not null default 'pending',
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  -- One live request per person per team. Asking twice is not more asking, and
  -- a captain with the same name three times cannot tell which entry is current.
  unique (contract_id, team_id, applicant),

  constraint team_requests_team_id_positive check (team_id > 0),
  constraint team_requests_note_length check (char_length(note) <= 280),
  constraint team_requests_status check (status in ('pending', 'accepted', 'withdrawn'))
);

comment on table public.team_requests is
  'A signed offer to join a team, waiting for its captain. The chain, not this table, decides membership.';

create index team_requests_by_team on public.team_requests (contract_id, team_id)
  where status = 'pending';

create index team_requests_by_applicant on public.team_requests (applicant);

alter table public.team_requests enable row level security;

-- Read: the person who asked, and anybody already on the team.
--
-- The team rather than the captain alone, and that is deliberate. Supabase has
-- no record of which member is captain — `team_members` is derived from chain
-- events and records membership, not rank — and inventing a captain column
-- somebody could write would be a worse answer than showing a request to four
-- teammates who cannot act on it anyway. Only the captain's signature is
-- accepted by the contract.
create policy "a request is readable by the person who sent it"
  on public.team_requests
  for select
  to authenticated
  using (public.holds_address(applicant));

create policy "a request is readable by the team it was sent to"
  on public.team_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.team_members as member
      where member.contract_id = team_requests.contract_id
        and member.team_id = team_requests.team_id
        and public.holds_address(member.address)
    )
  );

-- Write: only for an address you have proved you hold.
--
-- Without this somebody could file a request in another person's name, and
-- because the request carries a signature the captain is invited to submit,
-- that is the one forgery worth closing here rather than leaving to the chain.
create policy "a request is sent by the person joining"
  on public.team_requests
  for insert
  to authenticated
  with check (public.holds_address(applicant));

create policy "a request is withdrawn by the person who sent it"
  on public.team_requests
  for update
  to authenticated
  using (public.holds_address(applicant))
  with check (public.holds_address(applicant));

-- Marking one accepted is a note that the chain already agreed, written after
-- the transaction went through. It changes nothing about who is on the team.
create policy "a request is answered by the team"
  on public.team_requests
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.team_members as member
      where member.contract_id = team_requests.contract_id
        and member.team_id = team_requests.team_id
        and public.holds_address(member.address)
    )
  )
  with check (
    exists (
      select 1
      from public.team_members as member
      where member.contract_id = team_requests.contract_id
        and member.team_id = team_requests.team_id
        and public.holds_address(member.address)
    )
  );

grant select, insert, update on public.team_requests to authenticated;
