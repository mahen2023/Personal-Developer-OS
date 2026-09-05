import { parseDuration, hashToken } from '../auth/auth.service';
import { redact } from './filters/all-exceptions.filter';
import { slugify } from './slug';
import { disposition } from '../documents/documents.service';

describe('parseDuration', () => {
  it.each([
    ['45s', 45_000],
    ['15m', 900_000],
    ['12h', 43_200_000],
    ['30d', 2_592_000_000],
    [' 7d ', 604_800_000],
  ])('parses %s', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  // A silently-wrong TTL would either lock people out or extend a session
  // forever, so an unparseable value must fail loudly at boot.
  it.each(['', '15', 'm15', '15w', '1.5h', '-5m'])('rejects %p', (input) => {
    expect(() => parseDuration(input)).toThrow(/Unsupported duration/);
  });
});

describe('hashToken', () => {
  it('is deterministic, so a presented refresh token finds its session row', () => {
    expect(hashToken('token-abc')).toBe(hashToken('token-abc'));
  });

  it('never stores the token itself', () => {
    const token = 'super-secret-refresh-token';
    const hash = hashToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toHaveLength(64);
  });

  it('separates different tokens', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('redact', () => {
  it('masks credential-bearing keys anywhere in the tree', () => {
    const input = {
      email: 'me@example.com',
      password: 'hunter2',
      nested: { apiKey: 'sk-live-123', label: 'production' },
      list: [{ totpSecret: 'JBSWY3DPEHPK3PXP' }, { safe: 'value' }],
    };

    expect(redact(input)).toEqual({
      email: 'me@example.com',
      password: '[redacted]',
      nested: { apiKey: '[redacted]', label: 'production' },
      list: [{ totpSecret: '[redacted]' }, { safe: 'value' }],
    });
  });

  it('matches case-insensitively — a DTO field is not always camelCase', () => {
    expect(redact({ Password: 'x', PRIVATEKEY: 'y' })).toEqual({
      Password: '[redacted]',
      PRIVATEKEY: '[redacted]',
    });
  });

  it('leaves primitives and null alone', () => {
    expect(redact('plain')).toBe('plain');
    expect(redact(null)).toBeNull();
    expect(redact(42)).toBe(42);
  });

  it('stops recursing on deeply nested input rather than hanging', () => {
    const deep = { a: { b: { c: { d: { e: { password: 'leak' } } } } } };
    expect(() => redact(deep)).not.toThrow();
  });
});

describe('slugify', () => {
  it.each([
    ['Basuki Automaton', 'basuki-automaton'],
    ['  Ledger / Reconciler  ', 'ledger-reconciler'],
    ['Café Ünicode', 'cafe-unicode'],
    ['---already--slugged---', 'already-slugged'],
    ['C++ & Rust!', 'c-rust'],
  ])('%p -> %p', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('caps length so a pasted paragraph cannot become a URL', () => {
    expect(slugify('a'.repeat(200))).toHaveLength(64);
  });
});

describe('disposition', () => {
  it.each(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'])(
    'renders %s inline when the preview asks',
    (mimeType) => {
      expect(disposition(mimeType, true)).toBe('inline');
    },
  );

  // An inline SVG runs script on this origin. No caller may opt into that.
  it.each(['image/svg+xml', 'text/html', 'text/plain', 'application/json'])(
    'keeps %s an attachment even when inline is asked',
    (mimeType) => {
      expect(disposition(mimeType, false)).toBe('attachment');
      expect(disposition(mimeType, true)).toBe('attachment');
    },
  );

  it('downloads by default', () => {
    expect(disposition('application/pdf', false)).toBe('attachment');
  });
});
