-- Who is allowed to run an event here.
--
-- There was already an `is_organizer(contract)`, and it answers a different
-- question: whether this account holds the address the chain recorded as the
-- organizer of one particular hackathon. That is a fact about an event that
-- already exists. It cannot answer the question asked before one exists, which
-- is whether this person may create an event at all.
--
-- Nothing on chain can answer that either, and it should not try. Anybody may
-- deploy a copy of the core contract; what is being decided here is narrower
-- and honest about itself, which is who gets to appear on this site. The gate
-- is ours, it is off chain, and it is not pretending to be a property of the
-- ledger.
--
-- Three tables, and the split is the point. An application is a request and it
-- stays a request forever, including after it is refused. A grant is the
-- decision, on its own row, so revoking one does not erase the record of the
-- request that earned it. Staff is who may look at either.

-- Staff ----------------------------------------------------------------------

-- Seeded by hand and by nobody else. There is no invite flow and no self
-- service, because the whole value of this table is that it cannot be joined
-- from the product. A row goes in through SQL by somebody who already has the
-- database.
create table public.platform_staff (
  id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

comment on table public.platform_staff is
  'Who reviews organizer applications. Written only through SQL: no client role can reach this table at all.';

alter table public.platform_staff enable row level security;

-- No grant and no policy for any client role, which makes the table invisible
-- rather than merely read only. The function below is the single way its
-- contents affect anything, and it answers one boolean rather than handing back
-- the list.

-- `security definer` so the check runs with the table's own reach. A policy
-- that called this as the reader would get false for everybody, since the
-- reader cannot see the table, and every staff-only rule in this file would
-- silently deny staff too.
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_staff where id = (select auth.uid())
  );
$$;

comment on function public.is_staff is
  'Whether the reader reviews applications. Used by policies, which is why it reads the table with definer rights.';

grant execute on function public.is_staff() to authenticated;

-- Applications ---------------------------------------------------------------

-- What somebody fills in, in their own words, before anybody has decided
-- anything. The estimates are stored as they were typed rather than validated
-- against a later event, because their job is to tell a reviewer what kind of
-- event this is, not to bind the organizer to a number.
create table public.organizer_applications (
  id uuid primary key default gen_random_uuid(),
  applicant uuid not null references auth.users (id) on delete cascade,

  organization text not null,
  contact_email text not null,
  -- One field for whichever link they have. Asking for a website and an X
  -- handle separately gets two empty boxes from anybody who has only one.
  link text,

  event_name text not null,
  -- Free text on purpose. "March" and "Q2 sometime" are both real answers at
  -- the point somebody is asking permission, and a date picker would force a
  -- day that is not decided yet and then look like a commitment.
  event_window text not null,
  -- In US dollars, whatever the prize is eventually denominated in. This is the
  -- number the tier is chosen from, so it has to be comparable across
  -- applications rather than faithful to the asset.
  prize_estimate numeric(14, 2) not null,
  participants_estimate integer not null,

  submitted_at timestamptz not null default now(),

  status text not null default 'pending',
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  -- Written on a refusal and shown back to the applicant. A refusal with no
  -- words is the thing this product spends the rest of its surface refusing to
  -- do, and it would be strange to do it at the front door.
  decision_note text,

  constraint organizer_applications_status check (
    status in ('pending', 'approved', 'rejected')
  ),
  constraint organizer_applications_decided_together check (
    (status = 'pending') = (decided_at is null)
  ),
  constraint organizer_applications_organization_length check (
    char_length(organization) between 1 and 120
  ),
  constraint organizer_applications_email_shape check (
    contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint organizer_applications_link_shape check (
    link is null or link ~ '^https?://.{3,200}$'
  ),
  constraint organizer_applications_event_name_length check (
    char_length(event_name) between 1 and 120
  ),
  constraint organizer_applications_event_window_length check (
    char_length(event_window) between 1 and 80
  ),
  constraint organizer_applications_prize_range check (
    prize_estimate >= 0 and prize_estimate <= 100000000
  ),
  constraint organizer_applications_participants_range check (
    participants_estimate > 0 and participants_estimate <= 1000000
  ),
  constraint organizer_applications_note_length check (
    char_length(decision_note) <= 500
  )
);

comment on table public.organizer_applications is
  'A request to run events here, kept whatever the answer was. Readable by the applicant and by staff, nobody else.';

-- One open request per person. Without this a form somebody double clicks puts
-- two identical rows in the queue and a reviewer answers the same question
-- twice. A refused applicant may apply again, which is why the index is partial
-- rather than a unique column.
create unique index organizer_applications_one_pending
  on public.organizer_applications (applicant)
  where status = 'pending';

create index organizer_applications_queue
  on public.organizer_applications (submitted_at desc)
  where status = 'pending';

alter table public.organizer_applications enable row level security;

grant select on public.organizer_applications to authenticated;
grant insert (
  applicant, organization, contact_email, link,
  event_name, event_window, prize_estimate, participants_estimate
) on public.organizer_applications to authenticated;
-- Only the decision columns, so a reviewer cannot quietly edit what the
-- applicant wrote before answering it.
grant update (status, decided_at, decided_by, decision_note)
  on public.organizer_applications to authenticated;

grant select, insert, update on public.organizer_applications to service_role;

create policy "an application is readable by the person who sent it"
  on public.organizer_applications for select
  to authenticated
  using ((select auth.uid()) = applicant);

create policy "an application is readable by staff"
  on public.organizer_applications for select
  to authenticated
  using (public.is_staff());

-- `applicant` is checked rather than trusted. The column is in the insert grant
-- because the row needs it, and this is what stops somebody putting a stranger
-- there and applying on their behalf.
create policy "an application is written by the person applying"
  on public.organizer_applications for insert
  to authenticated
  with check ((select auth.uid()) = applicant and status = 'pending');

create policy "an application is answered only by staff"
  on public.organizer_applications for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Grants ---------------------------------------------------------------------

-- The decision, and the thing every gate in the product reads.
--
-- The tier is chosen by a reviewer rather than computed from the prize
-- estimate. Computing it would mean holding an exchange rate for whatever asset
-- the prize is in and would turn a rough number typed into a form into a
-- pricing rule somebody can aim at. What the estimate is for is telling a human
-- which tier to pick.
create table public.organizer_grants (
  account uuid primary key references auth.users (id) on delete cascade,
  tier text not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  -- Which request earned it, so a grant is never a fact with no story behind
  -- it. Null is allowed for the ones seeded by hand before this existed.
  application uuid references public.organizer_applications (id) on delete set null,

  constraint organizer_grants_tier check (tier in ('community', 'standard', 'annual'))
);

comment on table public.organizer_grants is
  'Who may create a hackathon on this site. Public, because who runs an event is not a secret.';

alter table public.organizer_grants enable row level security;

grant select on public.organizer_grants to anon, authenticated;
grant insert, update, delete on public.organizer_grants to authenticated;
grant select, insert, update, delete on public.organizer_grants to service_role;

-- Readable by everyone. A grant says somebody may run events, which is exactly
-- what their profile page and every event they run announce anyway, and a badge
-- that needs a session to render is a badge signed out visitors never see.
create policy "a grant is readable by anyone"
  on public.organizer_grants for select
  to anon, authenticated
  using (true);

create policy "a grant is given only by staff"
  on public.organizer_grants for insert
  to authenticated
  with check (public.is_staff());

create policy "a grant is changed only by staff"
  on public.organizer_grants for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "a grant is taken back only by staff"
  on public.organizer_grants for delete
  to authenticated
  using (public.is_staff());

-- The question every gate asks, as one function so the answer cannot drift
-- between the page that hides a button and the page that would have handled the
-- press.
create function public.may_organize()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.organizer_grants where account = (select auth.uid())
  );
