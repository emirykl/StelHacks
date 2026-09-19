-- The gallery rule reads the visibility setting instead of ignoring it.
--
-- The policy it replaces was wrong, and wrong in the direction that matters:
--
--     using (gallery_is_public(contract_id) or is_participant(contract_id))
--
-- Being a participant let somebody through whatever the setting said. A
-- `Restricted` event is meant to be closed to everybody who comes through this
-- API, including its own participants, because the people who should see it are
-- the organizing team and the judges and they reach it another way. And an
-- event the indexer has not published yet is meant to be closed to everybody
-- full stop. Under that policy a participant read both.
--
-- The mistake was structural rather than a typo. Two independent predicates
-- joined by `or` cannot express a rule where one level grants less access than
-- another; each one could only ever add. Reading the setting once and branching
-- on it can, so that is what this does, and `Restricted` is now a case that
-- returns false rather than a case nothing happens to mention.
--
-- A missing row falls to `else` and closes the gallery. That is the only safe
-- direction for a default: a gallery that stayed open until the indexer got
-- round to it would leak exactly the events configured to be private, in the
-- window nobody is watching.

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
