import { describe, expect, it } from "vitest";

import { fit, shrink } from "./image";

/**
 * Deciding what a stored picture should be, before any of it is drawn.
 *
 * The drawing needs a canvas and a WebP encoder, which is a browser's job and
 * not worth simulating. What is worth pinning is everything around it: the
 * arithmetic that decides the stored size, and the promise that a conversion
 * which cannot happen never costs somebody their upload.
 */

const BANNER = { width: 1600, height: 1200 };

describe("the size a picture is stored at", () => {
  it("brings a photograph down to the width the page draws", () => {
    expect(fit(4032, 3024, BANNER)).toEqual({ width: 1600, height: 1200 });
  });

  it("keeps the proportions it was given rather than the box's", () => {
    expect(fit(3200, 800, BANNER)).toEqual({ width: 1600, height: 400 });
  });

  /**
   * A tall picture is bounded by its height, and that is the case the height in
   * `WITHIN` exists for: bounding a banner to the four to one it is drawn at
   * would hand back something four hundred pixels tall and blurred.
   */
  it("bounds a tall picture by its height", () => {
    expect(fit(1200, 2400, BANNER)).toEqual({ width: 600, height: 1200 });
  });

  /**
   * Scaling up would add invented pixels and cost real bytes, which is the
   * opposite of what this is for.
   */
  it("leaves a picture smaller than the box alone", () => {
    expect(fit(320, 240, BANNER)).toEqual({ width: 320, height: 240 });
  });

  it("never rounds a sliver away to nothing", () => {
    expect(fit(10_000, 3, { width: 100, height: 100 })).toEqual({ width: 100, height: 1 });
  });
});

describe("a picture that cannot be re-encoded", () => {
  /**
   * An animated avatar converted through a canvas would come back as its first
   * frame, silently. Somebody who chose a moving picture chose it on purpose.
   */
  it("hands a GIF back untouched", async () => {
    const gif = new File([new Uint8Array([1, 2, 3])], "wave.gif", { type: "image/gif" });

    expect(await shrink(gif, BANNER)).toBe(gif);
  });

  /**
   * There is no canvas here, so the conversion throws. That is the same shape
   * as a browser with no WebP encoder, and the answer has to be the same one:
   * upload what we were given. Losing an upload to save bytes is a bad trade.
   */
  it("hands the original back when the browser cannot convert it", async () => {
    const png = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });

    expect(await shrink(png, BANNER)).toBe(png);
  });
});
