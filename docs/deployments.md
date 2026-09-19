# Deployments

Every address this project has published, with the digest of the code behind
it. Nothing here is a secret; the point of the file is that anyone can check the
code running on chain is the code in this repository.

## How to verify

The wasm hashes below are what `stellar contract build` produces from a clean
checkout. CI compiles twice and compares, so a hash that matches is the same
build any reader would get:

```bash
cd contracts
stellar contract build
# The Wasm Hash lines must match the table below.
```

To read the deployed code's own interface back off the network:

```bash
stellar contract info interface --id <address> --network testnet
```

## Testnet

Deployed from the `stelhacks-testnet` identity,
`GB45FLZ24LKDNR2OSMHGI45PA47PY4W4VSTK7BPTATZTPN7JVEG3Y4WP`, funded by
friendbot. Test network, test lumens, no real money.

### Code

| Contract | Wasm hash | Upload transaction |
|---|---|---|
| `hackathon-core` | `db124ad0fa0a9aba6ba61d223f781e3f9be543a6a985308b3379d72fcd379dcc` | [`931aa17c…`](https://stellar.expert/explorer/testnet/tx/931aa17cc201d2f991d65f7cbe1134aa50a1870fdc0aebe2999675755114aaf3) |
| `prize-vault` | `afc98888d9321be76160951ce072b52f08c7f3a6a0e29ee1ac9e3c0aa4783ffb` | [`c5d45d80…`](https://stellar.expert/explorer/testnet/tx/c5d45d80f312c0879190f8b13031f763254321043507adfd5b2cf318ae68f252) |

These hashes are the reusable part. A hackathon is one instance of
`hackathon-core` and one instance of `prize-vault`, so every event deploys its
own pair from these two hashes rather than sharing a contract with anyone else.

### The reference pair

One instance of each, deployed together so the uploaded code can be shown to
actually run rather than merely to exist.

| Instance | Address |
|---|---|
| `hackathon-core` | [`CBHRAK6S…`](https://stellar.expert/explorer/testnet/contract/CBHRAK6S2HLGDPJQEOR3PV3X4NLHAMO7KKNEAHJVHIVRQPWOHDB2IROW) |
| `prize-vault` | [`CBTUO7CL…`](https://stellar.expert/explorer/testnet/contract/CBTUO7CLEGOC437ESNALHLOKMVGFY6QLWRHSJJEQODRFZKVDNJGVTY7R) |

The vault was bound to that core instance at creation, against the native lumen
SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`. Reading it back
returns what was written:

```
vault.core()    → CBHRAK6S2HLGDPJQEOR3PV3X4NLHAMO7KKNEAHJVHIVRQPWOHDB2IROW
vault.asset()   → CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
vault.balance() → 0
core.phase()    → Error(Contract, #1), which is NotInitialized
```

That last line is the useful one. The core instance is deployed but no
hackathon has been created on it, and it says so with its own error code, which
is how we know the deployed binary is executing this repository's logic and not
merely occupying an address.

**The core instance is deliberately left uninitialized.** `create` can be called
once per instance and would need a full constitution passed over the command
line. The first real hackathon on testnet is created through the TypeScript SDK,
which is the point at which building a constitution stops being an exercise in
hand written JSON.

### Superseded

| Contract | Wasm hash | Why it was replaced |
|---|---|---|
| `hackathon-core` | `723f97369d97a5c4e0911e0f004dc22094d454538a996609aca5e6779f0840af` | Its error enum carried 104 cases. The contract spec caps an error enum at fifty, so the interface it published could not be parsed by a strict XDR reader and the contract was uncallable from JavaScript. See decision 20. |

The instances built on it, core `CCYS3M7OXPAFHDZM3BKHBYFLHZ7CP4P43SDC2MY4U7MFC7VIPWVJB2EE` and vault
`CC2UME4NWYUPHTH5D3GQ6BPL4VCSYH55HKMCUFT54WBJFZREPTFPGBKQ`, are left where they
are rather than pretended away. They hold no money and no hackathon.

## Mainnet

Nothing. M19.
