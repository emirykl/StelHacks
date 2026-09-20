# Deployments

The code this project has on chain, with the digest behind it. Nothing here is a
secret; the point of the file is that anyone can check the code running on chain
is the code in this repository.

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
| `hackathon-core` | `bcea11748fa535ea311ca7d0548274f4828143b70f9f85294b3b6c32749c9c78` | [`b63b9558…`](https://stellar.expert/explorer/testnet/tx/b63b9558a412b8f0a85ffe590c03eac0147e6931dd6e73f9bf9b6c07514a5f74) |
| `prize-vault` | `afc98888d9321be76160951ce072b52f08c7f3a6a0e29ee1ac9e3c0aa4783ffb` | [`c5d45d80…`](https://stellar.expert/explorer/testnet/tx/c5d45d80f312c0879190f8b13031f763254321043507adfd5b2cf318ae68f252) |

These hashes are the reusable part. A hackathon is one instance of
`hackathon-core` and one instance of `prize-vault`, so every event deploys its
own pair from these two hashes rather than sharing a contract with anyone else.

Neither contract has an upgrade path: there is no administrator and no
`update_current_contract_wasm` anywhere in either of them, on purpose, because a
hackathon whose code could be swapped after the rules were locked would make the
lock decorative. New code means a new upload, and since every event deploys its
own pair anyway, the only thing an upload changes is which code the next event
gets.

### The reference instance

One core, deployed so the uploaded code can be shown to actually run rather than
merely to exist.

| Instance | Address |
|---|---|
| `hackathon-core` | [`CCWSACHR…`](https://stellar.expert/explorer/testnet/contract/CCWSACHRMLE2YYXRTIXTTBIJBQRRFSAXXLLN3QXKGOP22K6HODEFXJ4T) |

```
core.phase() → Error(Contract, #1), which is NotInitialized
```

That is the useful line. The instance is deployed but no hackathon has been
created on it, and it says so with its own error code, which is how we know the
deployed binary is executing this repository's logic and not merely occupying an
address.

No vault beside it any more, and that is the change: `set_up` deploys the vault
itself, so a core carrying no hackathon has no vault to show. The pair that
proves the two contracts still work together is the lifecycle run below, which
ends with an emptied vault and a closed event.

The published interface carries `set_up`, which is why this pair exists rather
than the one before it:

```
fn set_up(env, vault_wasm: BytesN<32>, salt: BytesN<32>) -> Result<Address, Error>
```

Opening an event was six calls and Soroban allows one per transaction, so it was
six signatures. `set_up` runs the same six inside one invocation: it freezes the
rules, deploys the vault, tells it what it serves, binds it, moves the deposit in
and publishes. Nothing was loosened to fold them together; each step is the same
entry point with the same checks.

It also carries the three way submission rule:

```
pub enum FieldRule { Unasked = 0, Optional = 1, Required = 2 }
pub struct SubmissionRequirements {
    demo_video, deployed_contract, live_url, pitch_deck, repository
}
```

Read back with `stellar contract info interface`, so what is quoted here is what
the network publishes rather than what this repository intends to publish.

## Mainnet

Nothing. M19.

## What walking a whole event caught

Three scripts drive a real network rather than a test environment, and each one
found something no build would have failed on. They generate their own keys and
fund them from friendbot, so any of them can be run again from a clean machine.

`frontend/scripts/seed-testnet.mts` creates an event and walks it to `Open`,
which is what the participant flow, the applications queue and the organizer's
console need before they can be exercised at all.

- A judge with an empty track list is refused. The contract will not read that as
  "every track", because a judge who can score nothing breaks a quorum for
  projects that did nothing wrong.
- The vault's `create` is an ordinary entry point rather than a constructor, so
  deploying it with its arguments attached fails inside the wasm with a missing
  value. It has to be deployed empty and then told what it holds.
- Catching the indexer up took twelve passes. It starts at the oldest ledger the
  node still holds and scans about ten thousand per pass, so a contract whose
  events are recent is a hundred thousand ledgers of empty scanning away. That is
  the same bounded window the applications queue runs into, and the same reason
  both are slower than they look like they should be.

`frontend/scripts/full-lifecycle.mts` builds an event whose windows are a minute
wide and walks it end to end: create, set up, apply, approve, form a team,
submit, screen, seal a scorecard, reveal it, rank, pay, close. It is also the
only thing that reaches `set_up`'s deploy branch, because a unit test has no
built wasm to upload and so cannot have the contract stand a vault up.

- `require_auth` for one address twice in the same invocation is refused by the
  host as a duplicate authorization, with `Error(Auth, ExistingValue)`. `set_up`
  checks the organizer's signature once and then does the work of `lock_rules`
  and `bind_vault`, so that work had to come out of both into helpers that check
  nothing. Calling the entry points from inside failed on the first press.

- The score root cannot be published before the scoring window shuts, which is
  the contract making sure a root cannot commit to a set still being added to.
- A leaf is one hash over the tag, the domain and the XDR together, not a hash of
  the body then tagged. Getting that wrong produces a root the contract rejects
  as not matching.
- `advance_phase` refuses the reveal outright, because that stage has no closing
  deadline: `finalize_results` ends it and `open_settlement` ends the next. The
  organizer console had both mapped a phase late, so each of its last three
  buttons would have failed.
- The weighted score is a criterion out of a hundred times ten thousand basis
  points, so a perfect card is a million. Dividing by anything else printed a
  result as eighty six hundred percent.

`frontend/scripts/sealed-lifecycle.mts` is the same walk with the scorecard going
to the collection service instead of the organizer publishing a root themselves.
That is the arrangement the judge console uses, and the only way to find out
whether the service, the SDK and the contract agree about what a leaf is and what
a signature covers.

- The sealer's own account has to be funded, because publishing a root is a
  transaction like any other.
- Version 17 of the Stellar SDK returns a plain `Uint8Array` from `Keypair.sign`,
  and `Uint8Array.toString("hex")` is not hex: it is the comma separated
  decimals, which decode to a single byte and produce a signature rejected for
  its length rather than its contents. The frontend is on 17 and the backend and
  SDK are on 14, where the same call returns a `Buffer`, so anything moving
  between them has to wrap before it stringifies.
