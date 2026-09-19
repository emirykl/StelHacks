# Decision log

Decisions taken while building that change or extend the PRD. The PRD stays as
written; this file is what actually governs the code where the two differ.

Each entry says what was decided and why, because the reasoning is the part that
gets lost.

---

## 1. The community vote runs sealed inside the judging window

**PRD said** the community vote is a phase of its own, after the judge scores
are revealed.

**We decided** it is a timed window inside the judging phase, opened by a UTC
timestamp the organizer sets before the lock, usually right after the
presentations. Scorecards and ballots are revealed together.

**Why.** Voting after the judge scores are public turns the community share into
an echo of the judges rather than an independent signal. It also invites
tactical voting, because a team can read exactly how many votes they need to
overtake the leader. The whole sealing apparatus built for judges was pointless
if the crowd votes with the judge table in front of it.

**Side effect.** The reveal is now a single event covering both, which makes the
signature interaction stronger rather than weaker.

## 2. The community share has no ceiling

**Decided.** The organizer picks any split from zero to one hundred percent for
the community.

**Why.** An earlier version capped it at sixty percent so judges always kept a
decisive share. That cap was removed on request. Every hackathon admits its
participants by application, so the crowd casting those ballots was let in one
approval at a time, which is where the Sybil barrier actually sits.

**Consequence.** A judge share of zero is reachable, so the per project judge
quorum no longer blocks finalization when scorecards carry no weight. Judges in
that setup still score for written feedback and still hold their say over
disqualifications.

## 3. Registration is always by application

**PRD said** the organizer chooses between open registration and approved
registration.

**We decided** there is only one path: apply, get approved, take part. The
`RegistrationGate` option and the rule that tied a heavy community share to
approved registration were both removed, because a rule that is satisfied in
every possible configuration is dead code.

## 4. Collaborators review applications, and nothing else

**Decided.** The organizer can add helpers to the organizing team. Their reach
stops at approving and rejecting registration applications. Funding, rule
locking, screening, disqualification and settlement stay with the organizer.

**Why.** The collaborator list has to be able to grow in the middle of a running
hackathon, when applications pile up and one person cannot read them all.
Anything touching the prize or the ranking would be unsafe to hang off a list
that grows under time pressure.

**Note.** Removing a collaborator does not undo the applications they already
decided, and the record of who reviewed what is kept.

## 5. Project visibility has three levels

**Decided.** `Public`, `Participants`, `Restricted`.

**Why three rather than two.** A community vote asks participants to judge work
they have to be able to open, so a closed event still needs a level where
participants can read the gallery while outsiders cannot. `Restricted` and a
community vote are checked against each other at lock time and rejected
together.

**What this is not.** It is an access rule on the platform's own API, not a
privacy guarantee. The submission hash, timestamp and track stay readable by
anyone in every setting. A private hackathon still produces a receipt a stranger
can verify; they simply cannot read what the projects were.

## 6. Deadlines move forward only, within an announced allowance

**Decided.** A closing deadline can be pushed back, never pulled in, and never
after it has already passed. How many times and by how much is declared before
the lock. Opening timestamps cannot move at all.

**Why.** Extensions are a real operational need. Reopening a deadline that has
passed is not, because by then the organizer has seen what came in and can
decide who benefits. Moving an opening moment changes who could take part rather
than how long they had.

**Mechanically.** The constitution locks the announced schedule and the
extension allowance. Extensions live in mutable state, so the constitution hash
never changes. The transparency page shows the announced schedule, the effective
one, and every extension with its reason.

## 7. Vote secrecy: sealed tally, public ballots

**Decided.** Ballots are signed off chain, collected during the sealed window,
and committed as a Merkle root when the window closes. At the reveal the leaves
are published and anyone can recount.

**Why not commit and reveal.** The PRD already identified the judge who forgets
to reveal as a problem. Judges are five people and motivated; voters are
hundreds and are not. Half the ballots would be lost.

