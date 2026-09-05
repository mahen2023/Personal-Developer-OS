# Backup and restore

Two things must be backed up, and **they must not live in the same place**:

1. The database — every record, including vault ciphertext.
2. `VAULT_ENVELOPE_KEY` from `.env` — one half of the key that decrypts it.

A backup containing both is a backup of your plaintext secrets. Keep the key in a
password manager, a hardware token or an offline note; keep the dump wherever
dumps go.

## Manual backup

```bash
# Database
docker compose exec -T postgres pg_dump -U devos -Fc devos > devos-$(date +%F).dump

# Uploaded documents
docker run --rm -v devos_storage:/s -v "$PWD":/out alpine \
  tar czf /out/devos-storage-$(date +%F).tar.gz -C /s .
```

`-Fc` is the custom format: compressed, and restorable selectively with
`pg_restore`.

## Scheduled backup

A cron entry on the host, keeping 30 days:

```cron
0 3 * * * cd /srv/devos && \
  docker compose exec -T postgres pg_dump -U devos -Fc devos \
  > /backup/devos-$(date +\%F).dump && \
  find /backup -name 'devos-*.dump' -mtime +30 -delete
```

## The in-app backup

Settings › Automation writes a gzipped JSON document holding every record in the
account, and the worker repeats it nightly (`BACKUP_EVERY_DAYS`, keeping
`BACKUP_KEEP` files). Restore takes the same file back, in one of two modes:

- **merge** adds what is missing and changes nothing that already exists, so
  restoring twice is a no-op.
- **replace** deletes every record in the account first. It asks, in those
  words, and it is never the default.

Vault items are included as the ciphertext they already are. That file plus
`VAULT_ENVELOPE_KEY` plus your master password is your vault; any two of the
three are useless. Keep the key somewhere the backups are not.

**Use both.** The in-app backup is portable and restorable by the application
itself, on a machine with no Postgres tooling. `pg_dump` captures things the
application does not model — sequences, the exact schema, rows a future
migration has not accounted for — and it keeps working when the app does not,
which is precisely when you need a backup.

Two tables are deliberately excluded from the in-app backup: `sessions`, because
restoring a login that was signed out would be wrong, and `chunks`, because they
are derived from the records above them and are rebuilt by re-indexing.

## Restore

```bash
docker compose stop api worker web

docker compose exec -T postgres dropdb    -U devos --if-exists devos
docker compose exec -T postgres createdb  -U devos devos
docker compose exec -T postgres pg_restore -U devos -d devos --clean --if-exists \
  < devos-2026-09-01.dump

docker compose start api worker web
```

Then put the **same** `VAULT_ENVELOPE_KEY` back in `.env` before starting the
API. A restored database with a different envelope key leaves every vault item
permanently unreadable — the rest of the app works, which makes the problem easy
to miss until you need a secret.

## Verifying a backup

An untested backup is a hope, not a backup. Once a quarter:

```bash
docker run --rm -d --name devos-verify -e POSTGRES_PASSWORD=x -p 55432:5432 pgvector/pgvector:pg17
pg_restore -h localhost -p 55432 -U postgres -d postgres --clean --if-exists < latest.dump
psql -h localhost -p 55432 -U postgres -c "select count(*) from projects;"
docker rm -f devos-verify
```

## What is not backed up

- `node_modules`, build output — rebuilt from source.
- The Redis volume — it holds queue state only, and jobs are re-derivable.
- `.env` itself. Back up the secrets it contains, deliberately and separately.
