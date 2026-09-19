import type { Metadata } from "next";
import { Archivo, Instrument_Serif, JetBrains_Mono } from "next/font/google";

import { Footer, Header } from "./components/chrome";
import "./globals.css";

/**
 * The one editorial borrowing that appears on every page.
 *
 * The interface face is the system stack and is set in CSS, because on Apple
 * hardware that resolves to SF Pro and shipping a lookalike would be a worse
 * version of a font the reader already has. Only the display face is loaded.
 */
const editorial = Instrument_Serif({
  variable: "--font-editorial",
  subsets: ["latin"],
  weight: "400",
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

export const metadata: Metadata = {
  title: {
    default: "StelHacks",
    template: "%s · StelHacks",
  },
  description:
    "Hackathons whose results follow from rules everyone read up front, and whose prizes are paid by a contract rather than a promise.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${editorial.variable} ${technical.variable} ${mono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
