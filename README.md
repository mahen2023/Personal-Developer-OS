# Personal Developer OS

A private, self-hosted command centre for one developer's work: projects, notes,
tasks, repositories, servers, databases, domains, certificates, deployments,
troubleshooting solutions, documents and secrets — all connected, all searchable,
all on your own machine.

It exists to answer five questions quickly:

- Where is everything related to this project?
- What do I know about this problem?
- How did I solve this last time?
- What infrastructure is running this?
- What needs my attention today?

Nothing leaves the machine it runs on. There is no telemetry, no account server,
and no external dependency the app needs in order to work.

---

## Stack

| Layer    | Choice                                                    |
| -------- | --------------------------------------------------------- |
| Frontend | Next.js 15 (App Router), React 19, Tailwind v4, no UI kit |
| Backend  | NestJS 11, REST, Swagger at `/api/docs` in development    |
| Database | PostgreSQL 17 + `pgvector` + Prisma                       |
| Queue    | Redis + BullMQ                                            |
| Auth     | Argon2id, JWT access + rotating refresh, httpOnly cookies |
| Local AI | Ollama on your own machine — chat, and optionally embeddings |
| Tests    | Jest (unit), Playwright (end-to-end)                      |

## First run

Requires Node 22+ and Docker.

```bash
git clone <this repo> && cd "Personal Developer OS"
npm install

cp .env.example .env
# Generate the three secrets .env asks for:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_REFRESH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # VAULT_ENVELOPE_KEY

npm run infra:up      # postgres + redis
npm run db:migrate    # create the schema
npm run dev           # api on :4000, web on :3000
```

Open <http://localhost:3000>, create your account, then set
`ALLOW_REGISTRATION=false` in `.env` so nobody else can.

Optional demo data, so the interface is not empty while you explore:

```bash
npm run db:seed              # 3 projects and everything hanging off them
npm run db:seed -- --clear   # remove it again, leaving your own records alone
```

The seed never creates vault items. A fake secret is still a secret-shaped row.

### Everything in Docker

```bash
docker compose up -d          # postgres, redis, api, worker, web
docker compose exec api npx prisma migrate deploy
```

## Commands

| Command                      | What it does                        |
| ---------------------------- | ----------------------------------- |
| `npm run dev`                | API and web together, both watching |
| `npm run build`              | Production build of both            |
| `npm run lint`               | ESLint over both workspaces         |
| `npm test`                   | API unit tests (Jest)               |
| `npm run test:e2e`           | Playwright, against a running stack |
| `npm run db:migrate`         | Create and apply a migration        |
| `npm run db:studio`          | Prisma Studio                       |
| `npm run infra:up` / `:down` | Start or stop Postgres and Redis    |

To run a single API test: `npm test -w @devos/api -- security.spec` (or
`-t "redact"` to match by test name). A single e2e test:
`npx playwright test -g "command palette"`.

## Using it

The application is keyboard-first.

| Key             | Action                                     |
| --------------- | ------------------------------------------ |
| `⌘K` / `Ctrl+K` | Command palette and global search          |
| `>`             | Inside the palette, filter to actions      |
| `g` then a key  | Jump to a module (`g p`, `g s`, `g v`, …)  |
| `[` / `]`       | Toggle the navigation rail / context panel |
| `?`             | Every shortcut                             |

## The Developer Intelligence console

`g a` opens a chat assistant that runs on a **local Ollama** — your questions,
your records and the answers never leave the machine. There is no key to
configure and no enable flag: if Ollama answers, the console works.

```bash
ollama serve                  # or the desktop app
ollama pull llama3.1:8b       # any chat model — the console discovers what you have
```

Then pick the model at `g m` (Local Models), which also pulls and removes them.
Answers stream token by token; stopping one keeps what had already arrived.

What makes it more than a chat window is that it can read what you have already
written. Each conversation has:

- **A mode** — General, Project, Troubleshooting, Documentation, Code,
  Infrastructure or Knowledge. A mode is a system prompt and a retrieval bias,
  not a model, so switching it mid-conversation costs nothing.
