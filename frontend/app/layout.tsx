import type { Metadata } from "next";
import { Archivo, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";

import { Footer, Header } from "./components/chrome";
import { NetworkNotice } from "./components/network-notice";
import { WalletProvider } from "./components/wallet-context";
import "./globals.css";

/**
 * The display face, which is every heading on every page.
 *
 * The interface face is the system stack and is set in CSS, because on Apple
 * hardware that resolves to SF Pro and shipping a lookalike would be a worse
 * version of a font the reader already has. Only the display face is loaded.
 *
 * A high contrast serif sat here first and it read as a newspaper: correct for
 * an essay, wrong for a place people come to build something over a weekend.
 * Bricolage is a display grotesque with the cuts left slightly uneven, so a
 * headline has a voice without having a collar. Both non weight axes are
 * loaded: `opsz` so a large heading tightens the way a display cut should,
 * `wdth` so a long name can be pulled in rather than wrapped.
 */
const display = Bricolage_Grotesque({
  variable: "--font-display-loaded",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  display: "swap",
});

/**
 * The technical face, for anything the chain is saying.
 *
 * Condensed grotesque, set in capitals and tracked tight. It carries the same
 * information a spec sheet carries and should look like one: a ranking, a
 * phase, a prize table. The width axis is pulled in because a condensed
 * headline reads as a specification and an ordinary one reads as an
 * announcement.
 */
const technical = Archivo({
  variable: "--font-technical",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

/**
 * Labels, digests, addresses and amounts.
 *
 * A loaded mono rather than the system stack, because SF Mono does not exist
 * off Apple hardware and a digest that reads in one font on a Mac and another
 * on Windows is a digest two people cannot compare over a call.
 */
const mono = JetBrains_Mono({
  variable: "--font-mono-loaded",
  subsets: ["latin"],
  display: "swap",
});

/* So the browser's own furniture agrees: scrollbars, form controls and the
   space beyond the page are drawn light rather than following the system into
   dark and framing a white document in black. */
export const viewport = { colorScheme: "light" as const };

/*
  One title, on every page.

  There was a template here and each page filled it in, so the tab read
  "Account · StelHacks" in one place and "Judging · StelHacks" in another. With
  several tabs open that is several different names for the same site and none
  of them is the one somebody is looking for. The product is what the tab is
  for; which room of it they are standing in is on the page in front of them.

  Kept by not setting a title anywhere else. A page that exports one overrides
  this, so the rule lives in the absence of those exports rather than in
  anything this object can enforce.
*/
export const metadata: Metadata = {
  title: "StelHacks",
  description:
    "The prize is in a contract before registration opens, the rules are frozen, and you can check the result yourself.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${technical.variable} ${mono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        {/* Wraps everything, because the header and the account page both ask
            which wallet is connected and they are on opposite sides of this
            tree. Two copies of that answer could disagree, and a header naming
            a different key from the one about to sign is the worst version of
            being wrong. */}
        <WalletProvider>
          <Header />
          {/* Under the bar rather than over the page. It only appears when the
              wallet and this deployment disagree about which network they are
              on, which is a setting rather than an error, so it sits in the
              furniture and lets somebody carry on reading. */}
          <NetworkNotice />
          {children}
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
