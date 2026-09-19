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
| `backend/` | Event indexer and read API |
| `frontend/` | Web application |
| `StelHacks-PRD.md` | Product requirements document |

## Requirements

- Rust with the `wasm32v1-none` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli) 27 or newer
- Node.js 24 or newer

## Working on the contracts

```bash
cd contracts
cargo test          # run the unit and integration tests
stellar contract build   # build the wasm artifacts
```

## Status

Early development. Contracts are being built first; the SDK, indexer and web
application follow on top of them.
