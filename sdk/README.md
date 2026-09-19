# @stelhacks/sdk

Read, verify and rebuild a StelHacks hackathon result from chain data alone.

The package exists so that nobody has to trust the reference application to know
who won. Everything here works from what the contracts published: the locked
rules, the sealed roots, the revealed scorecards and ballots, and the ranking
derived from them. If this package and the chain disagree, one of them is wrong
and you can see which.

```bash
npm install @stelhacks/sdk
```

## Fifteen minutes: check a result yourself

The whole point is in `examples/verify-result.ts`, which runs against a finished
hackathon and takes nobody's word for the outcome:

```bash
npx tsx examples/verify-result.ts C<contract id> payments
```

It does three things. First it fetches the rules and proves they are the rules
that were locked:

```ts
const constitution = (await core.constitution()).result.unwrap();
const published = (await core.constitution_hash()).result.unwrap();

if (toHex(hashConstitution(constitution)) !== published.toString("hex")) {
  throw new Error("the rules being served are not the rules that were locked");
}
```

Then it reads everything the ranking was derived from, straight off the chain:

```ts
projects.push({
  team,
  track: entry.track,
  submittedAt: entry.submitted_at,
  valid: entry.status === 0,                       // 0 is Valid
  scores: { count: scores.count, total: scores.total },
  votes: (await core.vote_count({ team_id: team })).result,
  criterionTallies,
});
```

Then it derives the ranking again and compares:

```ts
const derived = rankTrack(constitution, track, projects, topVotes);
const publishedRanking = (await core.ranking({ track })).result.unwrap();
```

If those two differ, the published ranking is not the one the published data
produces, and that is worth making noise about. The example is type checked by
`npm run check`, so it cannot quietly rot into a snippet that no longer
compiles.

## What else is in here

**Digests.** `hashConstitution`, `hashSubmissionMetadata`, `scorecardLeaf` and
`ballotLeaf` reproduce the contract's digests exactly. They are checked against
the same committed fixtures the contract's own Rust suite asserts on, so neither
side can drift without a suite going red.

**Merkle proofs.** `merkle.build` makes a tree over any number of leaves and a
proof for each; `merkle.verify` checks one against a published root. This is how
a judge confirms their scorecard was included in the seal, and how a voter
confirms their ballot was.

**Signatures.** `signScorecard` and `signBallot` sign the leaf a judge or voter
is about to hand to the collection service, and `verifyScorecard` and
`verifyBallot` check one afterwards. Together with the inclusion proof they
bound what the service can do: the proof stops it dropping an entry, the
signature stops it inventing one.

**Events.** `decodeEvent` turns a raw Soroban event into named fields using the
contract's own published description, so an event that gains a field starts
returning it with no change here. An event this build does not recognise comes
back marked rather than dropped.

**Submission checks.** `validateSubmission` reports every field an organizer
asked for and the submission does not carry. This lives here rather than in the
contract because the metadata never reaches the chain, only its digest does; a
contract side check would be validating something it cannot see.

## Where the numbers come from

`rankTrack` is a line by line port of the contract's ranking, integer
arithmetic and all. Truncating division is deliberate: rounding differently
would agree almost always, and the times it did not would be ties decided a hair
apart, which is exactly where somebody would want to check.

## Working on this package

```bash
npm install
npm run bindings   # regenerate from the wasm; needs the Stellar CLI
npm run build
npm run check      # types
npm test
```

The suite reads `contracts/target/wasm32v1-none/release/*.wasm`, so build the
contracts first with `stellar contract build`. That is on purpose: the tests
check the SDK against the artifact the contracts actually produce, including
that the interface it publishes can be parsed at all.

The contents of `bindings/` are generated and committed so that consumers never
need the Stellar CLI. Nothing there is edited by hand, and a test fails if what
is committed stops matching the wasm.