**Why not anonymous ballots.** Zero knowledge voting on Stellar is buildable,
but it breaks the self vote check, and a proof only a handful of people can
audit turns a verifiable claim into a trust me claim. It belongs in a later
version, if at all.

**Trust assumption.** The same one the judge easy mode carries: the backend
builds the tree and could in theory leave a ballot out. Countered by a signed
receipt, an immediate inclusion proof and the appeal window.

## 8. Builder profiles are derived, not declared

**Decided.** A profile splits in two. The identity fields a user writes, meaning
username, bio, GitHub and LinkedIn, are ordinary off chain rows. The record
itself, meaning which hackathons they joined, where they placed and what they
earned, is read back out of chain events by the indexer.

**Why.** It makes the achievement part unforgeable without putting anything
extra on chain, and it turns the portable builder record the PRD parked in V2
into something that falls out of the existing events for free. The Stellar
address is the key that joins the two halves.

---

## 9. Supabase is the data layer, and it is never the authority

**Decided.** Postgres, Auth, Storage and row level security come from Supabase,
provisioned through the Vercel Marketplace so environment variables and billing
land in the project rather than being hand wired. Google sign in runs through
Supabase Auth, which is what the PRD's identity layer already called for.

**The rule that comes with it.** Every table mirroring chain state must be
droppable and rebuildable by replaying events from ledger zero, and there is a
test for exactly that. No Supabase key may move money or change a result.

**Where it does carry trust.** Signed scorecards and ballots sit in Supabase
during the sealed window, before their Merkle root is published. That is the
same assumption the judge easy mode already accepted, countered the same way:
signed receipt, immediate inclusion proof, appeal window. Row level security has
to make those tables unreadable by every client role including the organizer's,
and that has its own adversarial test.

## 10. Registration is by application, with a snapshot that fixes the electorate

**Decided.** Every hackathon admits participants by application. Approval after
the registration deadline is legitimate and lets the person take part, but it
carries no vote.

**Why.** Clearing a backlog late is ordinary organiser work. Admitting an
electorate once you already know what it would decide is not, and the two look
identical without this rule.

## 11. Team size and multi team membership are the organizer's to set

**Decided.** `TeamPolicy` carries a maximum size, capped at ten, and a flag for
whether one person may join more than one team. Both are locked with the rules.

**Why ten.** Past that a hackathon team stops being a team and starts being a
company with an unfair head start. Fixing the ceiling means the judgement is
made once rather than argued at every event.

## 12. The prize goes to the captain, and there are no on chain shares

**Superseded by decision 21.** Left here because the reasoning still explains
why configurable shares were refused, which decision 21 keeps refusing.

**Decided.** The whole prize is paid to the team captain, who settles up with
their team off the platform.

**Why.** It keeps the contract out of arguments it cannot resolve and removes a
whole class of failure where shares do not add up at the deadline.

**What it costs.** A teammate the captain does not pay has no recourse on chain,
and the proof page cannot show the last hop of the money. Members are still
recorded, so the receipt shows who built the project.

## 13. The judging mode names the address that seals the scorecards

**Decided.** `JudgingMode::Easy(Address)` carries the sealer. `Strict` carries
nobody, because in that mode the judges commit for themselves.

**Why.** That address is the one piece of trust the design does not remove.
Hiding it would be dishonest, and naming it in the locked rules means a
participant reads who holds it before they start building.

## 14. Sealed reveals need no signature

**Decided.** `reveal_score` and `reveal_ballot` ask for no authorization. So do
`publish`, `advance_phase` and `settle_prize`.

**Why.** In the reveals, the inclusion proof is the authorization: an entry that
does not sit under the published root is refused, and one that does was written
by whoever it names before the window closed. In the others, the condition is
already settled on chain. Making any of them an organizer privilege would only
grant the power to sit on a funded hackathon or an earned prize.

## 15. Prizes are paid one position at a time

**Decided.** `settle_prize(track, rank)` pays a single winner.

**Why.** A Stellar account with no trustline for the prize asset cannot receive
it. One call paying everyone would let a single unprepared captain block every
other winner's money; paid separately, they block only themselves.

