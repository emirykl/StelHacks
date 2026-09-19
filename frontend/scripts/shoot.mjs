/**
 * Look at the pages.
 *
 * Design work is not finished when it type checks. This exists because the
 * first version of the home page served the dark palette to everybody: a
 * `@theme` block nested in a media query is not conditional in Tailwind v4, and
 * nothing but a screenshot was ever going to say so.
 *
 *   npm run dev            # in one terminal
 *   npm run shoot          # in another
 */

import { chromium } from "playwright";

const pages = [
  ["home", "/"],
  ["hackathons", "/hackathons"],
  ["how-it-works", "/how-it-works"],
  ["hackathon", "/hackathons/first-light"],
  ["account", "/account"],
  ["create", "/create"],
];

const browser = await chromium.launch();

for (const scheme of ["light", "dark"]) {
  for (const [name, path] of pages) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
    });

    await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `/tmp/shots/${name}-${scheme}.png`, fullPage: true });
    await page.close();
  }
}

console.log("shot", pages.length * 2, "pages");
await browser.close();
