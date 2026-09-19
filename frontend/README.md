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