$$;

comment on function public.may_organize is
  'Whether the reader may create a hackathon. Not `security definer`: grants are public, so the reader can see this themselves.';

grant execute on function public.may_organize() to authenticated;

-- Answering one ----------------------------------------------------------------

-- Approving is two writes: the application stops being pending and a grant
-- appears. Done from the application as two statements they can half happen, and
-- the half that happens is the visible one: an application marked approved with
-- nobody holding a grant, which reads to the applicant as a yes and behaves as a
-- no. One function is one transaction.
--
-- Deliberately not `security definer`. The policies above already say only staff
-- may write either table, so running as the caller means the rule is enforced in
-- one place rather than restated here and enforced in two. The check at the top
-- exists to name the refusal, not to be the refusal.
create function public.answer_application(
  target uuid,
  verdict text,
  at_tier text default null,
  note text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  who uuid;
begin
  if not public.is_staff() then
    raise exception 'Only staff answer applications';
  end if;

  if verdict not in ('approved', 'rejected') then
    raise exception 'An application is answered approved or rejected';
  end if;

  if verdict = 'approved' and at_tier is null then
    raise exception 'An approval names the tier it was granted on';
  end if;

  -- Pending only, so pressing approve twice on a stale page does not overwrite
  -- a decision somebody else made in between.
  update public.organizer_applications
     set status = verdict,
         decided_at = now(),
         decided_by = (select auth.uid()),
         decision_note = note
   where id = target and status = 'pending'
  returning applicant into who;

  if who is null then
    raise exception 'That application has already been answered';
  end if;

  if verdict = 'approved' then
    -- Upsert rather than insert. Somebody refused once and approved later
    -- already has no grant, but somebody approved on one tier and later
    -- approved on another does, and the second answer is the current one.
    insert into public.organizer_grants (account, tier, granted_by, application)
    values (who, at_tier, (select auth.uid()), target)
    on conflict (account) do update
      set tier = excluded.tier,
          granted_at = now(),
          granted_by = excluded.granted_by,
          application = excluded.application;
  end if;
end;
$$;

comment on function public.answer_application is
  'Approve or refuse in one transaction, so an approved application never exists without the grant it promises.';

grant execute on function public.answer_application(uuid, text, text, text) to authenticated;
