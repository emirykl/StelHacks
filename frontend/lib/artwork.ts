import { browserClient } from "./supabase/client";

/**
 * A hackathon's logo and banner, uploaded from the machine they are on.
 *
 * The same arrangement as an avatar and for the same reason: straight from the
 * browser to the bucket, because a file has no business being serialised into a
 * form submission and passed through a Node process on its way to storage, and
 * the policy on the bucket is what decides whose folder it lands in.
 *
 * Keyed by the uploader's account rather than by the hackathon, because the
 * picture is chosen while the form is being filled in and there is no contract
 * to own it until the form is submitted.
 */

export const MOST = 4 * 1024 * 1024;

const KINDS = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * What each picture is drawn at, and therefore what to upload.
 *
 * Said on the form rather than left to be discovered. A logo cropped to a
 * square and a banner cropped to four to one are what the card and the header
 * do with whatever they are given, so an organizer who was not told hands over
 * a portrait and finds its top third on the listing.
 */
export const SHAPES = {
  logo: { width: 512, height: 512, note: "Square. Shown at 96px on a card." },
  banner: { width: 1600, height: 400, note: "Wide, 4:1. Runs across the top of the page." },
} as const;

export type Shape = keyof typeof SHAPES;

export interface Uploaded {
  url: string | null;
  /** Said in the person's terms, or absent when the picture went up. */
  message: string | null;
}

export async function uploadArtwork(file: File, userId: string, shape: Shape): Promise<Uploaded> {
  if (!KINDS.has(file.type)) {
    return { url: null, message: "That has to be a PNG, JPEG or WebP." };
  }

  /* Checked here as well as at the bucket. The bucket is what enforces it, but
     a refusal that arrives after a slow upload finished is a worse way to learn
     the file was too big. */
  if (file.size > MOST) {
    return { url: null, message: "That picture is over four megabytes." };
  }

  const db = browserClient();

  if (db === null) {
    return { url: null, message: "Storage is not configured on this deployment." };
  }

  /* A new name every time rather than one file replaced in place. The URL is
     public and therefore cached by every CDN between here and the reader, and a
     replaced file would leave the old picture showing for as long as that cache
     lives. */
  const name = `${userId}/${shape}-${Date.now()}.${extension(file.type)}`;

  const { error } = await db.storage.from("hackathon-art").upload(name, file, {
    contentType: file.type,
    cacheControl: "31536000",
  });

  if (error !== null) {
    return { url: null, message: error.message };
  }

  const { data } = db.storage.from("hackathon-art").getPublicUrl(name);

  return { url: data.publicUrl, message: null };
}

function extension(type: string): string {
  return type === "image/jpeg" ? "jpg" : type.slice("image/".length);
}

/** Twenty megabytes, matching the bucket. */
const DECK_MOST = 20 * 1024 * 1024;

/**
 * A pitch deck, which is a PDF and lives in its own bucket.
 *
 * Kept apart from artwork rather than folded into it, because the size limits
 * differ by a factor of five: letting a deck through the artwork bucket would
 * mean letting a twenty megabyte logo through with it.
 */
export async function uploadDeck(file: File, userId: string): Promise<Uploaded> {
  if (file.type !== "application/pdf") {
    return { url: null, message: "That has to be a PDF." };
  }

  /* Checked here as well as at the bucket, for the same reason artwork is: a
     refusal that arrives after a slow upload is a worse way to find out. */
  if (file.size > DECK_MOST) {
    return { url: null, message: "That deck is over twenty megabytes." };
  }

  const db = browserClient();

  if (db === null) {
    return { url: null, message: "Storage is not configured on this deployment." };
  }

  const name = `${userId}/deck-${Date.now()}.pdf`;

  const { error } = await db.storage.from("project-decks").upload(name, file, {
    contentType: file.type,
    cacheControl: "31536000",
  });

  if (error !== null) {
    return { url: null, message: error.message };
  }

  const { data } = db.storage.from("project-decks").getPublicUrl(name);

  return { url: data.publicUrl, message: null };
}
