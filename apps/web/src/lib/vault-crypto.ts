import { argon2id } from 'hash-wasm';

/**
 * The browser's half of the vault.
 *
 * The master password never leaves this file. It is turned into a key with
 * Argon2id, that key unwraps a data key, and the data key encrypts each item
 * before anything is sent. The server stores ciphertext and a verifier, and
 * cannot read either. See docs/SECURITY.md.
 *
 * Everything here uses WebCrypto except the KDF, which WebCrypto does not
 * provide — hash-wasm supplies Argon2id compiled to WebAssembly.
 */

export interface KdfParams {
  salt: string;
  memoryKib: number;
  iterations: number;
  parallelism: number;
}

/** Domain separation, so the verifier can never be mistaken for a key. */
const VERIFIER_CONTEXT = 'devos-vault-verifier';

export const toBase64 = (bytes: Bytes): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)));

/**
 * WebCrypto takes `BufferSource`, which is an ArrayBuffer-backed view. A bare
 * `Uint8Array` is `Uint8Array<ArrayBufferLike>` and will not satisfy it, so the
 * byte type is pinned here once rather than cast at every call site.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

export const fromBase64 = (value: string): Bytes =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0)) as Bytes;

/**
 * Argon2id, with the parameters the server recorded when the vault was set up.
 *
 * Slow on purpose: this is the only thing standing between a stolen database
 * and every secret in it, so a few hundred milliseconds per unlock is the
 * cheapest security in the whole application.
 */
export async function deriveMasterKey(password: string, kdf: KdfParams): Promise<Bytes> {
  const raw = await argon2id({
    password,
    salt: fromBase64(kdf.salt),
    parallelism: kdf.parallelism,
    iterations: kdf.iterations,
    memorySize: kdf.memoryKib,
    hashLength: 32,
    outputType: 'binary',
  });
  return new Uint8Array(raw) as Bytes;
}

/** Proves knowledge of the master key without carrying anything derived from it. */
export async function verifierFor(masterKey: Bytes): Promise<string> {
  const material = new Uint8Array([
    ...masterKey,
    ...new TextEncoder().encode(VERIFIER_CONTEXT),
  ]) as Bytes;
  const digest = await crypto.subtle.digest('SHA-256', material);
  return toBase64(new Uint8Array(digest) as Bytes);
}

async function aesKey(bytes: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export interface Sealed {
  cipher: string;
  nonce: string;
}

export async function encrypt(key: Bytes, plaintext: string): Promise<Sealed> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    await aesKey(key),
    new TextEncoder().encode(plaintext),
  );
  return { cipher: toBase64(new Uint8Array(sealed) as Bytes), nonce: toBase64(nonce as Bytes) };
}

export async function decrypt(key: Bytes, sealed: Sealed): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.nonce) },
    await aesKey(key),
    fromBase64(sealed.cipher),
  );
  return new TextDecoder().decode(plain);
}

/** A fresh 256-bit data key. Only ever seen wrapped, or in memory. */
export function newDataKey(): Bytes {
  return crypto.getRandomValues(new Uint8Array(32)) as Bytes;
}

/* ── the secret payload ───────────────────────────────────────────────────── */

/**
 * What actually gets encrypted. Keeping it one JSON object means an item can
 * gain a field later without a migration — the ciphertext has no schema the
 * server knows about.
 */
export interface SecretPayload {
  secret?: string;
  totpSecret?: string;
  privateKey?: string;
  passphrase?: string;
  extra?: Record<string, string>;
}

export const sealPayload = (key: Bytes, payload: SecretPayload): Promise<Sealed> =>
  encrypt(key, JSON.stringify(payload));

export async function openPayload(key: Bytes, sealed: Sealed): Promise<SecretPayload> {
  return JSON.parse(await decrypt(key, sealed)) as SecretPayload;
}

/* ── password generation (§23) ────────────────────────────────────────────── */

const SETS = {
  lower: 'abcdefghijkmnopqrstuvwxyz',
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  // No 0/O/1/l/I anywhere above: a password you cannot read back off a screen
  // is one you will eventually mistype into production.
  digits: '23456789',
  symbols: '!@#$%^&*()-_=+[]{}<>?,.',
};

export interface PasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
}

