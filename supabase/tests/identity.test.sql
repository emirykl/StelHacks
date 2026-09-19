-- What each role can actually reach, checked rather than read.
--
-- Row level security is the kind of thing that looks right in a policy and is
-- wrong in practice, because the interesting cases are the ones nobody thought
-- to write a policy for. So these tests take each role in turn and try what it
-- must not be able to do, and the passing condition is a refusal.
--
-- Two shapes of refusal appear below and they mean different things. `42501` is
-- the grant refusing: the role cannot touch that table or column at all.
-- Silence with nothing changed is the policy refusing: the role may touch the
-- table, and no row was visible to it. Both are correct, and which one applies
-- says which of the two layers is doing the work.

begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

-- Two people, created the way a signup creates them, so the trigger runs.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ada@example.com', '', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'grace@example.com', '', now(), now());

-- Signup ---------------------------------------------------------------------

select is(
  (select count(*)::int from public.profiles),
  2,
  'signing up leaves a profile behind, so no page has to handle a session without one'
);

select isnt(
  (select username::text from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  (select username::text from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'two signups in the same moment do not collide on a username'
);

-- `citext` makes every operator case insensitive, including the regular
-- expression in the constraint, so this passing is what proves the cast to text
-- in the check is doing its job.
select throws_ok(
  $$ update public.profiles set username = 'Ada' where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'a username outside the published shape is refused'
);

update public.profiles set username = 'ada' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set username = 'grace' where id = '22222222-2222-2222-2222-222222222222';

select is(
  (select count(*)::int from public.profiles where username = 'ADA'),
  1,
  'a username lookup ignores case, so a link typed with capitals still finds the person'
);

-- A signed out visitor -------------------------------------------------------

set local role anon;

select is(
  (select count(*)::int from public.profiles),
  2,
  'a signed out visitor reads every profile, because a builder page is public'
);

select is(
  (select count(*)::int from public.wallet_links),
  0,
  'a signed out visitor reads the wallet links table'
);

select throws_ok(
  $$ select * from public.wallet_challenges $$,
  '42501',
  null,
  'a signed out visitor cannot read a challenge, which is the whole point of issuing one'
);

select throws_ok(
  $$ update public.profiles set bio = 'not mine' where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'a signed out visitor cannot write a profile at all'
);

select throws_ok(
  $$ insert into public.wallet_links (address, profile_id)
     values ('GAF6IFHHU3QF3LFFDYCJ3WDB3JFLUWF73LBLWF3UK3GK5GXHH7PHWQWY',
             '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'a signed out visitor cannot claim an address'
);

-- Ada, signed in -------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ update public.profiles set bio = 'builds payment rails' where id = '11111111-1111-1111-1111-111111111111' $$,
  'somebody signed in edits their own profile'
);

reset role;
select is(
  (select bio from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'builds payment rails',
  'and the edit landed'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Here the grant lets the statement through and the policy finds no row, which
-- is why this is silence rather than an error.
select lives_ok(
  $$ update public.profiles set bio = 'hijacked' where id = '22222222-2222-2222-2222-222222222222' $$,
  'editing somebody else is refused by finding nothing rather than by erroring'
);

reset role;
select is(
  (select bio from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  null,
  'and it changed nothing'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ update public.profiles set id = '22222222-2222-2222-2222-222222222222'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'a column nobody was granted stays out of reach whatever the policy says'
);

-- The claim that matters. A client able to write here could say it holds any
-- address, and every earnings total in the product reads this table.
select throws_ok(
  $$ insert into public.wallet_links (address, profile_id)
     values ('GAF6IFHHU3QF3LFFDYCJ3WDB3JFLUWF73LBLWF3UK3GK5GXHH7PHWQWY',
             '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'somebody signed in cannot claim an address without proving they hold it'
);

select throws_ok(
  $$ select * from public.wallet_challenges $$,
  '42501',
  null,
  'somebody signed in cannot read their own challenge either'
);

select throws_ok(
  $$ insert into public.wallet_challenges (profile_id, address, nonce, expires_at)
     values ('11111111-1111-1111-1111-111111111111',
             'GAF6IFHHU3QF3LFFDYCJ3WDB3JFLUWF73LBLWF3UK3GK5GXHH7PHWQWY',
             'mine', now() + interval '5 minutes') $$,
  '42501',
  null,
  'and cannot issue one to themselves'
);

select throws_ok(
  $$ insert into public.profiles (id, username) values ('44444444-4444-4444-4444-444444444444', 'ghost') $$,
  '42501',
  null,
  'a profile cannot exist without a user behind it'
);

select throws_ok(
  $$ delete from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'a profile referenced by a past hackathon cannot be removed on a whim'
);

reset role;
select is(
  (select count(*)::int from public.profiles),
  2,
  'and both profiles are still there'
);

-- The verifier ---------------------------------------------------------------

-- The edge function reaches the database as the service role, which is the one
-- role that may write a link, and only after it has watched a signature.
set local role service_role;

select lives_ok(
  $$ insert into public.wallet_links (address, profile_id)
     values ('GAF6IFHHU3QF3LFFDYCJ3WDB3JFLUWF73LBLWF3UK3GK5GXHH7PHWQWY',
             '11111111-1111-1111-1111-111111111111') $$,
  'the verifier writes the link once the signature checks out'
);

select throws_ok(
  $$ insert into public.wallet_links (address, profile_id)
     values ('not-a-stellar-address', '11111111-1111-1111-1111-111111111111') $$,
  '23514',
  null,
  'even the verifier cannot write something that is not an address'
);

reset role;
select is(
  (select count(*)::int from public.wallet_links),
  1,
  'one address, claimed once, by the only writer allowed to claim it'
);

select * from finish();
rollback;
