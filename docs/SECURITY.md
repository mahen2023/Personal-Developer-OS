# Security

This application holds server credentials, API keys, SSH keys and TOTP secrets.
It is worth more to an attacker than the code it documents.

## Threat model

What this design defends against:

- **A stolen laptop or a lifted database dump.** Vault ciphertext is useless
  without both the master password (never sent to the server) and
  `VAULT_ENVELOPE_KEY` (never in the database).
- **Cross-site scripting.** Tokens live in `httpOnly` cookies, so no injected
  script can read a session.
- **Cross-site request forgery.** `SameSite` on every auth cookie, plus a
  same-origin proxy.
- **Credential stuffing and brute force.** Argon2id at OWASP parameters, rate
  limits on the endpoints worth attacking.
- **Accidental leakage into logs.** Redaction on the way into every log line and
  activity record.

What it does **not** defend against, by design: an attacker with code execution
on the host while the app is running and the vault is unlocked. This is a
single-user, self-hosted tool; the host is the trust boundary.

## Authentication

| Control            | Implementation                                                      |
| ------------------ | ------------------------------------------------------------------- |
| Password hashing   | Argon2id, m=19456 KiB, t=2, p=1 (OWASP guidance)                    |
| Access token       | JWT, 15 minutes, `httpOnly` + `SameSite=Lax` cookie                 |
| Refresh token      | JWT, 30 days, `httpOnly` + `SameSite=Strict`, scoped to `/api/auth` |
| Refresh rotation   | The presented token's row is deleted as the next pair is issued     |
| Session revocation | One `sessions` row per refresh token; delete it and it is dead      |
| Password change    | Deletes every session for that user, in the same transaction        |
| Timing             | Login runs a hash verification even for unknown accounts            |
| Rate limits        | 5 logins/min, 3 registrations/min, 5 password changes/5 min         |

`sessions.tokenHash` is a SHA-256 of the token, never the token itself. A
database dump therefore cannot be replayed as a session.

### The session marker cookie

`devos_session` is readable by JavaScript, contains only `1`, and grants nothing.
It exists so the Next middleware can tell a signed-in visitor from a stranger
without access to the `httpOnly` cookies, and so an expired 15-minute access
token routes to a refresh instead of bouncing the user to sign-in. Forging it
buys an attacker a redirect to a page that will immediately 401.

## Vault

The schema is in place; phase 5 implements the operations.

```
master password ──Argon2id(salt)──► master key ──unwraps──► vault data key
                                        │                        │
                                   verifier                 AES-256-GCM
                              (proves the password,              │
                               reveals nothing)          item ciphertext
                                                                 │
                                              re-wrapped with VAULT_ENVELOPE_KEY
```

Rules the implementation must keep:

1. The master password never reaches the server. Derivation and item encryption
   happen client-side; the server stores ciphertext and a verifier.
2. `VAULT_ENVELOPE_KEY` lives in the environment, never in the database. Losing
   it makes every secret unrecoverable — **back it up separately from the
   database backup**, or a single compromised backup file contains both halves.
3. `vault_items` stores non-secret metadata (name, username, URL) in the clear so
   items stay searchable while locked. Everything else is in `cipher`.
4. Secrets are masked by default and revealing one requires confirmation.
5. Auto-lock, clipboard timeout and session timeout are all enforced, with
   defaults in `.env`.
6. Every vault operation writes an `audit_logs` row — and never the value.

## Secrets never reach

| Sink                | How it is prevented                                                         |
| ------------------- | --------------------------------------------------------------------------- |
| Application logs    | `redact()` masks credential-bearing keys at any depth                       |
| Prisma query logs   | Only `warn` and `error` are subscribed; `query` events are never logged     |
| API error bodies    | The exception filter returns a sentence and an id; details stay server-side |
| Activity feed       | `ActivityService.record()` runs `redact()` over `meta` before writing       |
| Audit log           | Stores the vault item's id, never its value                                 |
| Infrastructure rows | Credentials are vault references, not columns                               |
| Exports             | Vault items export as metadata only — the server cannot decrypt them        |
| AI prompts          | Vault items are never indexed, so no ciphertext or secret can be retrieved  |
| Notification emails | Carry a title and a place to look, never a value                            |
| Provider errors     | Only the status and the provider name; a provider can echo the request      |

Two of those are structural rather than enforced by a rule, which is stronger.
An export of readable passwords is impossible because only the browser holding
the master key can decrypt an item; and the retrieval index has no source that
reads `vault_items`, so there is nothing for a prompt to retrieve.

## Integration tokens

Tokens for GitHub, GitLab and Cloudflare are the one credential the server can
read on its own. They are sealed with `VAULT_ENVELOPE_KEY`, so a stolen database
is still inert — but unlike a vault item, no master password stands behind them.

That is a deliberate weakening and it buys one thing: the nightly sync can run
while nobody is signed in. The controls around it are that integrations are
opt-in, one token per provider, verified with the provider before being stored,
never returned by any endpoint, and shown on their own screen with the scopes
the provider reports. Give each token the narrowest scope that works. If the
machine is lost, revoke at the provider — deleting the row here does not.

The redaction key list lives in one place —
`apps/api/src/common/filters/all-exceptions.filter.ts`. Add to it whenever a new
secret-bearing field name appears.

## Transport and headers

- `helmet` on the API.
- Next sets `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy: same-origin` and a restrictive `Permissions-Policy`.
- CORS is locked to `WEB_ORIGIN` with credentials — and the app itself never
  needs it, because the proxy makes every request same-origin.
- `COOKIE_SECURE=true` is enforced at boot when `NODE_ENV=production`; the
  process refuses to start otherwise.

## Input handling

`ValidationPipe` runs globally with `whitelist` and `forbidNonWhitelisted`, so an
unrecognised field is a 400 rather than a silently-accepted property. Every DTO
declares its constraints; nothing reaches Prisma untyped.

`?next=` on sign-in is checked to be a same-origin path before redirect, so the
query string cannot be used as an open redirect.

## Commands and execution

The command library stores commands and marks their danger level. **The
application never executes them.** Copying a `DESTRUCTIVE` command requires
confirmation. There is no endpoint that runs a shell command, and there should
never be one.

## Operational checklist

- [ ] `.env` is not committed (`.gitignore` covers it) and is `chmod 600`
- [ ] All three secrets generated with `crypto.randomBytes`, never reused
- [ ] `ALLOW_REGISTRATION=false` once your account exists
- [ ] `COOKIE_SECURE=true` and TLS terminating in front of the app
- [ ] Postgres not published to a public interface
- [ ] `VAULT_ENVELOPE_KEY` backed up somewhere the database backup is not
- [ ] Sessions reviewed in Settings → Security after any device is lost

## Reporting

This is a personal tool with no public deployment. If you fork it and find a
flaw, fix it in your fork first — do not file a public issue containing a working
exploit path.
