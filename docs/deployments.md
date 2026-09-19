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

It is indexed and reachable at `/hackathons/open-house`, and the whole chain has
been walked end to end: the contract was written from the browser's own encoder,
the indexer read it back into Postgres, the page served what Postgres held, and
the browser then asked the contract directly and found all four claims sound.
The digest on the page is the one the lock returned, character for character.

Catching the indexer up took twelve passes. It starts at the oldest ledger the
node still holds and scans about ten thousand per pass, so a contract whose
events are recent is a hundred thousand ledgers of empty scanning away. That is
the same bounded window the applications queue runs into, and the same reason
both are slower than they look like they should be.

**Two things it caught, both of which the frontend had wrong.** A judge with an
empty track list is refused: the contract will not read that as "every track",
because a judge who can score nothing breaks a quorum for projects that did
nothing wrong. And the vault's `create` is an ordinary entry point rather than a
constructor, so deploying it with its arguments attached fails inside the wasm
with a missing value. It has to be deployed empty and then told what it holds.

## A whole hackathon in four minutes

`frontend/scripts/full-lifecycle.mts` builds an event whose windows are a minute
wide and walks it end to end: create, lock, fund, publish, apply, approve, form
a team, submit, screen, seal a scorecard, reveal it, rank, pay, close. It
generates its own keys and funds them from friendbot.

| What | Address |
|---|---|
| `hackathon-core` | `CCESH6AKD7C7XFNQLVBEGL47CVZVTSFBWBY7OU3QNKLTOIWSD2UOLDOL` |
| `prize-vault` | `CCCSTMCVU3MS3VRC5UU7XGLPW46RW6G4M54KJJG62PYOULLFDX4GMKN4` |

One entry, scored 90 and 80 against a rubric weighted sixty forty, which the
contract totalled to 860000 and ranked first. Ten lumens paid out, the vault
emptied, the event closed. It is at `/hackathons/four-minutes`.

**Five things it caught, and none of them would have failed a build.**

The score root cannot be published before the scoring window shuts, which is the
contract making sure a root cannot commit to a set still being added to. A leaf
is one hash over the tag, the domain and the XDR together, not a hash of the
body then tagged, and getting that wrong produces a root the contract rejects as
not matching. `advance_phase` refuses the reveal outright because that stage has
no closing deadline: `finalize_results` is what ends it and `open_settlement` is
what ends the next, and the organizer console had both mapped a phase late, so
each of its last three buttons would have failed. And the weighted score is a
criterion out of a hundred times ten thousand basis points, so a perfect card is
a million; dividing by anything else printed this result as eighty six hundred
percent.

## The sealed route, proved end to end

`frontend/scripts/sealed-lifecycle.mts` is the four minute walk again, but the
scorecard goes to the collection service instead of the organizer publishing a
root themselves. That is the arrangement the judge console uses, and it is the
only way to find out whether the service, the SDK and the contract agree about
what a leaf is and what a signature covers.

| What | Address |
|---|---|
| `hackathon-core` | `CBJQGVRAX57HQ53G4TDMMMOXNKJTXAL4DWO3NG3FUU474JRVPYMITXHP` |
| `prize-vault` | `CDNCIR2IIORTRKSEHK32R4FRZPAEJDNMCKQ4M3BA46T5UWHSTEZRSCVB` |
| sealer | `GDTQSU3L2UVUEFOHEGDO5FNICW2URPWNFEQVZYK46LX6ZPNCYDUNEVGC` |

The card was taken and receipted, the service built the tree and published the
root on chain as the address the rules named, the inclusion proof came back, the
card revealed to the same 860000, and the prize was paid.

**Three things it caught.** The sealer's own account has to be funded, because
publishing a root is a transaction like any other. Version 17 of the Stellar SDK
returns a plain `Uint8Array` from `Keypair.sign`, and `Uint8Array.toString("hex")`
is not hex: it is the comma separated decimals, which decode to a single byte
and produce a signature rejected for its length rather than its contents. The
frontend is on 17 and the backend and SDK are on 14, where the same call returns
a `Buffer`, so anything moving between them has to wrap before it stringifies.
