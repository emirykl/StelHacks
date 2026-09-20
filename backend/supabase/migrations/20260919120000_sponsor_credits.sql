-- Putting a name on money the chain only knows an address for.
--
-- A contribution is already public and already complete: the contract records
-- who paid, which position they aimed at, and how much, and the wall on the
-- hackathon page reads it from there rather than from here. None of that waits
-- on this table and none of it can be changed by it.
--
-- What is missing is the part the chain cannot hold. Fifty six characters name
-- a key, not a person, and a sponsor who wants to be seen backing an event
-- wants their name seen. The name already exists on our side, behind
-- `wallet_links`, so this table is not where a name is stored — it is where an
-- organizer's permission to show it is.
--
-- Why the permission exists at all. A credit is a line on somebody else's
-- event page, and whoever runs that event answers for what is on it. Anybody
-- can send money to a public vault, which means anybody can put a display name
-- beside an event they have nothing to do with; the organizer deciding is the
-- difference between a sponsor wall and an open comment box. Until they
-- decide, the wall shows what the chain shows, which is the address.
--
-- What it deliberately is not. It does not gate the contribution, the total, or
-- the prize: refusing a credit hides a name and nothing else, and there is no
-- status here that could make money disappear from a page that reads it off the
-- contract.

create table public.sponsor_credits (
  contract_id public.contract_address not null,
  address public.stellar_address not null,
  -- Who the address belongs to, kept rather than looked up through
  -- `wallet_links` at read time. A link can be rewritten later, and a credit an
  -- organizer approved should stay the credit they approved rather than follow
  -- whoever holds the key next.
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'waiting',
  claimed_at timestamptz not null default now(),
  decided_at timestamptz,

  -- One per address per event. A sponsor who gives three times is one name on
  -- the wall, asked about once; the three amounts are the contract's to list.
  primary key (contract_id, address),
  constraint sponsor_credits_status check (status in ('waiting', 'shown', 'hidden'))
);

comment on table public.sponsor_credits is
  'Whether an organizer has agreed to show a backer''s name. The money itself is on chain and is not gated by this.';

-- Readable by everyone, including the ones nobody has decided yet.
--
-- A waiting credit is not a secret: it says an address that paid into a public
-- vault belongs to an account whose profile is public, and `wallet_links` is
-- already readable by anyone for exactly that reason. Hiding it would buy no
-- privacy and would cost the organizer's queue a handler of its own.
alter table public.sponsor_credits enable row level security;

grant select on public.sponsor_credits to anon, authenticated;
grant select, insert, update, delete on public.sponsor_credits to service_role;

create policy "a sponsor credit is readable by anyone"
  on public.sponsor_credits for select to anon, authenticated using (true);

-- No client write policy, the same as every other table whose writes have to be
-- checked against the chain. Claiming one takes a session and a proved wallet;
-- deciding one takes the organizer's own key, and the contract is the authority
-- on whose that is. Neither question can be asked in SQL, so both are asked in
-- the handler that holds the service role.
