import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The server's half of the vault's two-layer encryption.
 *
 * An item is already AES-256-GCM ciphertext when it arrives: the browser
 * encrypted it under a key derived from the master password, which the server
 * never sees. This wraps that ciphertext again under VAULT_ENVELOPE_KEY, which
 * lives in the environment and never in the database.
 *
 * The point is that neither half is sufficient. A leaked database dump is
 * inert without the envelope key; the envelope key alone reveals nothing
 * without the master password. See docs/SECURITY.md.
 */

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export function envelopeKey(base64url: string): Bytes {
  const key = Buffer.from(base64url, 'base64url');
  if (key.length !== 32) {
    throw new Error('VAULT_ENVELOPE_KEY must be 32 bytes encoded as base64url.');
  }
  return new Uint8Array(key);
}

/**
 * Prisma returns `Bytes` columns as `Uint8Array<ArrayBuffer>`, so that is the
 * currency at this boundary; Buffer is an implementation detail of the crypto
 * calls inside. The explicit buffer parameter matters: a plain `Uint8Array` is
 * `Uint8Array<ArrayBufferLike>`, which Prisma will not accept.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

/** Returns nonce ‖ tag ‖ ciphertext, so one column holds everything needed. */
export function seal(plaintext: Bytes, key: Bytes): Bytes {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(key), nonce);
  const sealed = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  return new Uint8Array(Buffer.concat([nonce, cipher.getAuthTag(), sealed]));
}

export function open(sealed: Bytes, key: Bytes): Bytes {
  if (sealed.length < NONCE_BYTES + TAG_BYTES) {
    throw new Error('Sealed value is too short to be valid.');
  }
  const buffer = Buffer.from(sealed);
  const nonce = buffer.subarray(0, NONCE_BYTES);
  const tag = buffer.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
  const body = buffer.subarray(NONCE_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, Buffer.from(key), nonce);
  decipher.setAuthTag(tag);
  // GCM authentication fails loudly here if the ciphertext or the key is wrong,
  // which is what makes a tampered row detectable rather than silently decoded.
  return new Uint8Array(Buffer.concat([decipher.update(body), decipher.final()]));
}

/** Constant-time comparison for the unlock verifier. */
export function sameBytes(a: Bytes, b: Bytes): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function fromBase64(value: string): Bytes {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

export function toBase64(value: Bytes): string {
  return Buffer.from(value).toString('base64');
}
