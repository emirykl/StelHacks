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

---

## Still open

- Team structure: maximum size, who sets the in team prize shares, whether one
  person can be in more than one team.
- The remaining constitution pieces: disqualification threshold, appeal window,
  settlement safety window, prize claim period, no award refund route,
  cancellation policy.
- Passkey wallet provider: own implementation or an existing Stellar kit.
- Metadata hosting: object storage or IPFS compatible storage.
