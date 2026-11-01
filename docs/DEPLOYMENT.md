# Deployment and operations

How to run Tiến Lên Online in production, scale it, back it up and recover it. Read this
together with the README (architecture, environment variables, API) and
[ECONOMY.md](ECONOMY.md) (coin rules).

## 1. What runs where

| Component  | Image / service                  | Notes                                                                      |
| ---------- | -------------------------------- | -------------------------------------------------------------------------- |
| Web        | `apps/web/Dockerfile`            | Next.js standalone server, port 3000. Stateless.                           |
| API        | `apps/server/Dockerfile`         | NestJS REST + Socket.IO, port 4000. Stateless apart from avatar files.     |
| Migrations | same image as the API            | One-off job before each release: `prisma migrate deploy`, then the seed.   |
| PostgreSQL | managed service or `postgres:17` | The only source of truth: accounts, rooms, matches, ledger, queue.         |
| Redis      | managed service or `redis:7`     | Rate limits and Socket.IO fan-out between API instances. Not durable data. |
| Avatars    | volume at `UPLOAD_DIR`           | Shared storage when there is more than one API instance.                   |

`pnpm app:up` (Docker Compose, profile `app`) starts exactly this set locally: PostgreSQL,
Redis, the migration job, the API and the web app on <http://localhost:3000>.

## 2. Domain, HTTPS and the reverse proxy

**Recommended: one origin.** Serve the web app and the API from the same host, with the
proxy sending `/api/` to the API. The session cookie is then first-party and host-only, there
is no CORS, and the Socket.IO path (`/api/v1/socket.io`) needs no special handling beyond
WebSocket upgrades.

```caddyfile
# Caddy: automatic HTTPS certificates.
tienlen.example {
  encode zstd gzip
  handle /api/* {
    reverse_proxy api-1:4000 api-2:4000 {
      lb_policy ip_hash          # sticky sessions for Socket.IO long-polling
      health_uri /api/v1/health/ready
    }
  }
  handle {
    reverse_proxy web:3000
  }
}
```

```nginx
# nginx: terminate TLS elsewhere or add your ssl_certificate lines here.
upstream api { ip_hash; server api-1:4000; server api-2:4000; }
server {
  listen 443 ssl http2;
  server_name tienlen.example;
  location /api/ {
    proxy_pass http://api;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;     # WebSocket upgrade for Socket.IO
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;                    # longer than the Socket.IO ping interval
  }
  location / { proxy_pass http://web:3000; proxy_set_header Host $host; }
}
```

Then configure:

| Variable              | Value for `https://tienlen.example`                           |
| --------------------- | ------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `https://tienlen.example/api/v1` (web **build** argument)     |
| `API_INTERNAL_URL`    | `http://api:4000/api/v1` (web runtime; server-side rendering) |
| `WEB_ORIGIN`          | `https://tienlen.example`                                     |
| `WEB_APP_URL`         | `https://tienlen.example` (links in emails)                   |
| `API_PUBLIC_URL`      | `https://tienlen.example/api/v1` (avatar URLs)                |
| `TRUST_PROXY`         | `1` (one proxy in front; use the real number of hops)         |

**Separate subdomains** (`app.` and `api.`) also work: set `COOKIE_DOMAIN=tienlen.example`,
`WEB_ORIGIN=https://app.tienlen.example`, and build the web image with the API's public URL.

Production requirements: HTTPS everywhere (the cookie is `Secure` when `NODE_ENV=production`),
`TRUST_PROXY` set to the real number of proxies (otherwise per-IP rate limits see the proxy's
address, or clients can spoof theirs), and `SMTP_URL` for verification and password-reset email.

## 3. Configuration checklist

API (see the README for every variable and default):