## 16. Proportional refunds to sponsors are refused rather than promised

**Decided.** `RefundRoute::Depositors` fails validation.

**Why.** The vault does not remember who deposited what, so the route cannot be
walked. Accepting the setting and quietly not honouring it would be worse than
not offering it. Recorded in the roadmap's deferred table.

## 17. An extension moves the schedule in force, never the announced one

**Decided.** `extend_deadline` writes to the schedule held in `HackathonState`.
The schedule inside the constitution stays exactly as it was hashed at the lock,
and the allowance is spent per deadline rather than from one shared budget.

**Why.** If an extension rewrote the locked rules, an hour granted after an
outage would change the constitution digest, and a legitimate announced
extension would be indistinguishable from tampering. Keeping the two apart means
a reader can hold both and see the difference as a list of recorded moves. The
budget is per deadline because that is how it is announced; one shared counter
would let a slipping submission window silently consume the room the judges were
promised.

**Consequence.** Two schedules exist and every reader has to know which one they
are looking at. The contract answers the question directly: `constitution()`
carries what was announced, `state()` carries what is in force.

## 18. Disqualification runs from screening to the reveal, and holds the ranking

**PRD said** disqualification is initiated in the screening phase, and no
disqualification is possible after the result is final.

**We decided** a case can be opened from screening through the reveal, and
`finalize_results` refuses while any case is still unresolved. An entry with an
open case cannot also be ruled out by screening.

**Why.** The PRD's timing rule only fixes the far end. The near end matters just
as much: an organizer who finds plagiarism during screening would otherwise have
to choose between waiting for the round to close and reaching for
`invalidate_submission`, which is the route that gives the team no window to
answer and asks no judge to agree. Making the heavier process available
throughout means the lighter one is never the only option for a contested call.

Holding the ranking closes the other end of the same problem. Ranking around an
entry whose standing is undecided would settle it by timing rather than by the
process, and there is no way back once the result is final. Blocking screening
while a case runs keeps one entry under one process, so the lighter route cannot
land first and leave the heavier one holding a verdict it can no longer apply.

**Consequence.** A case opened late in the reveal holds finalization for the
length of the appeal window. That delay is the announced cost of the process.

## 19. Cancellation is free until submissions open and closed once the ranking does

**PRD said** cancellation is unrestricted in draft and funding, and bound to the
declared policy once submission has opened.

**We decided** that, plus a far end the PRD left open: cancellation is refused
from finalization onward. `cancel` is the organizer alone in draft and funding;
`open_cancellation`, `approve_cancellation` and `resolve_cancellation` carry the
judge threshold from the open phase through the reveal; after that there is no
route at all.

**Why.** The moment `finalize_results` runs there are winners with a claim on
the pool. Cancelling then would take money from the people who won it and hand
it back to the organizer, which is the exact outcome the settlement path exists
to make impossible. Everything before that point costs teams their time, which
is why the judges sign; nothing before that point costs anyone their prize,
which is why the pool can still be returned in full.

**Consequence.** An organizer who wants out after the ranking has to use the no
award clause track by track, which they can only reach on tracks marked for it
before the lock. That is the intended asymmetry.

## 20. The error enum fits the fifty case cap, and validation errors pay for it

**Decided.** `Error` went from 104 cases to 48, two under the cap. Every constitution validation
failure now returns `ConstitutionInvalid`, and the SDK is what tells an
organizer which field. Errors that depend on chain state kept their own codes.
The four submission requirement errors left the contract entirely, along with
`SubmissionMetadata::validate`, and now live in the SDK as
`validateSubmission`.

**Why.** The contract spec caps an error enum at fifty cases, in
`Stellar-contract-spec.x` as `cases<50>`. Rust neither enforces it nor warns,
so the contract compiled, deployed and ran perfectly well at 104 while
publishing an interface that no strict XDR reader could parse. The official
JavaScript SDK is one: `new Client(...)` threw before it could be used, which
meant the contract was uncallable from a browser and unreadable by any wallet
or explorer. It was found the first time the SDK tried to load the bindings,
which is the first time anything outside Rust had looked at the interface.

