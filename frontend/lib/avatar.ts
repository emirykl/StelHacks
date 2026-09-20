import { shrink } from "./image";
import { browserClient } from "./supabase/client";

/**
 * Putting a picture somewhere it can be served from.
 *
 * Uploaded from the browser straight to storage rather than posted through a
 * server action. A file is the one thing on this form that has no business
 * being serialised into a form submission and passed through a Node process on
 * the way to a bucket, and the policy on the bucket is what decides whose
 * folder it lands in, so nothing is gained by routing it through us.
 *
 * The path starts with the owner's id because that is the access rule: the
 * policy compares the first segment against `auth.uid()`. Everything after it
 * is ours to choose.
 */

export const MOST = 2 * 1024 * 1024;

const KINDS = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export interface Uploaded {
  url: string | null;
  /** Said in the person's terms, or absent when the picture went up. */
  message: string | null;
}

export async function uploadAvatar(file: File, userId: string): Promise<Uploaded> {
  if (!KINDS.has(file.type)) {
    return { url: null, message: "That has to be a PNG, JPEG, WebP or GIF." };
  }

  /* Checked here as well as at the bucket. The bucket is what enforces it, but
     a refusal that arrives after a slow upload finished is a worse way to learn
     the file was too big. */
  if (file.size > MOST) {
    return { url: null, message: "That picture is over two megabytes." };
  }

  const db = browserClient();

  if (db === null) {
    return { url: null, message: "Storage is not configured on this deployment." };
  }

  /* A new name every time rather than one file replaced in place. The URL is
     public and therefore cached by every CDN between here and the reader, and
     a replaced file would leave the old picture showing for as long as that
     cache lives. */
  /* An avatar is drawn at 96 pixels at its largest and stored at 512, which
     leaves room for a screen with more pixels than the one it was chosen on.
     A GIF comes back untouched, because converting it would drop everything
     but its first frame. */
  const picture = await shrink(file, { width: 512, height: 512 });
  const name = `${userId}/${Date.now()}.${extension(picture.type)}`;

  const { error } = await db.storage.from("avatars").upload(name, picture, {
    contentType: picture.type,
    cacheControl: "31536000",
  });

  if (error !== null) {
    return { url: null, message: error.message };
  }

  const { data } = db.storage.from("avatars").getPublicUrl(name);

  return { url: data.publicUrl, message: null };
}

function extension(type: string): string {
  return type === "image/jpeg" ? "jpg" : type.slice("image/".length);
}
