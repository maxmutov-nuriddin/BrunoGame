/** Web Crypto randomness: the same in browsers (the host tab) and in Node tests. */
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Unbiased integer in [0, max). */
export function randomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % max;
  }
}

/** `bytes` random bytes as URL-safe text (6 bits per character). */
export function randomToken(bytes: number): string {
  const values = globalThis.crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(values, (v) => BASE64URL[v & 63]).join('');
}
