/**
 * Hex, because that is the shape the shared fixtures are written in.
 *
 * The fixtures under `fixtures/` are read by the Rust contract tests and by
 * this package, so they are plain text with one value per file. Hex keeps them
 * diffable: a digest that moved shows as a changed line rather than as a blob.
 */

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function fromHex(text: string): Uint8Array {
  const trimmed = text.trim();

  if (trimmed.length % 2 !== 0) {
    throw new Error(`hex must have an even length, got ${trimmed.length}`);
  }

  const bytes = new Uint8Array(trimmed.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = Number.parseInt(trimmed.slice(index * 2, index * 2 + 2), 16);

    if (Number.isNaN(byte)) {
      throw new Error(`not hex at byte ${index}`);
    }

    bytes[index] = byte;
  }

  return bytes;
}
