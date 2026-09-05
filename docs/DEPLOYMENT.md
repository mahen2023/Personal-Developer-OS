# Deployment

The target is one machine you control — a home server, a VPS, or a spare box.
There is no cluster, no managed service and no vendor to sign up with.

## Docker Compose (recommended)

```bash
cp .env.example .env      # fill in the three secrets, set COOKIE_SECURE=true
docker compose up -d
docker compose exec api npx prisma migrate deploy
```

Services: `postgres`, `redis`, `api`, `worker`, `web`. The API and worker share
one image and one codebase — the worker simply boots without an HTTP listener, so
document processing and embedding never compete with requests.

Check it came up:

```bash
docker compose ps
curl -s localhost:4002/api/ready | jq
```

The stack publishes 3002 (web) and 4002 (API), leaving 3000 and 4000 free for
`npm run dev` on the same machine. Inside the compose network the services still
listen on 3000 and 4000 and address each other by name.

## Local AI

The Developer Intelligence console talks to Ollama, which is deliberately not a
compose service: it wants the host's GPU, and running it in a container beside
the app would give it neither. The API container reaches the host through
`host.docker.internal`, which compose maps on Linux too via `extra_hosts`.

```bash
OLLAMA_BASE_URL=http://host.docker.internal:11434   # the default under compose
OLLAMA_BASE_URL=http://192.168.1.20:11434           # Ollama on another machine
```

Ollama binds to loopback by default. To reach it from a container or another
host, start it with `OLLAMA_HOST=0.0.0.0` — and put it behind the same firewall
as everything else, because Ollama has no authentication of its own.

If nothing answers there, the console says so and the rest of the application
carries on: search, retrieval and every other module work with no model at all.

## Behind a reverse proxy

Terminate TLS in front and forward both origins. Nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name devos.example.com;

  ssl_certificate     /etc/letsencrypt/live/devos.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/devos.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3002;
    # The console streams answers token by token. Without this nginx holds the
    # response until it has a buffer's worth, and a working console looks frozen.
    proxy_buffering off;
    proxy_read_timeout 300s;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Only the web service needs to be reachable. The API is called through the Next
proxy, so port 4002 can stay bound to localhost or the compose network.

Then in `.env`:

```
NODE_ENV=production
COOKIE_SECURE=true
COOKIE_DOMAIN=devos.example.com
WEB_ORIGIN=https://devos.example.com
ALLOW_REGISTRATION=false
```

`COOKIE_SECURE=false` in production is a startup error, not a warning — the app
refuses to boot rather than issue cookies that can travel in the clear.

`trust proxy` is set on the Express instance, so `X-Forwarded-For` becomes the
real client IP for the rate limiter and the audit log. Do not expose the API
directly to the internet with that enabled — a client could then forge its own
address.

## Without Docker

```bash
npm ci
npm run build
npm run db:deploy -w @devos/api

node apps/api/dist/main.js          # api
node apps/api/dist/worker.js        # worker
npm run start -w @devos/web         # web
```

Run each under systemd or pm2. Postgres 16+ and Redis 7+ are the only external
requirements.

## Upgrading

```bash
git pull
docker compose build
docker compose up -d
docker compose exec api npx prisma migrate deploy
```

Take a backup before a release that includes a migration. `prisma migrate
deploy` never prompts and never drops data, but a restore is only possible if a
backup exists.

## After it is running

1. Register your account, then set `ALLOW_REGISTRATION=false` and restart.
2. Confirm `/settings/diagnostics` shows the database as `ok`.
3. Set up the backup job in [BACKUP.md](BACKUP.md).
4. Store `VAULT_ENVELOPE_KEY` somewhere the database backup is not.

## Health endpoints

| Endpoint      | Answers               | Touches the database |
| ------------- | --------------------- | -------------------- |
| `/api/health` | Is the process up?    | No                   |
| `/api/ready`  | Can it serve traffic? | Yes                  |

Point your restart policy at `/health` and your monitoring at `/ready`. Using
`/ready` for restarts means a brief database blip restarts a perfectly healthy
API process.
