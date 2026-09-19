# Shared fixtures

The values the contract and the TypeScript SDK both have to reach.

## Why these exist

The product's central claim is that a participant can check the result rather
than trust whoever published it: rebuild the rules from the public page, hash
them in a browser, and compare against what the chain stored. That only works
while two independent implementations agree, and two implementations that each
pass their own tests can drift apart for months without either noticing.

So the agreement is written down here, and neither side is measured against the
other. `contracts/hackathon-core/src/test/interop.rs` asserts the contract still
produces these values. `sdk/test/*.test.ts` asserts TypeScript reaches them from
inputs written independently in TypeScript. A change on either side turns one of
the two suites red, and the file is what says which side moved.

## The files

| File | What it holds |
|---|---|
| `constitution.xdr.hex` | The canonical constitution, XDR encoded |
| `constitution.sha256` | Its digest, which is what a lock stores on chain |
| `submission.xdr.hex` | The canonical submission metadata, XDR encoded |
| `submission.sha256` | Its digest, which is what pins a project at the deadline |
| `scorecard-leaf.sha256` | The leaf a judge's scorecard occupies in the sealed tree |
| `ballot-leaf.sha256` | The leaf a community ballot occupies |
| `merkle-root.sha256` | The two leaves above, combined into one node |
| `event-project-submitted.hex` | One real `ProjectSubmitted` event, whole, as the chain emitted it |
| `ranking.txt` | A finished ranking, with everything it was derived from |

Digests and encodings are hex, one value per file and nothing else, so a value
that moves shows up as a changed line rather than as a blob. `ranking.txt` is
lines of `key=value` because it carries a whole scenario rather than one number.

Bytes are committed alongside digests on purpose. A digest that moved while the
bytes did not means the hashing changed; bytes that moved mean the type itself
did, and that is the change which silently invalidates every constitution
already locked on chain.

## Changing one

Both suites will fail, and that is the system working rather than a problem to
route around. Regenerate the value from the Rust side, commit it, and expect the
TypeScript suite to stay red until it is updated to match. If only one language
needed changing, something is wrong with the change.

The values themselves are built by `canonical_constitution` and its neighbours
in `contracts/hackathon-core/src/fixtures.rs`, and mirrored by
`sdk/test/canonical.ts`. The addresses in them are written out in full rather
than generated, because a random address would differ between the two runs and
make the whole comparison meaningless.