Given a budget of fifty, the question is what a code is for. A caller already
knows which entry point they called and what they passed it, so the code only
has to say what went wrong that they could not have known. Fifteen codes
distinguishing "the weights do not add up" from "the appeal window is zero"
were spending the budget to tell a client something it was already holding: the
SDK validates the document field by field before it is ever signed. Whether a
deadline has passed or a prize was already paid cannot be known from the
request, so those kept their codes.

`SubmissionMetadata::validate` had a further problem: nothing on chain called
it. The metadata never reaches the contract, only its digest does, so the check
was validating something the contract cannot see. In the SDK it runs where the
metadata actually is and returns every missing field rather than only the
first.

**Consequence.** Every error code was renumbered, which the previous numbering
comment was written to avoid. It was the last moment that was cheap: nothing
was in production, and the only deployment was an uninitialized reference
instance. From here a value is never reused for a different meaning.

## 21. A prize is split equally and every member is paid directly

**Supersedes decision 12.**

**Decided.** A prize is divided equally between everybody on the team and the
contract pays each of them. `settle_prize(track, rank, member)` moves one
member's share. The captain takes the same share as anybody else; being captain
means being able to admit people and nothing about the money. There are still
no configurable shares.

**Why.** Decision 12 named its own cost and then accepted it: a teammate the
captain does not pay has no recourse on chain, and the proof page stops at the
captain's address rather than showing where the money actually went. For a
product whose entire claim is that the result is verifiable end to end, ending
the trail one hop early is the wrong place to stop.

What made that cost look unavoidable was the fear of shares that do not add up
at the deadline. Equal shares remove it by construction: they always add up, and
there is no configuration for a team to get wrong. So the recourse is gained
without the failure mode coming back, which is why this reverses the outcome of
decision 12 while keeping its reasoning about configurable shares intact.

**One member at a time, and that is forced rather than chosen.** A Stellar
account holding no trustline for the prize asset cannot receive it, and the
transfer that fails takes the whole transaction with it. Paying a team in one
call would let a single unprepared member freeze their teammates' money exactly
as an unprepared winner used to freeze the other positions, which is the
failure decision 15 exists to prevent. The same reasoning now applies inside a
team as well as across positions.

**The remainder is spread, not kept.** A prize that does not divide evenly
leaves fewer units than there are members, and those go to the earliest members
one each. No two members differ by more than one unit, and the vault empties
exactly. Keeping the remainder back would strand money nobody could reach and
leave a total that does not add up on the proof page.

**Consequence.** `sweep_unclaimed` now only returns a position nobody won;
`sweep_share` returns one member's unclaimed share. A position closes when its
last share has gone, so `complete` refuses while any single member is still
owed rather than only while a position is.

## 22. The durable log is `chain_events` and `chain_reads`, not the chain

**The rule said** every derived table must be droppable and rebuildable by
replaying events from ledger zero.

**Decided.** It is rebuildable by replaying `chain_events` and `chain_reads`,
both of which the indexer fills from public chain data and neither of which any
client can write.

**Why the rule needed amending.** Three things a page needs are in no event at
all. `visibility` and `prize_asset` live in the constitution and `RulesLocked`
carries only its digest. A submission's `uri` is absent from `ProjectSubmitted`,
which carries the digest and the track. And the ranking is absent from
`TrackRanked`, which says how many projects were placed rather than which. All
three are readable from contract state, so the authority rule itself is intact:
nothing asks anybody to trust Postgres over the chain.

What is not intact is availability. Soroban entries carry a time to live, and a
finished hackathon is one nobody writes to, so its state expires. A rebuild that
called `ranking(track)` would work today and fail in a year, which is precisely
when somebody would be checking an old result. The alternative was to put every
missing field into the events, and that means paying ledger rent forever to
duplicate what is already readable, on every hackathon, against the chance that
one of them is audited late.