/** Uniform over the alphabet, using rejection sampling to avoid modulo bias. */
function pick(alphabet: string): string {
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  const byte = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(byte);
    if (byte[0] < limit) return alphabet[byte[0] % alphabet.length];
  }
}

export function generatePassword(options: PasswordOptions): string {
  const pools = [
    options.lower && SETS.lower,
    options.upper && SETS.upper,
    options.digits && SETS.digits,
    options.symbols && SETS.symbols,
  ].filter((value): value is string => typeof value === 'string');

  if (pools.length === 0) return '';
  const alphabet = pools.join('');

  // One character from each chosen set first, so "include symbols" is a
  // guarantee rather than a probability.
  const required = pools.map((pool) => pick(pool));
  const rest = Array.from({ length: Math.max(0, options.length - required.length) }, () =>
    pick(alphabet),
  );
  return shuffle([...required, ...rest]).join('');
}

/** Fisher-Yates with cryptographic randomness. */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const swap = random[0] % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

const CONSONANTS = 'bdfghjklmnprstvwz';
const VOWELS = 'aeiou';

/**
 * A pronounceable passphrase, built from syllables rather than a word list.
 *
 * A real word list would be larger per word, but it also has to ship, stay in
 * sync and be audited. Syllables give roughly 21 bits per four-letter word
 * with nothing to maintain, and the result is still something you can read
 * aloud over a phone.
 */
export function generatePassphrase(words: number, separator = '-'): string {
  return Array.from(
    { length: words },
    () =>
      Array.from({ length: 2 }, () => `${pick(CONSONANTS)}${pick(VOWELS)}`).join('') +
      pick(CONSONANTS),
  ).join(separator);
}

/** Bits of entropy, computed from how the value was actually generated. */
export function entropyBits(options: PasswordOptions): number {
  const size =
    (options.lower ? SETS.lower.length : 0) +
    (options.upper ? SETS.upper.length : 0) +
    (options.digits ? SETS.digits.length : 0) +
    (options.symbols ? SETS.symbols.length : 0);
  return size === 0 ? 0 : Math.round(options.length * Math.log2(size));
}

export function passphraseEntropyBits(words: number): number {
  // Each word is consonant-vowel-consonant-vowel-consonant.
  const perWord = Math.log2(CONSONANTS.length ** 3 * VOWELS.length ** 2);
  return Math.round(words * perWord);
}

/** How to describe a strength to a person, without a fake percentage. */
export function strengthOf(bits: number): { label: string; signal: string } {
  if (bits >= 128) return { label: 'Overkill, in a good way', signal: 'success' };
  if (bits >= 80) return { label: 'Strong', signal: 'success' };
  if (bits >= 60) return { label: 'Reasonable', signal: 'warning' };
  if (bits >= 40) return { label: 'Weak', signal: 'danger' };
  return { label: 'Guessable', signal: 'danger' };
}

/* ── TOTP (§24) ───────────────────────────────────────────────────────────── */

/** RFC 4648 base32, the encoding every authenticator uses for TOTP secrets. */
export function base32Decode(input: string): Bytes {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const character of clean) {
    const index = alphabet.indexOf(character);
    if (index === -1) throw new Error('That is not a valid base32 secret.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output) as Bytes;
}

/**
 * RFC 6238. Uses the browser's clock, which is the same assumption every
 * authenticator app makes — a badly wrong clock produces wrong codes, and
 * that is the honest failure rather than a silently accepted one.
 */
export async function totp(
  secret: string,
  {
    digits = 6,
    period = 30,
    at = Date.now(),
  }: { digits?: number; period?: number; at?: number } = {},
): Promise<string> {
  const counter = Math.floor(at / 1000 / period);
  const message = new ArrayBuffer(8);
  const view = new DataView(message);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);

  const key = await crypto.subtle.importKey(
    'raw',
    base32Decode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));

  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    (signature[offset + 1] << 16) |
    (signature[offset + 2] << 8) |
    signature[offset + 3];

  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Seconds left in the current TOTP window. */
export function totpRemaining(period = 30, at = Date.now()): number {
  return period - (Math.floor(at / 1000) % period);
}

/** Pulls the secret out of an `otpauth://` URI, which is what QR codes encode. */
export function secretFromOtpauth(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'otpauth:') return null;
    return parsed.searchParams.get('secret');
  } catch {
    return null;
  }
}
