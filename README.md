# StelHacks

An end to end verifiable hackathon platform running on Stellar and Soroban.

An organizer sets up the hackathon, locks the prize into a contract, judges score
the projects, the contract computes the result, and the prize is paid out to the
winners automatically. Every step leaves a permanent, public proof.

> **No black swans.** The result follows from rules everyone read up front.

## Repository layout

| Path | Contents |
|---|---|
| `contracts/` | Soroban smart contracts (Rust workspace) |
| `backend/` | Database schema, row level security, and the event indexer |
| `frontend/` | Web application |
| `sdk/` | TypeScript SDK, shared by the backend and the frontend |
| `fixtures/` | Test vectors the contracts and the SDK are both measured against |
| `docs/` | Decisions taken while building, and deployment records |
| `StelHacks-PRD.md` | Product requirements document |

The last two sit outside the three layers on purpose, because they belong to
neither. The SDK is used by the indexer and by the browser, so filing it under
one would hide it from the other. The fixtures are read by Rust tests and
TypeScript tests at once, which is the whole point of them: they are what stops
the two languages drifting apart.

Each layer runs its own commands from its own directory, so nothing depends on
which directory a command happens to be typed in.

## Requirements

- Rust with the `wasm32v1-none` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli) 27 or newer
- Node.js 24 or newer

## Working on it

```bash
cd contracts               # Soroban
cargo test
stellar contract build

cd sdk                     # TypeScript SDK
npm test                   # needs the wasm above to have been built

cd backend                 # database
supabase db push
```

## Status

The contracts are finished and on testnet, with their addresses and build
hashes in `docs/deployments.md`. The SDK can rebuild and verify a full result
from chain data alone. The schema has started; the indexer and the web
application follow.
