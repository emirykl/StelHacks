# Backend

Everything that remembers, and nothing that decides.

The chain is the authority: it holds the locked rules, computes the ranking and
moves the money. What lives here reads that stream and keeps a copy shaped for
pages to query, plus the written text and images the chain has no business
storing. If a row here disagrees with the chain, the row is wrong.

Two rules follow from that, and both have tests rather than promises behind
them:

1. **Every table mirroring chain state must be droppable and rebuildable** by
   replaying events from ledger zero. A row that cannot be regenerated was never
   derived data and does not belong here.
2. **No key here can move money or change a result.** The service role key
   reaches the indexer and the challenge verifier, and neither holds a Stellar
   signing key with any authority in the contracts.

## Layout

| Path | Contents |
|---|---|
| `supabase/migrations/` | The schema, as ordered migrations |
| `supabase/tests/` | What each role can actually reach, checked over HTTP |
| `supabase/config.toml` | Local and project configuration, secrets by reference only |
| `indexer/` | Soroban events into Postgres. Not built yet |

## Working here

Commands run from this directory, the way contract commands run from
`contracts/`. The Supabase CLI looks for `supabase/` beside the working
directory, so running from the repository root will not find it.

```bash
cd backend

supabase db push          # apply migrations to the linked project
supabase migration list   # what is applied where

cd supabase/tests && npm test    # the role tests, against the linked project
```

The role tests need `.env.local` at the repository root, copied from
`.env.example`. They create real users in the project and delete them again;
everything they touch cascades away with the user.

## Where the schema is going

`profiles` and `wallet_links` are in. Still to come: the hackathon, team and
project metadata tables, the sealed `scorecards` and `ballots`, and the derived
tables the indexer writes.
