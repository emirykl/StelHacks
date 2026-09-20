# Clock

Keeps every hackathon to the deadlines its own rules set, by being the thing
that is awake when one passes.

```bash
npx tsx src/index.ts            # keep every hackathon to its deadlines
npx tsx src/index.ts --once     # one lap, then stop
```

## Why a process exists for this

A Soroban contract cannot wake itself. `hackathon-core` knows its deadlines and
refuses to move before one passes, but nothing in the ledger schedules a call,
so a phase that is due stays where it is until somebody sends a transaction.
Before this service that somebody was the organizer, looking at a button that
told them the deadline had passed and asked them to agree with it.

So this is not an automated decision. There is no decision: the condition is a
timestamp anybody can read, `advance_phase` takes no address and calls no
`require_auth`, and the contract refuses it early whoever sends it. All this
process contributes is being awake.

## What it may do, and what it cannot

The key in `CLOCK_SECRET_KEY` pays a transaction fee. That is the whole of its
authority, and it is not an exception to the rule that no key here can move
money or change a result: this call is open to the public, so the address
sending it is not a permission. Anybody with a funded account could send the
same transaction and the contract would not be able to tell the difference.

It is deliberately not the sealer's key. The sealer's address is named in the
constitution as the one allowed to publish a root, so it means something, and an
address that means something should not also be running errands anybody could
run.

Three calls, and each one waits on a condition the contract can check but not
act on:

| Call | Waits for |
|---|---|
| `advance_phase` | The deadline closing Open, Screening or Judging |
| `open_settlement` | The safety window announced before the lock |
| `complete` | The vault owing nobody anything |

Leaving Judging has one more condition, and it is not the contract's. A sealed
root may only be published while the hackathon is still in that phase, so a lap
that moved it on before `backend/sealer` had published would strand every score
in a service that could no longer put them on chain. Nothing in the contract
prevents that, because until something moved phases unattended the party doing
it was the one who knew whether the sealing had happened. So this waits for the
root, and for the ballot root when the rules run a community vote.

Everything else moves on an act somebody should mean. Paying the winners is the
organizer's, and asking for it from here refuses.

## Losing it is a degradation, not a corruption

While it is down, deadlines still hold. An entry arriving late is refused by the
submission deadline itself and a score by the judging one, both checked against
the clock rather than against the phase, so a phase left behind lets nothing
through that should have been kept out. No money moves anywhere it was not
already owed either: `complete` only marks an event finished, and every prize
left it earlier.

What stops is the handing over. Judges cannot start scoring until Judging is
entered, payouts do not open when the safety window expires, and an event whose
vault is empty is not marked finished.

Two things follow. The manage page still offers `advance_phase` to the organizer
once a deadline has been sitting unacted on for two minutes, which is the
fallback for the one case where waiting actually costs somebody something. And a
lap tries all three calls in order, so a hackathon that waited out an outage
moves as far as it can in one pass rather than one step per lap.

## The shape of a lap

Read the hackathons from the database, then for each one simulate
`advance_phase` and send it if the simulation goes through.

Deliberately no deadline arithmetic here. Whether a phase is due is asked of the
contract, because a copy of the rules in this service would be a second opinion,
and the two would part company the first time an organizer extended a deadline.

The only thing read from the projection is which hackathons to skip, and only
the terminal phases are trusted for it. The indexer rebuilds from the event log
so its phase can lag the chain's, never lead it — which makes `Completed` and
`Cancelled` safe to believe and everything else worth a lap anyway. `src/due.ts`
has the argument written out, and the tests in `test/` hold it.
