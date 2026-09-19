import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";

import "./globals.css";

/**
 * The one editorial borrowing that appears on every page.
 *
 * The interface face is the system stack and is set in CSS, because on Apple
 * hardware that resolves to SF Pro and shipping a lookalike would be a worse
 * version of a font the reader already has. Only the display face is loaded.
 */
const display = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
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
    <html lang="en" className={`${display.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-paper text-ink">{children}</body>
    </html>
  );
}
