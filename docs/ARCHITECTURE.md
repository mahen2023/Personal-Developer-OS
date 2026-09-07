# Architecture

## The one idea

This is not a set of CRUD screens that happen to share a sidebar. It is a graph
with a UI on top.

**Project is the hub.** Almost every table carries an optional `projectId`. That
single decision is what makes the project workspace, the context panel, the
relationship graph and project-scoped search possible without a bespoke join per
feature. An entity with no project is still valid — a personal note, a command
you use everywhere — it simply sits outside the graph.

**Relationships are first-class, in two layers.** Structural ones the schema can
predict (a server belongs to an environment, a deployment came from a repository)
are real foreign keys. Ones it cannot (this note explains that deployment) live
in `entity_links`, keyed by `EntityType` + id. Tags, activity, notifications and
documents are polymorphic the same way, so adding an entity type is one enum
value rather than a migration per pairing. The trade is deliberate: the database
cannot enforce those references, so the service layer must.

## Shape

```
browser
   │  every request is same-origin
   ▼
Next.js (:3000) ──► /api/[...path] proxy ──► NestJS (:4000) ──► PostgreSQL
   │                                              │
   └─ shell, design system, palette               ├─ Redis ──► worker (BullMQ, phase 7)
                                                  ├─ FileStorageService ──► local disk
                                                  └─ Ollama (:11434, on the host)
```

The browser never talks to the API host directly. The Next route handler at
`apps/web/src/app/api/[...path]/route.ts` proxies everything, which is what lets
the auth cookies stay `httpOnly` and first-party, and removes CORS from the
picture for the app itself. The API still accepts `Authorization: Bearer` so it
stays scriptable.

## Backend

`apps/api/src/` — one directory per module, each with a controller, a service and
DTOs. Nothing is shared by reaching across modules; shared behaviour is a
provider in `common/` or a global module.

| Path             | Responsibility                                                     |
| ---------------- | ------------------------------------------------------------------ |
| `config/`        | Every `process.env` read, parsed once, validated at boot           |
| `prisma/`        | The client, as a global module                                     |
| `common/`        | Guards, the exception filter, cookies, pagination, redaction       |
| `auth/`          | Register, login, refresh rotation, sessions, password change       |
| `activity/`      | The feed every module writes to                                    |
| `dashboard/`     | Counts, the attention centre, recent work — all derived on read    |
| `health/`        | `/health` (liveness, touches nothing) and `/ready` (checks the DB) |
| `ai/`            | Chunking, embeddings, pgvector retrieval, the intelligence console |
| `notifications/` | Raising, deduplicating and delivering what needs attention         |
| `jobs/`          | The BullMQ queue, the nightly scans, backups and export            |
| `integrations/`  | GitHub, GitLab and Cloudflare, all optional, all plain REST        |

Two decisions worth knowing before adding a module:

- **`JwtAuthGuard` is applied globally** (`APP_GUARD` in `AppModule`). A new
  controller is protected by default and opts out with `@Public()` — the safe
  direction to forget.
- **`ThrottlerGuard` runs before it**, so an unauthenticated flood is rejected
  before it can reach Argon2.

Adding a module: create the directory, register it in `app.module.ts`, extend
`PaginationDto` for its filters, scope every query by `userId`, and call
`ActivityService.record()` on writes.

### Two processes, one module graph

`main.ts` serves HTTP; `worker.ts` builds the same `AppModule` with no listener
and sets `WORKER=true` for itself. Both create the queue, but `JobsProcessor` is
declared `autorun: false` and only the worker calls `run()` — so the API can
enqueue and inspect while never processing. Repeatable jobs are owned by the
queue rather than by a process, which is what lets both register the same
schedule and have it fire once.

### Retrieval

Records that contain prose are chunked, embedded and stored in a `vector(384)`
column; writes call `IndexerService.touch()` without awaiting it, because
indexing is an enhancement to a save that has already succeeded. Both embedding
providers emit 384 dimensions so either fits the column — the local one by
construction, OpenAI's by asking its v3 models to reduce.