- **Sources you opened to it** — the record types this conversation may quote.
  A new conversation starts with none; the mode only suggests. Prose is
  retrieved by meaning and cited inline as `[1]`, `[2]`; rows like servers and
  tasks are listed as a compact brief, because a paraphrased hostname is worse
  than the hostname.
- **A project**, optionally, which narrows all of it to that project, and any
  records you pin — those are sent every turn, unlike retrieved passages, which
  are chosen per question.

An answer worth keeping saves straight back into the workspace as a note,
solution, ADR or task — indexed like anything else, so the next conversation
can cite it. Point at any earlier turn to rewind there, or edit the question and
ask again; everything after it is replaced rather than left dangling.

**The vault is never part of this.** Vault items are not indexed, cannot be
selected as a source, and are dropped even if a stored conversation asks for
them. The model can say a credential exists and where it is filed. It can never
read one.

With Ollama stopped, retrieval still works on its own at
`/intelligence/retrieval` — it returns your own passages, just with nothing
written on top of them.

## Build phases

Built in eight phases against a fixed specification. All of them are done; the
table is kept because it is the fastest map of where anything lives.

| Phase | Scope                                                                                                                                     | State    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1     | Foundation: Docker, Postgres, Prisma, auth, design system, shell, navigation, command palette, dashboard, activity, settings, diagnostics | **done** |
| 2     | Projects, notes, tasks, tags, documents, global search                                                                                    | **done** |
| 3     | Repositories, snippets, commands, solutions, issues, ADRs, meetings, ideas, learning, bookmarks                                           | **done** |
| 4     | Servers, databases, environments, domains, SSL, deployments, project graph                                                                | **done** |
| 5     | Vault: encryption, passwords, API keys, SSH, TOTP, audit log                                                                              | **done** |
| 6     | Embeddings, pgvector, retrieval, the intelligence console                                                                                 | **done** |
| 7     | Expiry scans, notifications, background jobs, backups, export                                                                             | **done** |
| 8     | Optional integrations (GitHub, GitLab, Cloudflare)                                                                                        | **done** |

## Forgetting your password

There is no reset-by-email flow, and there will not be one: it would mean a
mail server, a token table and a new way in, to recover a single-user
application whose owner already has a shell on the machine. That shell is the
recovery path:

```bash
npm run auth:reset-password -- you@example.com     # prompts, input hidden
```

It signs out every existing session, because a refresh token that survives a
password reset defeats the reset.

**The vault is not covered by this.** Its master password is a separate secret,
and the key that decrypts your secrets is derived from it — not from the login
password. That is deliberate: a reset run on the server must not be able to
open the vault. If the master password is what is lost, nothing can recover it.

## Running the background jobs

Nothing happens on a schedule until a worker is consuming the queue:

```bash
npm run worker
```

It shares the API's module graph but has no HTTP listener, so a scan over every
certificate never competes with a request. Without it the application is fully
usable — the scans just have to be run from Settings › Automation, which does
exactly the same work.

## What is optional

Everything below can stay unconfigured, and the application is complete without
it. None of these is a dependency of anything else.

| Feature             | Without it                                                                  |
| ------------------- | --------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Retrieval still runs and returns your own passages — just no written answer |
| `OPENAI_API_KEY`    | Search matches words rather than meaning, offline, with no account          |
| Ollama              | No console; retrieval still returns your passages at `/intelligence/retrieval` |
| `MAIL_HOST`         | Notifications stay in the app and in the browser                            |
| GitHub / GitLab     | Repository records are whatever you typed                                   |
| Cloudflare          | Domains are entered by hand                                                 |
| A running worker    | Scans and backups run when you press the button instead of overnight        |

AWS, GCP and Docker are deliberately **not** integrated. AWS needs request
signing, which means a large SDK; Docker needs a local socket or shell
execution, which the specification rules out for this build. They are named as
unbuilt rather than shown as toggles that do nothing.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the pieces fit and why
- [`docs/SECURITY.md`](docs/SECURITY.md) — the threat model and every control
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — running it for real
- [`docs/BACKUP.md`](docs/BACKUP.md) — backup and restore, including the vault
- `/api/docs` — generated API reference (development only)
