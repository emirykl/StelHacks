-- Where a team's own contract lives, when they deployed one.
--
-- Optional, and it has to be: plenty of good projects at a Stellar hackathon
-- are a wallet, an indexer or a piece of tooling and never deploy anything.
-- Asking for it as a requirement would make those look incomplete.
--
-- This is the team's contract, not ours. It has nothing to do with the
-- hackathon's own core and vault addresses, which the chain already holds and
-- which no client is allowed to write. Nothing here decides an outcome, so it
-- lives beside the description rather than in the constitution.

alter table public.projects
  add column if not exists contract_address text;

comment on column public.projects.contract_address is
  'A Soroban contract id the team deployed, for the explorer link on their page. Theirs, not the hackathon''s.';

-- The shape, checked here rather than only in the form, for the reason every
-- other shape in this schema is: a check in a page is a check one client
-- honours, and the next thing to write a project row will be a script.
alter table public.projects
  drop constraint if exists projects_contract_address_shape;

alter table public.projects
  add constraint projects_contract_address_shape check (
    contract_address is null or contract_address ~ '^C[A-Z2-7]{55}$'
  );

-- No grants. Every grant on this table is table wide rather than per column,
-- so a new column is reachable by whoever could already reach the row. The
-- profile migrations name columns one by one because that table was granted
-- that way; copying it here would add a second, narrower rule about the same
-- privilege and leave the next reader working out which one applies.
