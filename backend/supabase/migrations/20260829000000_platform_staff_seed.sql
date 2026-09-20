-- Who runs this deployment.
--
-- A seed rather than a schema change, and it is here rather than in a script
-- because it has to be run exactly once against the same database as the file
-- beside it and there is nowhere else that guarantees that.
--
-- Idempotent throughout. Every insert either matches an account and lands or
-- matches nothing and does nothing, so running it twice, or on a database where
-- these accounts do not exist yet, is safe and silent.
--
-- Both addresses are named because the operator signs in with one and reads
-- notifications at the other, and which is which has changed once already.
-- Whichever exists gets the row.
--
-- The CLI's own bookkeeping is deliberately not written here. An earlier
-- version of this file inserted into `supabase_migrations.schema_migrations`,
-- which does not exist until the CLI has been used against a project, so the
-- statement failed and took the two inserts above it down with it: the editor
-- runs the file as one transaction, and a rolled back seed looks exactly like a
-- seed that matched nothing. Recording a hand applied migration is what
-- `supabase migration repair --status applied <version>` is for, and guessing
-- at the shape of the CLI's table is how a later `db push` gets confused.

insert into public.platform_staff (id)
select id from auth.users
where email in ('emirhasankoca@gmail.com', 'emiryenikale@gmail.com')
on conflict do nothing;

-- Annual, so the operator's own events carry no cut. There is nobody to charge
-- and a rate above zero would only mean depositing money to pay ourselves.
insert into public.organizer_grants (account, tier)
select id, 'annual' from auth.users
where email in ('emirhasankoca@gmail.com', 'emiryenikale@gmail.com')
on conflict do nothing;

-- Last, so the editor shows this rather than a row count. Both columns filled
-- is the result worth seeing; an empty table means neither address has an
-- account yet.
select u.email,
       (s.id is not null) as is_staff,
       g.tier
from auth.users u
left join public.platform_staff s on s.id = u.id
left join public.organizer_grants g on g.account = u.id
order by u.created_at;
