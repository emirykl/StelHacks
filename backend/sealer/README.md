# Sealer

Holds Sub Rosa time-lock ciphertext for scorecards and ballots during judging,
and publishes one digest committing to all signed leaves when the window closes.

```bash
SEALER_SECRET_KEY=S... npm start
```

## What is private, and what still asks for trust

The browser encrypts each private body with `@sub-rosa/tlock` for the first Drand
quicknet round at or after the judging deadline frozen in the constitution. The
service independently derives that round and rejects an earlier envelope. Until
the beacon exists, the database, organizer and service-role process all have
only ciphertext; Supabase RLS is an additional boundary, not the secrecy claim.

After the deadline the service can decrypt and reveal the bodies. This is
deadline privacy, not permanent anonymity. The remaining trust is availability:
the service can refuse or omit an entry, but it cannot do either quietly.

**It cannot change an entry.** The judge or voter signs the plaintext leaf before
it is encrypted, and the tree commits to that same leaf. A body altered after
submission no longer matches its signature and commitment.

**It cannot deny receiving one.** Every intake returns a receipt signed by the
sealer's own key, covering the leaf and the moment it arrived. The timestamp is
inside the signature, so it cannot later be moved to claim an entry was late.

**It cannot quietly leave one out.** A receipt says the service holds a leaf.
The published root says what it committed to. If the receipt verifies and the
leaf has no proof under that root, the service dropped it, and no explanation
reconciles the two. Anybody can run that check; `omitted()` in `src/seal.ts` is
it, and `test/omission.test.ts` is a dishonest service being caught by it.

So the worst it can do is refuse or visibly omit an entry. It cannot inspect
scores early and selectively censor them based on their contents.

## Routes

| | |
|---|---|
| `POST /scorecard` | Take a signed, time-locked card and return a receipt |
| `POST /ballot` | The same for a community ballot |
| `POST /seal` | Build the tree and publish the root on chain |
| `GET /root` | The root it would publish, for a sealer that is not us |
| `GET /proof` | The inclusion proof for one leaf |

The proof route answers from the moment the root exists rather than at some
later point. A judge who has to wait to check their own inclusion is a judge
being asked to trust in the meantime, which is the thing this whole design is
trying to avoid.

## The half nobody asks for

Taking an entry is a request and answering it is a route. Putting the entries on
chain is not: it happens when the judging window shuts and again once the phase
allows them to be opened, and neither moment arrives as an HTTP call. So the
process also walks every hackathon on a timer, in `src/rounds.ts`:

| When | What |
|---|---|
| Judging, window shut | Publish the root committing to everything held |
| Reveal | Fetch the Drand beacon, decrypt and open every valid entry under it |
| Reveal, all opened | Rank, since nothing is left to wait for |

`POST /seal` stays, and does the first of those on demand.

None of it is a decision. The root is a function of the entries held, a reveal
is authorized by its own Merkle proof rather than by this service, and the
ranking is the contract's own formula over what is on chain by then. The only
thing this adds is being awake.

It also has to happen in that order, and the clock is what holds it: a root can
only be published while the hackathon is in Judging, so a phase moved on early
would strand every score in a service that could no longer publish them.
`backend/clock` checks for the root before it leaves that phase.

## Where this runs

Two shapes, one set of routes. `src/routes.ts` answers requests and knows
nothing about what carried them; `src/server.ts` is the long lived process that
listens on a port, and `api/[...path].ts` is the same routes as one Vercel
function per request. Neither adapter contains a check of its own, because a
second copy of the intake rules is how a deployment starts accepting what the
service refuses.

The Vercel project is `stelhacks-backend`, rooted at this directory, and
`vercel.json` rewrites `/scorecard` to `/api/scorecard` so the public paths stay
the ones the judging page already asks for. Moving the service behind it is a
change of `NEXT_PUBLIC_SEALER_URL` in the frontend and nothing else.

What does not come along is the timer below. A function lives for one request,
so a deployment whose routes are functions still needs `npm start` running
somewhere for a judging window to close by itself. `POST /seal` is the manual
version of the first row of that table and works from the deployment; the reveal
and the ranking do not.

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