Questions are routed before they are answered: a countable question ("how many
issues are open") runs one of a fixed set of hand-written queries, and only a
knowledge question goes to retrieval. Nothing generates SQL. When answer
generation is off, retrieval returns the passages themselves, which is the more
useful half anyway.

### The Developer Intelligence console

`ai/chat/`, `ai/providers/`, `ai/conversations/`, `ai/models/`, `ai/settings/`.

A streaming assistant on a local Ollama. It sits **on top of** retrieval rather
than beside it: the `chunks` rows above are the sources it cites, so a record
becomes quotable by being indexed and by nothing else.

| File                             | Holds                                                 |
| -------------------------------- | ----------------------------------------------------- |
| `providers/ollama.provider.ts`   | Every request this application makes to Ollama        |
| `chat/context.service.ts`        | Everything a model is allowed to see                  |
| `chat/prompt.ts`                 | The prompt itself, as pure functions                  |
| `chat/modes.ts`                  | The seven modes, and `SELECTABLE_SOURCES`             |
| `chat/chat.service.ts`           | One turn, yielded event by event                      |
| `chat/knowledge.service.ts`      | An answer saved back as a note, solution, ADR or task |

Four boundaries hold this together:

- **One file speaks Ollama.** `/api/tags` returning `models` while `/api/ps`
  returns the same field with different contents is Ollama's business. Six JSON
  endpoints read with `fetch` — no client library, and the newline-delimited
  stream is read straight off the body.
- **One file decides what the model sees.** Prose types are retrieved by meaning
  and cited; row types (task, server, database, domain, deployment, environment,
  repository) are never indexed and are listed as a compact brief, because a
  paraphrase of a hostname is worse than the hostname. Teaching the console a new
  record type means editing `context.service.ts`, never a prompt string.
- **Prompts are pure functions**, which is the only reason they are testable —
  and `GROUND` is split from `WITH_KNOWLEDGE` so a model given no sources is
  never told to cite any. It would open every answer apologising for finding none.
- **Three independent things keep the vault out**: vault items are not indexed,
  `VAULT_ITEM` is absent from `SELECTABLE_SOURCES`, and `assertNoSecrets()` drops
  the type even if a stored conversation asks for it. The infrastructure brief
  selects its columns explicitly for the same reason — a future column called
  `password` cannot arrive in a prompt by being added to the schema.

A turn goes out as server-sent events. `meta` — conversation, model, sources —
is emitted before the first token, so the sources panel renders while a cold
model is still being read off disk. Failures before the first token are a
`ProviderError` and become an HTTP status; after it, the status is already sent,
so they become an `error` event on the open stream. Streaming survives the Next
proxy because it forwards `upstream.body` untouched, and `X-Accel-Buffering`
covers nginx, which otherwise holds a stream until it has a few kilobytes and
makes a working console look frozen.

Conversations, messages and their selected sources are ordinary Postgres rows,
which is what makes rewinding to an earlier turn a delete rather than a
replay. The Ollama base URL and the chosen model are per-user settings, not just
environment variables, so the console can be pointed at another machine without
a restart.

## Frontend

`apps/web/src/`

| Path                     | Responsibility                                        |
| ------------------------ | ----------------------------------------------------- |
| `app/(auth)/`            | Sign in and register, no shell                        |
| `app/(workspace)/`       | Everything behind the shell                           |
| `components/shell/`      | Rail, top bar, status bar, context panel              |
| `components/system/`     | Theme, workspace state, keyboard layer                |
| `components/command/`    | The palette                                           |
| `components/primitives/` | Status dots, expiry read-outs, counters, empty states |
| `lib/navigation.ts`      | **The single source of truth for the IA**             |

`lib/navigation.ts` drives the rail, the `g`-chord shortcuts, the palette's
"go to" entries, the breadcrumb and the status bar's section label. Adding a
module means adding one row there; forgetting to is the only way to get an
inconsistent IA.

State is deliberately small: React context in `WorkspaceProvider` (user, counts,
health, panel open/closed) and `fetch` through `lib/api.ts`. There is no state
library and no data-fetching library, because nothing yet needs one. `api()`
handles one thing beyond fetch: a 401 triggers a single refresh-and-replay, since
a 15-minute access token expiring mid-session is routine rather than an error.

## Design system

The visual language is "instrument panel", not "web dashboard", and it is
enforced by the token set in `app/globals.css` rather than by convention:

- surfaces separate with 1px hairlines, never with shadow or rounding
- radii top out at 6px, so nothing reads as a floating card
- one brass accent carries interaction; every other colour means a signal
  (success, warning, danger, info, security) and is used sparingly
- monospace is reserved for machine-readable values — IPs, commands, keys, SHAs
- both themes are complete palettes, defined once; components consume semantic
  names and never a hex

Motion is defined in the same file: three durations, one easing curve, and a
`prefers-reduced-motion` block that disables all of it.

## Data model

38 tables. The groups:

- **identity** — `users`, `sessions` (one row per refresh token, so revocation
  is real)
- **hub** — `projects`
- **infrastructure** — `environments`, `env_variables`, `servers`, `databases`,
  `domains`, `ssl_certificates`, `deployments`, `repositories`
- **work** — `notes`, `tasks`, `issues`, `solutions`, `snippets`, `commands`,
  `adrs`, `meetings`
- **knowledge** — `documents`, `bookmarks`, `learning_items`, `ideas`
- **vault** — `vault_profiles` (KDF parameters and the wrapped data key),
  `vault_items` (ciphertext only)
- **retrieval** — `chunks` (derived data: rebuildable from the records it came
  from, and backed up by nothing)
- **console** — `ai_conversations`, `ai_messages`, `ai_model_profiles`,
  `ai_settings`, `ai_usage`
- **integrations** — `integrations` (one row per provider, token encrypted)
- **cross-cutting** — `tags`, `entity_tags`, `entity_links`, `activities`,
  `notifications`, `audit_logs`

Indexes follow the access patterns rather than the columns: `(userId, status)`,
`(projectId, status)`, `(userId, updatedAt)` for feeds, and bare `expiresAt` /
`dueDate` for the daily expiry scan.

`ai_messages.sources` is a JSON snapshot rather than a relation, on purpose: a
citation has to keep saying what it said after the note it quoted is edited or
deleted. A foreign key would either dangle or cascade the transcript away, and
both rewrite history.

Two columns exist purely to keep secrets out of the wrong place:

- `env_variables` holds either a literal value **or** a `vaultItemId`, never a
  secret string.
- `servers.sshKeyId` and `databases.credentialId` are vault references. No
  credential is ever stored on an infrastructure row.

## What is deliberately absent

- No microservices. One API, one worker, one database.
- No GraphQL. REST with a consistent five-verb shape per module.
- No component library. The design is the differentiator; a kit would fight it.
- No multi-tenancy. Every query is scoped by `userId` because there will be one,
  but there is no organisation, role or permission model to maintain.
- No integration is required. GitHub, Cloudflare and AI are all optional and the
  app is fully functional with every one of them switched off.
- No vendor SDKs for integrations. Every provider is a `fetch` call; an SDK is a
  large dependency to save thirty lines of request building. AWS is not
  integrated precisely because request signing would change that calculation.
- No websocket. The unread count polls every two minutes, because the thing it
  watches changes once a night.
- No command execution. The app records commands and warns about destructive
  ones; it never runs them.
