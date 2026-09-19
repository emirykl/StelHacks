# Frontend

The web application. Not built yet; it lands in M15.

Four surfaces off one codebase: organizer, judge, participant and observer. The
observer is not an afterthought and is the reason for most of the design work,
because everything a signed in participant can verify has to be verifiable by
somebody with no account at all.

## What it will be

Next.js on the App Router, deployed on Vercel.

It reads two sources and keeps them clearly apart. The chain, through
`@stelhacks/sdk`, decides everything: the locked rules, the sealed roots, the
ranking, every payment. Supabase supplies the text and images around that: names,
descriptions, logos, written feedback. The proof strip, the reveal and the
transparency page are built from chain data alone, which is what lets them mean
anything.

## Why it is last

Every screen depends on the layer below it for its data, and a screen built
against a shape that later changes is work done twice. The contracts, the SDK
and the schema come first for that reason, not because the interface matters
less.
