/**
 * Bytes as text, which is how a digest is compared.
 *
 * Written out rather than through `Buffer`, which is a Node type this site
 * would otherwise ship a polyfill for to do what a loop does in four lines.
 */

export function toHex(bytes: Uint8Array): string {
  let out = "";

  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }

  return out;
}
