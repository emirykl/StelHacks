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
| `hackathon-core` | `2c2b532cef6963de1b5ffbf02dff9bafe3845eaa65a6049d87b3554f66a6d0cb` | [`2b29b130…`](https://stellar.expert/explorer/testnet/tx/2b29b130af6b62cec38ae92f09820082cdb083cbd68e473ee703807ff6227343) |
| `prize-vault` | `afc98888d9321be76160951ce072b52f08c7f3a6a0e29ee1ac9e3c0aa4783ffb` | [`c5d45d80…`](https://stellar.expert/explorer/testnet/tx/c5d45d80f312c0879190f8b13031f763254321043507adfd5b2cf318ae68f252) |

These hashes are the reusable part. A hackathon is one instance of
`hackathon-core` and one instance of `prize-vault`, so every event deploys its
own pair from these two hashes rather than sharing a contract with anyone else.

### The reference pair

One instance of each, deployed together so the uploaded code can be shown to
actually run rather than merely to exist.

| Instance | Address |
|---|---|
| `hackathon-core` | [`CCQ7LAZ7…`](https://stellar.expert/explorer/testnet/contract/CCQ7LAZ7TH3DPWK3MCL2JFOM3JLMK6UKFTOMR2TERRXVLYBZ55LEHHNB) |
| `prize-vault` | [`CCM6LIBB…`](https://stellar.expert/explorer/testnet/contract/CCM6LIBBBDYVNPHKCSRORFR3LXLGWO5J4DFRLWDHYBBK7UDBCMMPGCF5) |

The vault was bound to that core instance at creation, against the native lumen
SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`. Reading it back
returns what was written:

```
vault.core()    → CCQ7LAZ7TH3DPWK3MCL2JFOM3JLMK6UKFTOMR2TERRXVLYBZ55LEHHNB
vault.asset()   → CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
vault.balance() → 0
core.phase()    → Error(Contract, #1), which is NotInitialized
```

That last line is the useful one. The core instance is deployed but no
hackathon has been created on it, and it says so with its own error code, which
is how we know the deployed binary is executing this repository's logic and not
merely occupying an address.

**The core instance now holds the first real hackathon**, created through the
SDK by `sdk/examples/create-hackathon.ts` rather than by hand written JSON. Its
rules are locked under

```
f9fe741a6e8554376e759462d577e751bf95abab6382cdf4f1fcd02ebc3a0b3b
```

which is the digest the SDK computed before anything was signed, the digest the
contract stored, and the digest the indexer wrote into Postgres. Three
independent implementations of the same hash agreeing on a live network is the
claim the whole product rests on, and this is where it stopped being a test.

### Superseded

| Contract | Wasm hash | Why it was replaced |
|---|---|---|
| `hackathon-core` | `723f97369d97a5c4e0911e0f004dc22094d454538a996609aca5e6779f0840af` | Its error enum carried 104 cases. The contract spec caps an error enum at fifty, so the interface it published could not be parsed by a strict XDR reader and the contract was uncallable from JavaScript. See decision 20. |
| `hackathon-core` | `db124ad0fa0a9aba6ba61d223f781e3f9be543a6a985308b3379d72fcd379dcc` | It paid a whole prize to the team captain. Prizes are now split equally and each member is paid directly. See decision 21. |

The instances built on those, cores `CCYS3M7OXPAFHDZM3BKHBYFLHZ7CP4P43SDC2MY4U7MFC7VIPWVJB2EE` and
`CBHRAK6S2HLGDPJQEOR3PV3X4NLHAMO7KKNEAHJVHIVRQPWOHDB2IROW` with their vaults,
are left where they are rather than pretended away. They hold no money and no
hackathon.

## Mainnet

Nothing. M19.

## A second event, made to try the surfaces on

The first hackathon on this page is stuck in `Funding`, so nothing that only
happens once an event is open could be exercised against it: the participant
flow, the applications queue, the organizer's console past the first step.

`frontend/scripts/seed-testnet.mts` makes another and walks it all the way to
`Open`. It generates its own key and funds it from friendbot, so it needs
nothing from anybody and the key it prints is worth exactly the testnet lumens
it was given.

| What | Address |
|---|---|
| `hackathon-core` | `CAURPTIPWAPOYRAQV5RVMV4QDTQUI5UJDCIYDASBCSFINPSEKCS5N5ZG` |
| `prize-vault` | `CDC5LBLUC7QWIV473BHZQYT77NUXWRRJSCRUH76GV7OVUHOVGQV2767B` |

Locked under digest
`a5ed56f7e812fd4e283b098e90286d8f2d600c64996f48cde611f4cef329faea`, funded with
ten lumens against a single ten lumen first prize, and open for registration.
One address has applied and is waiting.

**Two things it caught, both of which the frontend had wrong.** A judge with an
empty track list is refused: the contract will not read that as "every track",
because a judge who can score nothing breaks a quorum for projects that did
nothing wrong. And the vault's `create` is an ordinary entry point rather than a
constructor, so deploying it with its arguments attached fails inside the wasm
with a missing value. It has to be deployed empty and then told what it holds.
