# StelHacks

**An end to end verifiable hackathon platform built on Stellar and Soroban.**

An organizer defines the rules, freezes them on chain and deposits the prize
into a smart contract vault. Participants register, form teams and submit their
projects. Judges score under seal and the eligible community votes under seal.
When the windows close, the contract computes the ranking from the formula that
was frozen before anyone wrote a line of code, and the vault pays the winners
directly. Every step leaves a permanent, public record.

> **No black swans.** The outcome follows from rules that everybody read in
> advance.

The central commitment of the product is narrow and testable: a participant must
be able to answer the question "why did we place fourth?" without asking anyone,
and without trusting the site that published the result.

## Table of contents

1. [The problem](#the-problem)
2. [What the platform does](#what-the-platform-does)
3. [The governing principle](#the-governing-principle)
4. [System architecture](#system-architecture)
5. [The contracts](#the-contracts)
6. [How verification works](#how-verification-works)
7. [Sealed judging and the community vote](#sealed-judging-and-the-community-vote)
8. [Bounded organizer discretion](#bounded-organizer-discretion)
9. [Prizes, settlement and cashing out](#prizes-settlement-and-cashing-out)
10. [Repository layout](#repository-layout)
11. [Requirements](#requirements)
12. [Running the project](#running-the-project)
13. [Configuration](#configuration)
14. [Testing and quality assurance](#testing-and-quality-assurance)
15. [Deployment status](#deployment-status)
16. [Commercial model](#commercial-model)
17. [Project status](#project-status)
18. [Documentation map](#documentation-map)
19. [Licensing](#licensing)

## The problem

Hackathons are not scarce in the Stellar ecosystem. What has been missing is a
hackathon platform that belongs to it. Stellar events run today on general
purpose platforms, which means an ecosystem can commit tens of thousands of
dollars in prizes and receive no lasting on chain record in return: no new
wallets, no transactions, no durable proof of achievement. The prize is spent
and the network gains nothing measurable.

Underneath that strategic gap sit operational problems that every participant
recognizes:

* The existence of the prize cannot be proven before the event begins.
* The method by which a winner was chosen is rarely disclosed, so a jury
  decision reads as a closed box.
* Payment takes weeks, and sometimes never arrives at all.
* Judges can see one another's scores and be influenced by them.
* Community voting is broken by duplicate accounts.
* Disqualification decisions are disputed and their reasoning goes unrecorded.
* Sponsors cannot demonstrate that their money was distributed fairly.
* When the event ends, nothing verifiable remains.

StelHacks addresses each of these by moving the parts that decide an outcome
onto the ledger, and by recording every exercise of authority instead of
removing it.

## What the platform does

A hackathon is a single instance of two contracts that advances through ten
stages. Transitions are time gated and enforced by the contract; the clock shown
in the interface is informational only.

1. **Draft.** The organizer writes the rules. Nothing is binding and everything
   can still change.
2. **Funding.** The prize is deposited into the vault. Registration cannot open
   until the entire prize table is present.
3. **Open.** The event runs. Participants apply, teams form, projects arrive.
4. **Screening.** The organizer clears spam and rule breaches, before a single
   score exists that could be swayed by it.
5. **Judging.** Judges score their assigned projects and eligible wallets cast
   community ballots. Both are sealed, so the crowd never votes with the judging
   table already in front of it.
6. **Reveal.** Every scorecard and every ballot opens at once.
7. **Finalization.** The contract computes the ranking from the locked formula.
   It will not accept a ranking from any other source.
8. **Settlement.** The vault pays the winners, one position at a time.
9. **Completed.** The proof page becomes permanent and nothing can change.
10. **Cancelled.** Reached only under a cancellation policy that was declared
    before the rules were locked.

Four audiences are served from one application: the organizer, the judge, the
participant and the observer. The observer is not an afterthought. Everything a
signed in participant can verify has to be verifiable by somebody with no
account at all, and that requirement shaped most of the design.

## The governing principle

One rule keeps the product honest, and every layer is written to respect it.

> **The chain decides. The database remembers.**

The ledger holds what determines an outcome: the constitution digest, the phase,
the organizer and collaborators, the judging bench, recusals, the prize asset
and amounts, team membership, submission digests and timestamps, sealed roots,
revealed scores, community ballots and tallies, reason digests for every
discretionary act, the final ranking, the tie break step that was applied, and
every payment.

The database holds what a page needs and a ledger has no business storing: names,
descriptions, logos, avatars, biographies, long written feedback, screenshots,
pitch decks, search indexes and analytics.

Two consequences hold at all times, and both are enforced by tests rather than
by convention:

1. **Every table that mirrors chain state can be dropped and rebuilt** by
   replaying events from the earliest available ledger. A row that cannot be
   regenerated was never derived data and does not belong there.
2. **No database key can move money or change a result.** The service role key
   reaches the indexer and the sealed collection service only. Neither holds a
   Stellar signing key carrying any authority in the contracts.

## System architecture

```
                   ┌──────────────────────────────┐
                   │       Web application        │
                   │  Next.js on Vercel, serving  │
                   │  organizer, judge,           │
                   │  participant and observer    │
                   └───────┬──────────────┬───────┘
                           │              │
             writes/reads  │              │  reads
                           ▼              ▼
             ┌─────────────────┐   ┌──────────────────┐
             │  TypeScript SDK │   │     Supabase     │
             │  contract calls │   │  Postgres, Auth, │
             │  digests, proofs│   │  Storage, RLS    │
             └────────┬────────┘   └────────▲─────────┘
                      │                     │
            signs and │                     │ writes derived rows
            submits   │            ┌────────┴─────────┐
                      │            │     Indexer      │
                      │            │ Soroban events → │
                      │            │    Postgres      │
                      ▼            └────────▲─────────┘
       ┌──────────────────────────────┐     │
       │       Stellar / Soroban      │─────┘
       │  HackathonCore + PrizeVault  │  emits events
       └──────────────────────────────┘
```

Alongside the indexer, two further services run continuously. The **sealer**
accepts sealed scorecards and ballots during the judging window and publishes
the digest that commits to them when the window closes. The **clock** sends the
transaction that a passed deadline requires, because a Soroban contract cannot
wake itself.

The technology stack is Rust with the Soroban SDK for the contracts, TypeScript
throughout the client layers, Next.js on the App Router with React for the web
application, Supabase for Postgres, authentication, storage and row level
security, and GitHub Actions for continuous integration with deterministic
contract builds.

## The contracts

Two contracts, deliberately few.

**`hackathon-core`** is the authority. It holds the locked constitution, runs
the lifecycle, records applications, teams, submissions, scorecards and ballots,
computes the ranking, and instructs the vault when to pay. It publishes roughly
ninety entry points, from `create` and `lock_rules` through `submit_project`,
`publish_score_root`, `reveal_ballot` and `finalize_results` to `settle_prize`
and `complete`.

**`prize-vault`** holds the money. It accepts deposits from any address in any
phase and pays out only when the core instance it was bound to at creation says
so. There is no administrator, and no withdrawal function of any kind.

Inside the core, the module layout follows the shape of the problem:

* `constitution/` holds everything that decides an outcome, all of it hashed and
  frozen at the lock.
* `contract.rs` holds every entry point.
* `state.rs` holds what changes while the event runs, kept strictly outside the
  frozen rules.
* `storage.rs` holds typed keys and time to live policy, with no raw symbol keys
  anywhere.
* `merkle.rs` holds the sealed trees for scorecards and ballots, with domain
  separated leaves.
* `results.rs` holds final scores, the tie break chain and placements.
* `hashing.rs` holds every digest, each computed over a domain tagged payload.

Three properties of the contract layer are worth stating explicitly.

**Neither contract has an upgrade path.** There is no administrator and no call
to `update_current_contract_wasm` in either crate, on purpose. A hackathon whose
code could be swapped after the rules were locked would make the lock
decorative. New code therefore reaches new events only: every event deploys its
own pair of instances, and instances already on chain keep running the code they
were deployed with for as long as they exist.

**Scores keep full precision.** Weighted totals are held at the maximum
weighted scale rather than divided down to a percentage, because the division
would otherwise happen twice and each one discards a fraction that can decide a
close result. Only the interface rounds.

**The constitution is versioned.** It currently stands at version six. A
contract compiled against an earlier version refuses a document it does not
recognize, which is what prevents a rule set from being reinterpreted after the
fact.

## How verification works

Verifiability is a chain of concrete, independently checkable claims rather than
a slogan.

**The rules.** The constitution is serialized deterministically and hashed, and
that digest is what the lock stores on chain. A reader can rebuild the document
from the public page, hash it in their own browser and compare it against what
the contract holds. If the two differ, the site is misrepresenting the contract.

**Two implementations, one agreement.** The digests both languages must reach
are committed in `fixtures/`, one value per file. The Rust suite asserts that
the contract still produces them, and the TypeScript suite asserts that the SDK
reaches the same values from inputs written independently. Changing either side
turns one of the two suites red on purpose, and the fixture says which side
moved. Bytes are committed beside digests, so a digest that moved while the
bytes did not means the hashing changed, while moved bytes mean the type itself
changed, which is the event that silently invalidates every constitution already
locked on chain.

**No hand written encodings.** The SDK never writes an XDR layout by hand.
Encoding goes through the contract specification generated from the compiled
wasm, so a field added in Rust arrives in TypeScript without anyone remembering
to mirror it. Event decoding works the same way, which means an event that gains
a field starts returning it with no SDK change.

**The result, rederived.** `rankTrack` in the SDK is a line by line port of the
contract's ranking, integer arithmetic and truncating division included. Given
nothing but chain data it recomputes the published ranking, and
`sdk/examples/verify-result.ts` is the short version of that exercise: it fetches
the rules and proves they are the rules that were locked, reads everything the
ranking was derived from, derives the ranking again and compares. The example is
type checked in continuous integration so that it cannot decay into a snippet
that no longer compiles.

**The proof page.** Every event carries a public receipt at
`/hackathons/[slug]/proof`, readable with no account: the rules and their digest,
the money and where it went, who was responsible, each entry's digest, both
sealed roots and the finished ranking, with every value checkable on a block
explorer.

**Checking on demand, not on load.** The proof strip in the interface never
claims more than it knows. A digest nobody has checked is displayed as unchecked
rather than as a green tick, because a strip that reassures by default is worse
than no strip at all. Pressing the verification control loads the Stellar
library, queries the contract over the reader's own connection and reports what
came back, without touching our servers. The logic is split deliberately:
`lib/verify.ts` asks the questions and `lib/verdict.ts` decides what an answer
permits, with no network access in it at all, because the verdict it reaches is
an accusation and the rules for making one must be testable. Two distinctions
carry that weight, and both have tests: a refusal from the contract is an
answer, while the network never replying is not; and a check that could not be
made leaves a claim unchecked rather than verified, so an outage never becomes
an accusation against an organizer who did nothing wrong.

## Sealed judging and the community vote

Scores and ballots must be invisible until the deadline, and verifiable
immediately afterwards. The platform achieves this without asking the participant
to trust the operator's discretion.

**Time lock encryption.** The browser encrypts each private body for the first
Drand beacon round at or after the judging deadline frozen in the constitution.
The collection service independently derives that round and rejects any envelope
addressed to an earlier one. Until the beacon exists, the database, the organizer
and the service role process all hold ciphertext and nothing else. Row level
security is an additional boundary here, not the secrecy claim.

**What the service cannot do.** It cannot alter an entry, because the judge or
voter signs the plaintext leaf before encryption and the tree commits to that
same leaf. It cannot deny receiving one, because every intake returns a receipt
signed by the service key covering the leaf and the moment it arrived, with the
timestamp inside the signature. It cannot quietly omit one, because a verifying
receipt with no inclusion proof under the published root is proof that the entry
was dropped, and no explanation reconciles the two. An adversarial test in the
sealer suite is a dishonest service being caught this way.

**What remains a trust assumption.** Availability. The service can refuse an
entry or visibly omit one. It cannot inspect scores early and censor selectively
based on their contents. This assumption is stated rather than hidden, which is
the standard the product holds itself to throughout.

**The community ballot is an amount, not a mark.** Each eligible wallet receives
ten points and distributes them across between one and three projects, spending
all of them or none. Backing one's own project is permitted. The reasoning is
recorded in the decision log: asking a voter which single project is best asks
them about projects they never opened, while asking what they thought of the
field is a question they can answer, and a crowd of distributions ranks the
whole table rather than separating only the winner. The bounds live in the
constitution rather than in the interface, because they decide an outcome: an
organizer who could raise the ballot power mid week would be handing influence
to whoever had not yet voted. The electorate is closed by an eligibility
snapshot taken when registration shuts, and each published ballot carries its
whole distribution rather than a total, so a team backing itself is visible to
anybody replaying the log.

## Bounded organizer discretion

StelHacks is a complete product rather than a narrow protocol, so it keeps the
authorities a real organizer needs: screening applications, marking entries
invalid, disqualification, adjusting prizes, declaring that no submission merited
an award. The difference is not that these powers are removed. It is that each
one is announced before the lock, bounded by what was announced, and recorded
with a reason digest when used.

The three tiers are explicit:

* **Always permitted.** Increasing the prize. Nobody is harmed by it, so the
  organizer, a sponsor or a third party may add funds in any phase, and the page
  shows the increase.
* **Permitted only if announced.** Withholding or reducing a track prize because
  no submission qualified. This requires that the track was marked before the
  lock, that participants saw it before writing any code, that the judging
  threshold signs, that the reason is written on chain, and that the appeal
  window elapses. Where the money goes is chosen in advance.
* **Never permitted.** The organizer unilaterally withdrawing or reducing the
  prize after submissions open. Opening that door would end the product's
  argument.

The same discipline applies elsewhere. A deadline extension moves the schedule
in force while the announced schedule stays hashed in the constitution, and it
spends a per deadline allowance that was published in advance. Disqualification
runs from screening through the reveal, requires a reason digest, grants the team
an appeal window, needs a judging threshold to resolve, and holds the ranking
until every open case is resolved. Cancellation is free in draft and funding, and
after that it requires the declared policy and the judging threshold, returning
the pool along the refund route chosen before the lock. A settlement safety
window can be selected at the lock, during which a named threshold may pause
payment with its reason recorded on chain. Scores can never be altered under any
of these paths.

## Prizes, settlement and cashing out

Each hackathon has its own vault. It refuses to publish while underfunded, and
the required amount is the full prize table plus the platform fee if one applies.
Deposits are open to anyone at any time, which is what makes sponsorship
possible: a sponsor can add to a specific place or track, and the frozen document
records the cut so that the winner is paid the figure the page displayed rather
than a figure net of anything.

Settlement pays one position at a time. A team prize is split equally between
members and paid to each wallet directly, so nobody holds anybody else's share.
Unclaimed prizes have a claim period and a refund route that were both defined
before the lock, and the contract will not mark an event complete until the
platform fee has been settled and every position has been resolved.

Payment in a token is only half of a promise, so the final step is an anchor
integration. A winner can hand back what they were paid and withdraw local
currency through a Stellar anchor, using the `SEP-24` hosted flow or the `SEP-6`
programmatic flow, whichever the anchor publishes. Nothing in this repository
holds anybody's money, sees a document or decides who may withdraw. Every
endpoint is read from the anchor's own `stellar.toml`, so pointing the platform
at a different anchor is a change of one domain and nothing else.

## Repository layout

Four layers, and each one owns its directory. Work belongs to the layer that
uses it rather than to whichever directory is convenient.

```
StelHacks/
├── contracts/          Soroban contracts, Rust workspace
│   ├── hackathon-core/ The authority: rules, lifecycle, ranking, settlement
│   └── prize-vault/    The money: deposits from anyone, payouts on instruction
├── backend/            Everything that remembers, nothing that decides
│   ├── supabase/       Schema as ordered migrations, plus role tests over HTTP
│   ├── indexer/        Soroban events into Postgres, holds no signing key
│   ├── sealer/         Sealed scorecards and ballots, and the root over them
│   └── clock/          Sends the call a passed deadline needs
├── frontend/           Next.js App Router application, four surfaces
├── sdk/                TypeScript SDK, shared by backend and frontend
├── fixtures/           Test vectors read by Rust and TypeScript together
├── docs/               Decision log and deployment records
└── StelHacks-PRD.md    Product requirements document, in Turkish
```

The SDK and the fixtures sit outside the three product layers because they
belong to neither. The SDK is consumed by both the services and the browser, so
filing it under one would hide it from the other. The fixtures are read by Rust
tests and TypeScript tests at the same time, which is the entire purpose of them.

Each layer runs its commands from its own directory, so nothing depends on which
directory a command happens to be typed in. The Supabase CLI in particular looks
for `supabase/` beside the working directory and must therefore be run from
`backend/`.

## Requirements

* Rust with the `wasm32v1-none` target, installed through rustup. The toolchain
  is pinned in `contracts/rust-toolchain.toml`.
* Stellar CLI, version 27 or newer.
* Node.js, version 24 or newer.
* A Supabase project for the data layer, and a funded testnet account for the
  services that send transactions.

One environment note is worth recording because it costs time. Homebrew's `rust`
formula shadows rustup and knows only the host target, which breaks every wasm
build. If `which cargo` does not resolve to a path under rustup's shim
directory, that is the cause.

## Running the project

Contracts, from `contracts/`:

```bash
cargo test                                # unit and contract tests
cargo fmt --all                           # before every commit
cargo clippy --all-targets -- -D warnings # continuous integration fails on any warning
stellar contract build                    # wasm artifacts
```

SDK, from `sdk/`:

```bash
npm install
npm test          # digests, merkle, signing, events, ranking, published spec
npm run check     # types, including the examples
npm run bindings  # regenerate the bindings from the compiled wasm
```

The SDK suite reads the compiled wasm, so `stellar contract build` has to have
run first. This is deliberate: the tests measure the SDK against the artifact the
contracts actually produce, including whether the interface it publishes can be
parsed at all.

Database and services, from `backend/`:

```bash
supabase db push                  # apply migrations to the linked project
supabase migration list           # what is applied where
cd supabase/tests && npm test     # what each role can actually reach
npm run dev                       # indexer, sealer and clock together
```

There is no local stack. Migrations go to the linked project and the role tests
run against it over HTTP, creating real users and deleting them again.

Web application, from `frontend/`:

```bash
npm install
npm run dev
npm run test    # the verdict rules, which decide what a check may claim
npm run shoot   # screenshot both colour schemes
npm run build
```

`npm run shoot` exists because of a real defect. A `@theme` block nested inside a
media query is not conditional in Tailwind v4: it registers the same tokens
unconditionally and the last declaration wins. The first version of the design
therefore served the dark palette to everybody in both colour schemes. It type
checked, it built, and only a screenshot could show that it was wrong.

## Configuration

Two environment files, and nothing is shared between them.

`backend/.env.local`, copied from `backend/.env.example`, holds the Supabase
service role key, the network passphrase and RPC endpoint, the sealer key, the
clock key, and the polling intervals for the three services.

`frontend/.env.local`, copied from `frontend/.env.example`, holds only what a
browser may see: the Supabase URL and anonymous key, the network passphrase and
RPC endpoint, the sealer URL, the anchor domain, the enabled authentication
providers and the platform fee collector address.

This separation is structural rather than habitual. Next.js reads the environment
file beside itself and exposes anything prefixed for public use, so a key that is
simply absent from the frontend environment cannot reach a bundle by accident,
whatever it is named. The rule the whole product rests on is that no key in the
data layer can move money or change a result, and one file per side is how that
stops depending on somebody remembering it.

The clock is the one service holding a Stellar key, and it is not an exception to
that rule. The only call it makes is `advance_phase`, which requires no
authorization and is open to the public, so its address is a fee payer rather
than a permission. Anybody with a funded account could send the same transaction
and the contract could not tell the difference.

## Testing and quality assurance

The suites are the argument for the product, so they are described precisely.

* **467 contract tests** across the two Rust crates, all passing. The last
  coverage run with `cargo llvm-cov` reported above ninety seven percent of
  regions and above ninety eight percent of lines across both crates.
* **67 SDK tests** covering digests, Merkle construction and proofs,
  signatures, event decoding, the ranking port and the published contract
  specification.
* **65 service tests** across the indexer, the sealer and the clock, including
  the omission test that catches a dishonest collection service.
* **76 frontend logic tests**, most of them on the verdict rules that decide
  what a verification result is permitted to claim.
* **50 role tests** run over HTTP against the linked Supabase project, proving
  what each role can actually reach rather than what the policies appear to say.

Several classes of test exist because of a specific failure they would have
caught.

The adversarial contract suite drops mocked authorization entirely and fires
unsigned calls at every entry point where a missing signature would be worst,
from freezing the rules to emptying the vault. Every other test in the suite
runs with authorization mocked, which meant that before this file existed no
signature check in the core contract was exercised at all: the suite would have
stayed green with every authorization line deleted.

The lifecycle suite states the phase machine as an invariant rather than as a
sequence, pushing sideways out of each stage into the work of the stages around
it. The conservation tests count both sides of the fund invariant, so the vault
balance always equals deposits minus payouts.

The specification test checks the published interface from outside Rust. This
matters because the Soroban contract specification caps an error enumeration at
fifty cases. Rust neither enforces nor warns about that limit, so exceeding it
produces a contract that runs correctly and an interface that no strict reader
outside Rust can parse, including the official JavaScript SDK. That defect
reached this codebase once and is now caught by a test.

Continuous integration runs formatting, linting and the full test suite for the
contracts and the SDK, plus a reproducible build check that compiles the wasm
twice from clean and compares the hashes.

Beyond the automated suites, several scripts under `frontend/scripts/` drive the
real network rather than a test environment. They generate their own keys and
fund them from friendbot, so any of them can be run again from a clean machine.
One creates an event and walks it to the open phase, one walks a complete
lifecycle from creation to payment with windows a minute wide, and one repeats
that walk with the scorecard going through the collection service, which is the
only way to discover whether the service, the SDK and the contract agree about
what a leaf is and what a signature covers. Each of these found defects that no
build would have failed on, and `docs/deployments.md` records them.

## Deployment status

Both contracts are deployed on testnet, with their addresses, wasm hashes and
upload transactions recorded in `docs/deployments.md`. Those hashes are what
`stellar contract build` produces from a clean checkout, and continuous
integration compiles twice and compares, so a hash that matches is the same
build any reader would obtain. The deployed interface can be read back off the
network with `stellar contract info interface`.

A reference instance stands up from that code, so the upload can be shown to run
rather than merely to exist. It is open, denominated in testnet lumens, funded
across three places with the sponsorship route open, and a contribution was made
against it to prove that path rather than to describe it.

Nothing is deployed to mainnet. That is the final milestone, and it follows a
security review, a dry run and a pilot event run by an organizer who is not us.

One incident from the deployment history is worth carrying forward. An upload
failed outright with the network refusing the transaction and naming no limit.
The wasm had reached 158 KB, of which 93 KB was the published contract
specification, because that specification carries every documentation comment on
every entry point, type, field and error variant. The code itself was 57 KB. The
remedy was not to write less: the first paragraph of each documentation block
stayed documentation and the reasoning below it became an ordinary comment,
which is published nowhere and read by anybody opening the file. Nothing was
deleted, 192 blocks moved, and the binary came back at 112 KB. An interface's
documentation comments are shipped to every validator, and they are the part of
this contract most likely to run out of room first.

## Commercial model

The platform is offered in three tiers, and the mechanism matters as much as the
prices.

* **Community.** No deduction. Student and community events, roughly under five
  thousand dollars in prizes. The threshold is an internal guideline applied when
  an organizer application is approved rather than a rule in the contract, which
  is what keeps exchange rate drift and threshold gaming out of the product
  entirely.
* **Standard.** Five percent of the prize, charged **on top of** the prize
  rather than deducted from it. An organizer running a ten thousand unit prize
  deposits ten thousand five hundred, and the winners receive the full advertised
  amount.
* **Annual.** A fixed annual fee with no deduction, for organizations running
  several events a year.

Because the prize moves through `prize-vault`, the fee can be collected by the
contract itself, which is the one thing general purpose competitor platforms
cannot do. The rate is frozen into the constitution at creation, so a later
change to the published rate cannot touch an event that is already locked, and
creation is refused outright when a rate above zero has no collector address
configured rather than quietly falling back to a free event. An upper bound
guards against a typographical error, and a cancellation returns the fee to the
organizer along with the pool.

The contracts and the SDK remain usable without the hosted service.

## Project status

The contract layer, the SDK, the data layer and all three long lived services are
complete. A hackathon currently runs end to end: created, configured, locked,
funded, published, applied to, approved, teamed, entered, screened, judged under
seal, voted on under seal, revealed, ranked, paid, and closed, with the vault
emptying exactly when it closes.

The web application covers all ten of its intended surfaces across eighteen page
routes and ten API routes: the shell and identity, the organizer setup wizard,
the hackathon page, the participant flow, the judge console, the community vote,
the reveal, the transparency page, builder profiles and the observer view.

What remains is the proving work rather than the building work: a full internal
dry run of the demonstration scenario on testnet, the cross cutting milestone
covering a complete Turkish and English interface, an accessibility baseline,
performance budgets, observability and the operator guides, followed by a pilot
event and the mainnet deployment.

Work that was consciously postponed is recorded rather than forgotten. The
strict judging mode, in which judges commit and reveal on chain themselves, is
modelled, validated and hashed but has no entry point yet; the sealed mode is
the default and the strict mode becomes necessary only for an event whose prize
makes the collection service's availability assumption unacceptable. Proportional
refunds to depositors are refused by validation rather than promised, because the
vault does not record who deposited what. A deposit larger than the prize table
currently has no route out, which is proved by a test named for exactly that.
Judge quorum is enforced by excluding short projects from the ranking, while the
fallback policy for a missing judge is still unwritten. Each of these carries a
note saying what is missing and what it blocks.

## Documentation map

* `README.md`, this document: what the project is and how to work with it.
* `CLAUDE.md`: working conventions, commands and architecture, loaded
  automatically by agent tooling.
* `StelHacks-PRD.md`: the product requirements document, in Turkish.
* `docs/decisions.md`: the decision log. Twenty five entries recording where the
  implementation departs from the requirements document and why. Where the code
  and the requirements document disagree, this file governs.
* `docs/deployments.md`: addresses, wasm hashes, the reference instance, and what
  walking a whole event on a real network caught.
* `backend/README.md`, `frontend/README.md`, `sdk/README.md`,
  `fixtures/README.md`, and one per service: each layer documents itself.

Three conventions run through the codebase and explain most of what a reader
would otherwise find surprising. Tests read as sentences, so a test is named for
the property it defends rather than for the function it calls. Comments explain
the reasoning rather than the mechanics, because the code already states what it
does. And nothing is written before it has a caller, so storage accessors,
helpers and enumeration variants land in the same commit as the code that uses
them.

## Licensing

The SDK package declares Apache 2.0. The repository as a whole does not yet
carry a license file, and one will be added before any public release.
