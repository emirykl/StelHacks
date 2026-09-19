/**
 * Look at the page.
 *
 * Design work is not finished when it type checks. This exists because the
 * first version of the home page served the dark palette to everybody: a
 * `@theme` block nested in a media query is not conditional in Tailwind v4, and
 * nothing but a screenshot was ever going to say so.
 *
 *   npm run dev            # in one terminal
 *   node scripts/shoot.mjs # in another
 */

import { chromium } from "playwright";

const browser = await chromium.launch();

for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.screenshot({ path: `/tmp/shots/${scheme}.png` });
  await page.close();
}

console.log("ok");
await browser.close();
