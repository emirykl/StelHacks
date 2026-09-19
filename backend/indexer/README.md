# Indexer

Soroban events into Postgres, and nothing else. It holds no Stellar key and
signs nothing: it can write down what the chain said, and it cannot make the
chain say anything.

```bash
npx tsx src/index.ts <contract id>            # follow it
npx tsx src/index.ts <contract id> --once     # one pass
npx tsx src/index.ts <contract id> --rebuild  # throw the projections away and rebuild
```

Point it at a `hackathon-core` instance. A vault has its own events and no
hackathon of its own to describe.

## The shape of a pass

Read a range from the chain, write the log, move the cursor, then rebuild the
projections **from the log** rather than from the range that just arrived. That
last part is slower and is the point: the rows in the database are always
exactly what the log says, never the accumulated result of every pass that
happened to run.

`chain_events` and `chain_reads` are the durable half. Everything else is a
projection of them and can be dropped at any time, which is what `--rebuild`
does. Losing the log is the only thing here that cannot be undone.

## Three things that are not in any event

`visibility` and `prize_asset` live in the constitution, a submission's `uri` is
absent from `ProjectSubmitted`, and the ranking is absent from `TrackRanked`,
which counts placings rather than naming them. All three are read from contract
state at ingest, while the state is still live, and kept in `chain_reads`.
Soroban entries expire, so a rebuild that called the contract again would work
today and fail in a year. Decision 22 has the reasoning.

## What running it against the chain taught us

Three things the tests could not have caught, all found on the first live pass:

**RPC does not scan the range you ask for.** It covers a bounded stretch per
request, roughly ten thousand ledgers, and hands back a cursor saying where it
stopped, whether or not it found anything. Treating an empty page as "nothing
happened up to the head of the chain" moved the cursor past seven thousand
ledgers nobody had looked at, and the event we were waiting for was in them. The
cursor now moves to where the cursor says the scan reached, never to the head.

**The stored name is the topic, not the type.** The chain publishes `created`;
the contract calls that event `Created`. The fields arrive as XDR and nothing
opens them on the way in, deliberately. `decode.ts` is the step that was missing
between the two, and it uses the contract's own published description rather
than a table kept here.

**Two contracts can share an event name.** Both a hackathon and a vault announce
`Created`, and they mean different things by it. The projection now skips an
event whose shape it does not recognise instead of coercing a missing field,
which it was doing until the database refused an address shaped `undefined`.

**Bytes are not text.** A digest arrives from the decoder as bytes, and putting
it through `String` decodes it as UTF-8: every byte that is not valid UTF-8
becomes the replacement character, and a thirty two byte hash comes out longer,
different and irreversible. Postgres stored it without complaint. The first
locked constitution was recorded under a digest matching nothing at all, which
is the exact failure the whole product exists to make impossible, sitting in the
one place nobody was looking.

## Tests

```bash
npm test
```

The projection is a pure function, which is why the rebuild claim is testable at
all: the same log in, the same rows out, no database and no network in the way.
The suite replays one hackathon in one pass, in three overlapping passes, and in
reverse order, and expects byte identical rows from all three.