**So the read happens once, at ingest, while the state is live,** and the answer
is recorded in `chain_reads` beside the event that prompted it. From then on the
rebuild runs from Postgres alone.

**What this costs.** The indexer is no longer a pure function of the event
stream: it makes contract calls, and a call that fails at ingest is a gap that
has to be retried rather than a row that is merely late. `chain_reads` also
becomes as load bearing as `chain_events`, and losing either means losing the
ability to rebuild. Both are append only for that reason.

---

## 23. Everybody brings a wallet, and there is no passkey path

**The PRD said** identity is Google and signing is Stellar, with two ways to
arrive at an address: connect an existing wallet through Stellar Wallets Kit,
or, for somebody who has none, get a passkey smart wallet created for them in
under thirty seconds (FR-02).

**Decided.** Only the first way. Connect a wallet, or go and open one. There is
no passkey path and no wallet created on anybody's behalf.

**Why.** A passkey wallet on Soroban is not a key, it is a deployment. Every
user needs their own account contract with a `__check_auth` that verifies a
secp256r1 signature, and because that user has no XLM, every action they take
needs a relayer to sponsor the fee. That is a per user contract, an always on
service this project does not otherwise have, and an unaudited dependency
sitting directly in the path of prize money: `stellar/passkey-kit` is
maintained by the Foundation and still says in its own README that the smart
wallet contract, the SDKs and the relayer proxy have had no third party audit.

Against that, the thing it buys is narrower than it looks. Judges never
transact: `reveal_score` takes a merkle proof rather than a judge's
authorization, so a scorecard is signed off chain and revealed by anybody.
Community ballots work the same way. Winners never transact either, because
`settle_prize` is not gated on the recipient. The only calls that need a
signature from an ordinary participant are `apply`, `create_team` and
`submit_project`. Building a wallet system for three calls is the wrong shape.

**What this costs, and it is not nothing.** Section 2.1 is the strongest
argument in the PRD: Stellar spends prize money on events that leave no trace,
"ne yeni cüzdan, ne transaction". Passkey onboarding was the direct answer to
the first half of that. Without it a hackathon here still produces transactions
and a permanent record, but it does not produce new wallets, and a student who
has to install an extension before applying is a student who sometimes does not
apply. That is a real loss and it is being accepted knowingly rather than
overlooked.

**What was weighed and put aside.** Soroban separates the address that
authorizes a call from the account that pays for it, which suggested a third
route: any keypair signs the authorization entry, we submit and pay. It would
have removed the fee problem without any of the passkey machinery. It was not
pursued because it solves the cost of having a wallet, not the absence of one,
and the decision above is that having one is the participant's part of the
deal. It is worth revisiting if fees ever turn out to be what stops people.

**So the wallet layer is Stellar Wallets Kit, and only that.** The kit is not a
wallet; it is the one connect surface behind which Freighter, xBull, Albedo,
Lobstr, Hana and hardware wallets all sit.

Four modules are named one by one rather than taken through the kit's
`allowAllModules` helper. That helper pulls WalletConnect, Reown, Ledger,
Trezor and the Coinbase SDK into the browser, which is a great deal of code and
several open advisories for wallets nobody has asked for. Named individually
and loaded on demand, the whole wallet layer measures about three hundred
kilobytes and a visitor who never presses connect never fetches any of it.

The kit draws its own modal, in Preact, and it does not look like the rest of
this product. That is the price of not writing four wallet adapters ourselves,
and it is accepted for now; the kit takes a theme, so it can be brought closer
later without changing anything above it. Binding to a profile goes through
`wallet_challenges` and `wallet_links`, which already exist: a challenge is
issued to one person for one address, signed, and verified server side. No
client ever writes a link.

---

## Still open

- Team structure: maximum size, who sets the in team prize shares, whether one
  person can be in more than one team.
- The remaining constitution pieces: disqualification threshold, appeal window,
  settlement safety window, prize claim period, no award refund route,
  cancellation policy.
- Metadata hosting: object storage or IPFS compatible storage.
