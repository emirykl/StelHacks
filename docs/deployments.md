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
| `hackathon-core` | `4bf32e95b0758cc6af291bf4e91f86dba1bad8c7e81926479f6404af73c7ec1c` | [`46ede969…`](https://stellar.expert/explorer/testnet/tx/46ede9696f7c5f137685e7e82b5cd1ae8fce5508a83c170710e7551a02a037be) |
| `prize-vault` | `afc98888d9321be76160951ce072b52f08c7f3a6a0e29ee1ac9e3c0aa4783ffb` | [`c5d45d80…`](https://stellar.expert/explorer/testnet/tx/c5d45d80f312c0879190f8b13031f763254321043507adfd5b2cf318ae68f252) |

The core moved when sponsorship arrived: the constitution gained a policy
saying whether outside money may join the pool, so the document is at version
six and a version five contract would refuse it. `prize-vault` is untouched and
its hash is the one it has always had — the vault already took deposits from
anyone, and what was missing was a destination for them, which lives in the
core.

### What an upload does not do

The core moved again for the batch application calls and sponsor placement:
`approve_applications`, `reject_applications` and `sponsor_places`. The change
is additive — nothing was removed or renamed, and the error enum is unchanged at
forty nine cases, which is what lets the clock keep reading refusals off a live
contract it was not built against.

Uploading is not upgrading. Neither contract has an `upgrade` entry point, on
purpose: a hackathon's rules are frozen at the lock and a contract somebody
could swap underneath them would make that promise worth nothing. So a new wasm
reaches new hackathons only. Every instance already on chain keeps running the
code it was deployed with, for as long as it exists.

Which makes the hash in `frontend/app/create/wizard.tsx` the thing that decides
what gets deployed next, and it has to be changed in the same pass as the
upload. The three hackathons deployed from `90d71d2d…` are still on it and will
stay there.

### The size ceiling, found the hard way

That upload failed first. The wasm had reached 158 KB and the network refused
the transaction outright as `TxSorobanInvalid`, with nothing in the error to say
which limit had been crossed.

Of those 158 KB, **93 KB were `contractspecv0`** — the published interface, which
carries every doc comment on every entry point, type, field and error variant.
The code itself was 57 KB. The contract had been growing a binary made mostly of
prose, and adding a feature is what pushed it past the edge.

The fix was not to write less. Doc comments on public items are published;
ordinary comments are not, and both are read by anybody opening the file. So the
first paragraph of each doc block stayed documentation and the rationale below
it became an ordinary comment. Nothing was deleted, 192 blocks moved, and the
wasm came back at 112 KB with the spec at 47 KB.

Worth knowing before the next feature: an interface's doc comments are shipped
to every validator, and they are the part of this contract most likely to run
out of room first.

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

A hackathon standing up from this code, so the upload can be shown to run rather
than merely to exist. It is the demonstration event the listing page shows.

| Instance | Address |
|---|---|
| `hackathon-core` | [`CDANGHBE…`](https://stellar.expert/explorer/testnet/contract/CDANGHBE63NZCE635GWIDXXCDVM2QM64EMXSOAYSUI5SQM7CHCPTUHUM) |
| `prize-vault` | [`CCYPGWR3…`](https://stellar.expert/explorer/testnet/contract/CCYPGWR3WEGMGWKSE3TWW2YZKCONEIJ3R6PWMVJDBT6JJVU6QSASNNFL) |

Open, denominated in testnet lumens, with a thousand of them across three places
and the sponsorship door open. The first contribution was made against it to
prove the path rather than to describe it:

```
core.payable("main", 1) → 5_000_000_000      # five hundred lumens, as frozen
core.sponsor_tier(sponsor, "main", 1, 250 XLM)
core.payable("main", 1) → 7_500_000_000      # seven hundred and fifty
core.sponsored_fee()    →   125_000_000      # the cut, charged on top
```

That last line is the whole argument for where the fee sits. The sponsor paid
262.5 lumens, first place grew by the 250 they announced, and the winner will be
paid the number the page showed rather than a number net of anything.


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