- [ ] `DATABASE_URL` — PostgreSQL 17, UTF-8, a user that can run migrations.
- [ ] `REDIS_URL` — required for more than one API instance; recommended always.
- [ ] `SOCKET_IO_REDIS_ADAPTER=true` — whenever there is more than one API instance.
- [ ] `WEB_ORIGIN`, `WEB_APP_URL`, `API_PUBLIC_URL`, `TRUST_PROXY`, `COOKIE_DOMAIN` if needed.
- [ ] `SMTP_URL`, `MAIL_FROM`.
- [ ] `UPLOAD_DIR` on persistent storage (the image uses `/data/uploads`).
- [ ] `INITIAL_COIN_BONUS`, `SESSION_TTL_DAYS`, `ROOM_IDLE_MINUTES`, `RECONNECT_GRACE_SECONDS`
      if the defaults do not suit.

Web: `NEXT_PUBLIC_API_URL` at build time, `API_INTERNAL_URL` at runtime. Never set
`NEXT_PUBLIC_UI_PREVIEW` in a production build.

## 4. First deployment

```sh
# 1. Build and push images (CI does the build; tag with the git commit).
docker build -f apps/server/Dockerfile -t registry.example/tienlen-server:$SHA .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://tienlen.example/api/v1 \
  --build-arg BUILD_ID=$SHA -t registry.example/tienlen-web:$SHA .

# 2. Migrate and seed (idempotent), with the API image and production environment.
docker run --rm --env-file api.env registry.example/tienlen-server:$SHA \
  sh -c 'node_modules/.bin/prisma migrate deploy && node_modules/.bin/tsx prisma/seed.ts'

# 3. Start the API instance(s) and the web app; wait for /api/v1/health/ready to return 200.

# 4. Register your own account in the browser, then make it the first administrator.
docker run --rm --env-file api.env registry.example/tienlen-server:$SHA \
  node_modules/.bin/tsx prisma/set-role.ts you@example.com ADMIN
```

The seed stores the default rule preset (fees 0, 100, 500, 1000, 5000; turn timers 15, 30,
45 s) and the achievements. Change presets later in the admin area (`/admin/presets`); every
change is a new version and is audited.

## 5. Health checks

