/**
 * Re-encoding a picture before it is stored, in the browser that chose it.
 *
 * Every picture this product stores is public, served from a CDN, and looked at
 * by everybody who opens a hackathon. What was uploaded, though, is whatever
 * came off somebody's phone: a four megabyte PNG is an ordinary thing to hand a
 * file picker, and storing it means serving it, over and over, at a size no
 * screen here ever draws.
 *
 * So it is re-encoded on the way in. The conversion happens here rather than in
 * a function or at the bucket for two reasons: this deployment's plan has no
 * image transformation, and a picture that arrives already small never costs
 * anything to serve, whereas one converted on the way out costs something every
 * time somebody asks for it.
 *
 * Nothing is cropped. The shapes the cards and headers draw are enforced in CSS
 * and always have been, and a crop written into the stored file would be a
 * decision nobody could take back — the original is gone by then.
 */

export interface Bounds {
  width: number;
  height: number;
}

/** What a re-encoded picture is asked to be, before quality is traded away. */
const QUALITY = 0.82;

/**
 * Types worth converting.
 *
 * GIF is deliberately missing. A canvas keeps one frame of it, so converting an
 * animated avatar would silently turn it into a still, and somebody who chose a
 * moving picture chose it on purpose.
 */
const CONVERTIBLE = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * The same picture as WebP, no larger than the box it will ever be drawn in.
 *
 * Returns the original whenever converting would not be an improvement or would
 * not work: an animated GIF, a browser with no WebP encoder, a file already
 * smaller than what came back, or anything that throws. Storing a picture is
 * the job, and making it smaller is an optimisation on the way; an optimisation
 * that can fail an upload is worse than the bytes it saves.
 */
export async function shrink(file: File, within: Bounds): Promise<File> {
  if (!CONVERTIBLE.has(file.type)) {
    return file;
  }

  try {
    const smaller = await reencode(file, within);

    /* A small PNG of flat colour can beat WebP, and a picture that is already
       WebP at the right size gains nothing from a second pass through a lossy
       encoder. Either way the smaller file wins. */
    return smaller !== null && smaller.size < file.size ? smaller : file;
  } catch {
    return file;
  }
}

/**
 * The size to store a picture at: inside the box, in its own proportions.
 *
 * Never larger than what was handed over. Scaling a small picture up would cost
 * bytes to add nothing — the pixels it would gain are invented — and the whole
 * point of this file is bytes.
 */
export function fit(width: number, height: number, within: Bounds): Bounds {
  const scale = Math.min(1, within.width / width, within.height / height);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function reencode(file: File, within: Bounds): Promise<File | null> {
  const bitmap = await createImageBitmap(file);

  try {
    const { width, height } = fit(bitmap.width, bitmap.height, within);
    const blob = await draw(bitmap, width, height);

    if (blob === null || blob.type !== "image/webp") {
      // A browser with no WebP encoder hands back a PNG instead of refusing,
      // and that PNG is usually larger than what we were given.
      return null;
    }

    return new File([blob], `${stem(file.name)}.webp`, { type: "image/webp" });
  } finally {
    // Held until the drawing is done: the bitmap owns decoded pixels, and on a
    // page where somebody is trying several pictures they add up fast.
    bitmap.close();
  }
}

async function draw(bitmap: ImageBitmap, width: number, height: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");

    if (context === null) {
      return null;
    }

    context.drawImage(bitmap, 0, 0, width, height);

    return canvas.convertToBlob({ type: "image/webp", quality: QUALITY });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (context === null) {
    return null;
  }

  context.drawImage(bitmap, 0, 0, width, height);

  return new Promise((settle) => {
    canvas.toBlob((blob) => settle(blob), "image/webp", QUALITY);
  });
}

/** The name without its extension, so the stored file is not `logo.png.webp`. */
function stem(name: string): string {
  const dot = name.lastIndexOf(".");

  return dot <= 0 ? name : name.slice(0, dot);
}
