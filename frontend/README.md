# Frontend

Next.js on the App Router. Four surfaces off one codebase: organizer, judge,
participant and observer.

The observer is not an afterthought and is the reason for most of the design
work, because everything a signed in participant can verify has to be verifiable
by somebody with no account at all.

```bash
npm run dev
npm run shoot   # screenshot both colour schemes, in another terminal
npm run build
```

## The design system

Two traditions meet here and they do not mix evenly, so the split is written
down rather than left to taste.

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

**The rule is that they are never both loud at once.** Riso texture and Apple
calm are opposites; an interface that shouts in both loses the character of
each. The halftone sits at an opacity where you would not name it if asked, and
that is the intended dose.

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

## What running it taught us

The first version served the dark palette to everybody, in both colour schemes.
A `@theme` block nested inside a media query is not conditional in Tailwind v4:
it registers the same tokens unconditionally and the last one written wins. It
type checked, it built, and it was wrong in a way only a screenshot could show.
`npm run shoot` exists because of it.

## Not built yet

The surfaces themselves. The home page is here as the reference for the system;
the organizer wizard, judge console, participant flow and transparency page
follow. Google sign in needs OAuth credentials, which are tracked in the
roadmap's deferred table.