| Endpoint                    | Meaning                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `GET /api/v1/health/live`   | The process is up. Use for container restarts.                                      |
| `GET /api/v1/health/ready`  | 200 when PostgreSQL and Redis answer, 503 otherwise. Use for load-balancer routing. |
| `GET /manifest.webmanifest` | The web server is up (used by the web image's health check).                        |

Readiness reports 503 without Redis even though the API keeps working (rate limits fall back
to memory). If you run without Redis on purpose (single instance), route on `/health/live`.

## 6. Scaling to several API instances

Safe across instances: every game action and room change takes a PostgreSQL row lock, the
quick-match queue lives in PostgreSQL (with an advisory lock per entry fee), and overdue turns
are applied by a sweep that every instance runs every 2 seconds (each match is timed out
once, whichever instance gets there first). Settlement happens in the same locked transaction
that ends a match, so it runs exactly once.

To scale out:

1. Set `REDIS_URL` and `SOCKET_IO_REDIS_ADAPTER=true` on every instance. Notifications and
   presence ("connected" on seats) then reach sockets on every instance.
2. Enable **sticky sessions** (IP hash or a cookie) for `/api/`: Socket.IO starts with HTTP
   long-polling before upgrading to WebSocket, and those requests must reach one instance.
3. Put `UPLOAD_DIR` on shared storage (or one volume mounted on every instance).
4. Run the migration job once per release, not on every instance start.

The web app is stateless and can be scaled freely.

## 7. Backup and restore

**PostgreSQL holds everything that matters.** Redis only holds rate-limit counters and
Socket.IO fan-out; losing it loses nothing durable. Back up the avatar volume as files.

Daily logical backup (keep at least 14 days, and copies off the database host):

```sh
pg_dump --format=custom --no-owner --file=tienlen-$(date +%F).dump "$DATABASE_URL"
```

Also enable point-in-time recovery (WAL archiving) if your provider offers it; the ledger is
append-only and every coin movement since the last dump would otherwise be lost.

**Restore** (also run this as a drill every month, into a scratch database):

```sh
# 1. Stop the API (or put the site in maintenance) so nothing writes during the restore.
# 2. Restore into an empty database.
createdb tienlen_restore
pg_restore --no-owner --dbname=tienlen_restore tienlen-2026-11-02.dump
# 3. Check: the migration history is complete and the ledger reconciles.
DATABASE_URL=…/tienlen_restore node_modules/.bin/prisma migrate status
psql …/tienlen_restore -c "SELECT count(*) FROM wallets w WHERE balance <> \
  (SELECT coalesce(sum(amount),0) FROM wallet_transactions t WHERE t.\"walletId\" = w.id);"
# 4. Point DATABASE_URL at the restored database (or rename it) and start the API.
```

The reconciliation query must return 0. Matches that were running at backup time restore
in the PLAYING state; their turn deadlines are in the past, so the deadline sweep resumes or
times them out. If a running match must not continue, abort it in the admin area (fees are
refunded).

## 8. Releases, rollback and migrations

- Take a backup immediately before migrating a release.
- Migrations are forward-only. Keep them additive where possible (new tables and nullable
  columns), so the previous API version can keep running against the new schema; then a
  rollback is just deploying the previous image tag.
- A migration that removes or renames something needs two releases: first stop using it,
  then remove it.
- The service worker is versioned by `BUILD_ID`; browsers pick up a new release on the next
  navigation. Set `BUILD_ID` to the git commit when building the web image.

## 9. Monitoring and incidents

- Logs are JSON (pino) on stdout, without cookies, credentials or tokens. Every request has an
  `x-request-id` (also returned to the client) for correlation.
- Alert on: readiness 503, HTTP 5xx rate, `Deadline sweep failed` / `Turn timeout … failed`
  log lines, rising `TURN_TIMEOUT` counts (admin overview), open player reports.

| Symptom                               | Check / action                                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Readiness 503                         | Which check is `down` (`/health/ready` body); PostgreSQL first — Redis down degrades only rate limits and cross-instance notifications.               |
| Players do not see each other's moves | With several instances: `SOCKET_IO_REDIS_ADAPTER=true` everywhere, sticky sessions on `/api/`. The game still advances: clients refetch on reconnect. |
| A match is stuck                      | Admin → Ván đấu → the match: if PLAYING past its deadline, the sweep should move it within seconds; otherwise abort it (refunds every fee).           |
| Coins look wrong for a player         | Admin → user → ledger. Every change is a ledger row; correct with an audited adjustment, never by editing rows.                                       |
| Suspicious play                       | Flag the match for review, inspect its event log (including the deal), suspend if needed.                                                             |

## 10. Load testing

`apps/server/test/load/load-test.ts` plays complete matches concurrently the way browsers do:
REST commands, one Socket.IO connection per player, and every player refetching its view after
each move. Run it against a dedicated instance and a throwaway database:

```sh
cd apps/server
DATABASE_URL=…/tienlen_load pnpm exec tsx test/prepare-database.cli.ts
pnpm exec tsc -p tsconfig.build.json --outDir dist-e2e
NODE_ENV=production PORT=4300 TRUST_PROXY=1 DATABASE_URL=…/tienlen_load node dist-e2e/main.js &
LOAD_API_URL=http://localhost:4300/api/v1 LOAD_MATCHES=25 pnpm exec tsx test/load/load-test.ts
```

Result on the development machine (one API process, embedded PostgreSQL, no Redis, laptop
running the dev servers at the same time), 2 November 2026:

| Measure                          | Result                                |
| -------------------------------- | ------------------------------------- |
| Concurrent matches / players     | 25 / 100, all finished                |
| Duration, HTTP requests          | 33 s, 8 915 requests (269 per second) |
| Socket.IO notifications received | 31 797                                |
| HTTP errors                      | none                                  |
| Game actions (play/pass), ms     | p50 236, p95 461, p99 861             |
| Game views, ms                   | p50 125, p95 174, p99 371             |
| Registration (Argon2id), ms      | p50 344, p95 930                      |

Every player refetches after every move, so each action costs five requests; a real table
moves far more slowly (seconds per turn), so 25 tables at this pace correspond to several
hundred tables at human speed. Measure again on production-like hardware before launch.
