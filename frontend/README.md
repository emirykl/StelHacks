# Frontend

Next.js on the App Router. Four surfaces off one codebase: organizer, judge,
participant and observer.

The observer is not an afterthought and is the reason for most of the design
work, because everything a signed in participant can verify has to be verifiable
by somebody with no account at all.

```bash
npm run dev
npm run test    # the verdict rules, which decide what a check is allowed to claim
npm run shoot   # screenshot both colour schemes, in another terminal
npm run build
```

## The design system

Three traditions meet here, and rather than blend them the system gives each one
a job. The jobs are not decorative: they follow the distinction the whole
product is built on, which is that the chain decides and everything else merely
remembers.

**Apple's Human Interface Guidelines supply the system.** The four point
spacing scale, the type hierarchy, the restraint. Neutral surfaces, one accent,
hairline rules, motion you notice only when it is missing. Ninety percent of any
screen is this, and it is what makes an interface feel calm. The interface face
is the system stack, which on Apple hardware resolves to SF Pro; shipping a
lookalike would be a worse version of a font the reader already has.

**The editorial tradition behind stellar.org supplies the accent.** Named
precisely: Swiss typographic layout with a high contrast serif for display type,
a halftone dot field for texture, and risograph spot illustration. Used at three
points and no more.

**Technical brutalism supplies the chain's voice.** Condensed capitals,
monospaced labels, bracketed indices, hairline spec rows, square corners,
diagonal hatch, tabular figures. A digest, an address, a phase, a ranking, a
payment: anywhere the chain is speaking.

**So the typeface is the argument.** Serif means a person said this. Mono and
condensed capitals mean the chain did, and you can go and check. A reader can
tell which half of a page they are in without reading a word, and an interface
that mixed the two would be making a claim it could not support.

**The rule is one voice per surface, and never two loud at once.** Riso texture
and Apple calm are opposites; an interface that shouts in both loses the
character of each. The halftone sits at an opacity where you would not name it
if asked, and that is the intended dose.

**One accent colour, and it means one thing: the chain is speaking.** Proof
strips, verified digests, settled payments. Spending it on ordinary buttons
would make the one place it matters unremarkable.

Everything is in `app/globals.css` as tokens, with the reasoning beside each
group.

## The proof strip

`app/components/proof-strip.tsx` is the product in one component, and the only
surface that inverts. What it must never do is claim more than it knows: a
digest nobody has checked shows as unchecked rather than as a green tick,
because a strip that reassures by default is worse than no strip at all. State
is carried by shape as well as colour, so somebody who cannot separate the two
still gets the answer.

## Checking, and who does it

Every fact on a hackathon page arrives through our indexer and our database, and
a reader has no reason to take either on faith. Pressing **Check this yourself**
loads the Stellar library, asks the contract three questions over the reader's
own connection, and reports what came back. Nothing in that path touches our
servers, which is the only arrangement under which the answer means anything.

It does not run on load. A page that verified itself would be making the claim
it exists to let somebody else make, and the strip would go green for reasons
the reader never saw.

The split matters more than it looks. `lib/verify.ts` asks; `lib/verdict.ts`
decides, and has no network in it. What it decides is an accusation — `does not
match` on a rules digest says this site is misrepresenting a contract — so the
rules for making one are testable without a testnet. Two distinctions carry the
weight, and both are in `lib/verdict.test.ts`:

- **A refusal is not silence.** The contract declining to name a vault is an
  answer. The network never replying is not.
- **Not knowing is not finding nothing wrong.** A check that could not be made
  leaves a claim unchecked, never verified. Otherwise every RPC outage becomes
  an accusation against an organizer who did nothing.

When a check fails, the strip prints what the contract actually said beside what
the page said. An alarm a reader cannot act on is not worth raising.

## What running it taught us

The Stellar library the browser loads is version 17, and the SDK under `sdk/` is
on 14. That is deliberate rather than neglect: the two never share code, and
what keeps them agreeing about digests is `fixtures/`, not a version number.
Version 17 changed how XDR values are represented — the old `retval.switch()`
union is now a plain object — and the first version of the checker decoded them
the old way, silently returning `unchecked` for every claim it could not read.

The first version of the design served the dark palette to everybody, in both
colour schemes.
A `@theme` block nested inside a media query is not conditional in Tailwind v4:
it registers the same tokens unconditionally and the last one written wins. It
type checked, it built, and it was wrong in a way only a screenshot could show.
`npm run shoot` exists because of it.

## Not built yet

## Identity, and the two layers of it

Google says who somebody is. A wallet says what they hold. They are separate on
purpose and `/account` shows them as two sections rather than one: a Google
account with no address attached can read every page and do nothing on chain,
and an address with no Google account behind it still wins prizes perfectly
well. Neither is a login for the other.

Sessions are cookies, through `@supabase/ssr`, so a server component renders the
signed in state rather than flashing signed out and correcting itself. Reads go
through `lib/supabase/server.ts`, which calls `getUser` and not `getSession`: a
session is read out of a cookie and a cookie is whatever the browser sent, while
`getUser` asks the auth server whether the token is real. On a product that will
decide who may run a hackathon, that is the difference that matters.

The wallet half stops at connecting. Connecting tells the page an address and
proves nothing; the proof is a signature over a server issued challenge, and
`wallet_challenges` and `wallet_links` have been in the schema waiting for it
since M12. Writing that link needs the service role, so where the verifier runs
is still undecided.

The surfaces that ask somebody to do something. The home page, the listing, the
hackathon page and `/how-it-works` are the read only half and are here; the
organizer wizard, judge console and participant flow are the half that writes,
and every one of them needs a wallet to sign with. Which wallet is still an open
decision in `docs/decisions.md`, so they wait on it rather than being built
against a guess.

`/how-it-works` is the canonical description of the lifecycle, taken from
`phase.rs` rather than written alongside it. When those three surfaces are
built, they implement what that page already says.

The check currently covers the four claims on the strip; the ranking, the
scorecard proofs and the payments are the next things a reader should be able to
confirm the same way. Google sign in needs OAuth credentials, which are tracked
in the roadmap's deferred table.
