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

To read the deployed code's own hash back off the network:

```bash
stellar contract info interface --id <address> --network testnet
```

## Testnet

Deployed 24 August 2026 from the `stelhacks-testnet` identity,
`GB45FLZ24LKDNR2OSMHGI45PA47PY4W4VSTK7BPTATZTPN7JVEG3Y4WP`, funded by
friendbot. Test network, test lumens, no real money.

### Code

| Contract | Wasm hash | Upload transaction |
|---|---|---|
| `hackathon-core` | `723f97369d97a5c4e0911e0f004dc22094d454538a996609aca5e6779f0840af` | [`fcf320cb…`](https://stellar.expert/explorer/testnet/tx/fcf320cbc7c0118acaac0d558d497df557f0c23c3c07360eea9ccd4a76499efa) |
| `prize-vault` | `afc98888d9321be76160951ce072b52f08c7f3a6a0e29ee1ac9e3c0aa4783ffb` | [`c5d45d80…`](https://stellar.expert/explorer/testnet/tx/c5d45d80f312c0879190f8b13031f763254321043507adfd5b2cf318ae68f252) |

These hashes are the reusable part. A hackathon is one instance of
`hackathon-core` and one instance of `prize-vault`, so every event deploys its
own pair from these two hashes rather than sharing a contract with anyone else.

### The reference pair

One instance of each, deployed together so the uploaded code can be shown to
actually run rather than merely to exist.

| Instance | Address |
|---|---|
| `hackathon-core` | [`CCYS3M7O…`](https://stellar.expert/explorer/testnet/contract/CCYS3M7OXPAFHDZM3BKHBYFLHZ7CP4P43SDC2MY4U7MFC7VIPWVJB2EE) |
| `prize-vault` | [`CC2UME4N…`](https://stellar.expert/explorer/testnet/contract/CC2UME4NWYUPHTH5D3GQ6BPL4VCSYH55HKMCUFT54WBJFZREPTFPGBKQ) |

The vault was bound to that core instance at creation, against the native lumen
SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`. Reading it back
returns what was written:

```
vault.core()    → CCYS3M7OXPAFHDZM3BKHBYFLHZ7CP4P43SDC2MY4U7MFC7VIPWVJB2EE
vault.asset()   → CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
vault.balance() → 0
core.phase()    → Error(Contract, #2), which is NotInitialized
```

That last line is the useful one. The core instance is deployed but no
hackathon has been created on it, and it says so with its own error code, which
is how we know the deployed binary is executing this repository's logic and not
merely occupying an address.

**The core instance is deliberately left uninitialized.** `create` can be called
once per instance and would need a full constitution passed over the command
line. The first real hackathon on testnet is created through the TypeScript SDK
in M11, which is the point at which building a constitution stops being an
exercise in hand written JSON.

## Mainnet

Nothing. M19.
