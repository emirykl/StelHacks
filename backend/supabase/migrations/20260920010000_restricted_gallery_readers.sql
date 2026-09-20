-- Let the people responsible for an event read its projects without opening
-- the gallery to its participants.
--
-- Visibility is a frozen constitution rule, but the project write-up lives in
-- Postgres. The indexer therefore copies the frozen judge addresses beside the
-- other constitution fields in `hackathon_state`, and RLS joins those addresses
-- to wallet links proven by signature.

alter table public.hackathon_state
  add column if not exists judges public.stellar_address[] not null default '{}';

comment on column public.hackathon_state.judges is
  'Derived from the locked constitution. Wallets allowed to judge this hackathon.';

create or replace function public.is_judge(hackathon public.contract_address)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hackathon_state h
    join public.wallet_links w on w.address = any(h.judges)
    where h.contract_id = hackathon
      and w.profile_id = (select auth.uid())
  );
$$;

comment on function public.is_judge is
  'Whether the reader proved a wallet named as a judge in the locked constitution.';

grant execute on function public.is_judge(public.contract_address) to anon, authenticated;

-- Organizers and judges are event staff: they need to screen or score projects
-- at every visibility. Participants join them only in the middle setting.
create or replace function public.may_see_gallery(hackathon public.contract_address)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case (select visibility from public.hackathon_state where contract_id = hackathon)
    when 0 then true
    when 1 then
      public.is_participant(hackathon)
      or public.is_organizer(hackathon)
      or public.is_judge(hackathon)
    when 2 then
      public.is_organizer(hackathon)
      or public.is_judge(hackathon)
    else false
  end;
$$;

comment on function public.may_see_gallery is
  'Public: anyone. Participants: approved participants plus event staff. Restricted: organizers and judges only.';
