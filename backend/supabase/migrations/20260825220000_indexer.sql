-- What the indexer needs to do its job twice and get the same answer.
--
-- Two tables, and the reason for the second one is the interesting part.
--
-- The rule the data layer is built on says every derived table must be
-- droppable and rebuildable by replaying from ledger zero. Reading the events
-- back showed that the event stream alone cannot do it. Three things a page
-- needs are not in any event:
--
--   * `visibility` and `prize_asset` live in the constitution. `RulesLocked`
--     carries only its digest.
--   * A submission's `uri` is not in `ProjectSubmitted`, which carries the
--     digest and the track.
--   * The ranking is not in `TrackRanked`, which carries how many projects were
--     placed and not which.
--
-- All three are readable from contract state, so nothing here asks anybody to
-- trust this database over the chain. What they are not is permanent. Soroban
-- entries carry a time to live and a hackathon nobody writes to stops being
-- written to the moment it ends, so a year later `ranking(track)` answers
-- nothing at all. A rebuild that depended on that call would work today and
-- quietly stop working exactly when the record mattered most.
--
-- So the read happens once, at ingest, while the state is still there, and what
-- the contract said is recorded beside the event that prompted the read. After
-- that the rebuild runs from Postgres alone: `chain_events` and `chain_reads`
-- are the durable log, and every other derived table is a projection of them
-- that can be thrown away and rebuilt at any time.

-- Where the indexer got to --------------------------------------------------

create table public.indexer_cursor (
  contract_id public.contract_address primary key,
  last_ledger bigint not null,
  updated_at timestamptz not null default now(),

  constraint indexer_cursor_ledger_positive check (last_ledger >= 0)
);

comment on table public.indexer_cursor is
  'Operational, not derived. Resetting it to zero and truncating the projections is what a rebuild is.';

-- What the contract said, at the ledger it was asked ------------------------

create table public.chain_reads (
  contract_id public.contract_address not null,
  ledger bigint not null,
  kind text not null,
  key text not null default '',
  data jsonb not null,

  primary key (contract_id, ledger, kind, key)
);

comment on table public.chain_reads is
  'Answers read from contract state while it was still live, kept because Soroban entries expire and this record does not.';

create index chain_reads_by_kind on public.chain_reads (contract_id, kind);

alter table public.indexer_cursor enable row level security;
alter table public.chain_reads enable row level security;

-- The cursor is nobody's business but the indexer's. It says nothing about the
-- hackathon, only about how far a background job has got, and a client reading
-- it would learn only that.
grant select, insert, update, delete on public.indexer_cursor to service_role;

-- What the contract said is as public as the contract. Anyone rebuilding a
-- result for themselves needs exactly this.
grant select on public.chain_reads to anon, authenticated;
grant select, insert, update, delete on public.chain_reads to service_role;

create policy "what the chain said is readable by anyone"
  on public.chain_reads for select to anon, authenticated using (true);
