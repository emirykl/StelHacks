# Sealer

Holds scorecards and ballots during the judging window, and publishes one digest
committing to all of them when it closes.

```bash
SEALER_SECRET_KEY=S... npm start
```

## The only place the product asks for trust

Everything else in StelHacks is verifiable without believing anybody. This is
not: between a judge submitting and the root going on chain, this service holds
something nobody else can read. Being precise about what that lets it do is more
useful than promising it will behave.

**It cannot change an entry.** The judge signs the leaf, and the tree commits to
that same leaf. A scorecard altered after submission no longer matches the
signature given for it, and the signature travels with it.

**It cannot deny receiving one.** Every intake returns a receipt signed by the
sealer's own key, covering the leaf and the moment it arrived. The timestamp is
inside the signature, so it cannot later be moved to claim an entry was late.

**It cannot quietly leave one out.** A receipt says the service holds a leaf.
The published root says what it committed to. If the receipt verifies and the
leaf has no proof under that root, the service dropped it, and no explanation
reconciles the two. Anybody can run that check; `omitted()` in `src/seal.ts` is
it, and `test/omission.test.ts` is a dishonest service being caught by it.

So the worst it can do is refuse an entry to your face, which is a different
kind of problem and a visible one.

## Routes

| | |
|---|---|
| `POST /scorecard` | Take one, hand back a receipt |
| `POST /ballot` | The same, for the crowd |
| `POST /seal` | Build the tree and publish the root on chain |
| `GET /proof` | The inclusion proof for one leaf |

The proof route answers from the moment the root exists rather than at some
later point. A judge who has to wait to check their own inclusion is a judge
being asked to trust in the meantime, which is the thing this whole design is
trying to avoid.

## Two details that carry weight

**The tree is rebuilt, never stored.** Storing it would put a second answer
beside the entries and leave room for the two to differ. Rebuilding means the
root can only ever be what the entries say it is.

**Leaves are sorted before hashing.** The service decides nothing about the
shape of the tree this way: hand the same entries to anybody and they build the
same root, so a root that does not match the entries is visibly the service's
doing rather than a question of who put what where.

**One key signs receipts and publishes the root.** The constitution names the
address allowed to publish, so a receipt signed by that same address is a
promise made by exactly the party the rules already identified, rather than by
some service nobody agreed to.

## Tests

```bash
npm test
```

Written from the attacker's side: each test is the service trying something and
passing means it was caught.
