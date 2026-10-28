# Tiến Lên Online

A Vietnamese multiplayer card game (**Tiến Lên Miền Nam**, four players) delivered as a
responsive, installable **Next.js PWA** with a **NestJS** backend.

> All coin values are **virtual game points**. There are no deposits, withdrawals, payments,
> or real-world prize redemption. Adding any of these requires a separate legal, compliance,
> and security review first.

**Status:** Phase 1 (Foundation) is complete. See [docs/IMPLEMENTATION_CHECKLIST.md](docs/IMPLEMENTATION_CHECKLIST.md).

---

## Architecture

```text
.
├── apps/
│   ├── web/            Next.js 16 (App Router) + React 19 + Tailwind CSS 4 — the PWA client
│   └── server/         NestJS 11 — REST API (/api/v1), Socket.IO gateway (Phase 5)
│       ├── prisma/     Prisma schema, migrations, seed (PostgreSQL)
│       └── src/        config · common · prisma · redis · health · (feature modules per phase)
├── packages/
│   └── shared/         Zod schemas, error codes, lifecycle state machines, constants
│                       shared by web and server (compiled to CommonJS in dist/)
├── scripts/            embedded-postgres.mjs — Docker-less PostgreSQL for local dev
├── docker-compose.yml  PostgreSQL 17 + Redis 7 for local development
└── .github/workflows/  CI: format, lint, typecheck, test, migrate, seed, build
```

Boundaries:

- **The server is authoritative** for game state, room membership, turn order, and coin
  balances. The web app never submits balances, winners, or card ownership.
- **`@tienlen/shared`** is the single source of truth for API contracts (Zod schemas), error
  codes plus Vietnamese messages, and the room/match lifecycle transition tables. The Prisma
  enums are tested against these tables (`apps/server/test/schema-contract.test.ts`).
- Game rules will live in a framework-free engine module (Phase 4), never in React components.

### Technology versions

| Area    | Choice                                                  |
| ------- | ------------------------------------------------------- |
| Runtime | Node.js ≥ 20.19, pnpm 10 workspaces                     |
| Web     | Next.js 16, React 19, Tailwind CSS 4, Zod 4             |
| Server  | NestJS 11 (Express 5), nestjs-pino, helmet, ioredis 5   |
| Data    | PostgreSQL 17, Prisma 6.19, Redis 7                     |
| Quality | TypeScript 5.9 (strict), ESLint 9, Prettier 3, Vitest 3 |

Version notes (deliberate pins):

- **Prisma 6.19** rather than 7.x: 7.x requires driver adapters and an ESM-first generated
  client, which would complicate the CommonJS NestJS build. Revisit when upgrading.
- **ESLint 9** rather than 10: `eslint-config-next` depends on `eslint-plugin-react` and
  `eslint-plugin-import`, which do not yet declare ESLint 10 support.
- **TypeScript 5.9** rather than 7.x: the NestJS toolchain relies on `emitDecoratorMetadata`.
- **Prisma lives in `apps/server/prisma/`**, not at the repository root as the original plan
  sketched: the ORM is a server concern, and this keeps client generation and the seed's
  module resolution straightforward under pnpm.

## Prerequisites

- Node.js **20.19+** (`node -v`)
- pnpm **10** (`npm i -g pnpm@10` or `corepack enable`)
- PostgreSQL 17 and Redis 7, via **one** of:
  - Docker Desktop: `pnpm services:up` (recommended)
  - No Docker: `pnpm db:embedded` runs a real PostgreSQL from npm binaries (dev only).
    There is no equivalent Redis fallback; install Redis (or Memurai on Windows) separately.
    Without Redis the API still starts, but `/health/ready` reports `degraded` (HTTP 503).

## Getting started

```bash
pnpm install
cp .env.example .env            # adjust if needed; never commit .env
pnpm services:up                # or, without Docker: pnpm db:embedded (separate terminal)
pnpm db:deploy                  # apply migrations (use db:migrate when changing the schema)
pnpm db:seed                    # reference data: default rule preset, achievements
pnpm dev                        # web on :3000, API on :4000
```

Then open:

- http://localhost:3000 — web app
- http://localhost:3000/status — live dependency status, rendered by the web server via the API
- http://localhost:4000/api/v1/health/live and `/health/ready` — API probes

## Environment variables

All variables live in one root `.env` (see [.env.example](.env.example)). The server validates
its environment with Zod at startup and refuses to boot when it is invalid. The error lists
variable names, never their values.

| Variable                 | Used by        | Required | Default                        | Notes                                        |
| ------------------------ | -------------- | -------- | ------------------------------ | -------------------------------------------- |
| `DATABASE_URL`           | server, Prisma | yes      | —                              | `postgresql://…`                             |
| `REDIS_URL`              | server         | no       | `redis://localhost:6379`       | `redis://` or `rediss://`                    |
| `PORT`                   | server         | no       | `4000`                         |                                              |
| `WEB_ORIGIN`             | server         | no       | `http://localhost:3000`        | Comma-separated CORS allow-list (http/https) |
| `LOG_LEVEL`              | server         | no       | `info`                         | `silent` … `trace`                           |
| `NEXT_PUBLIC_API_URL`    | web (browser)  | no       | `http://localhost:4000/api/v1` | Inlined at build time                        |
| `API_INTERNAL_URL`       | web (server)   | no       | `NEXT_PUBLIC_API_URL`          | API base URL from inside the network         |
| `NEXT_PUBLIC_UI_PREVIEW` | web (build)    | no       | `false`                        | Mock data on signed-in screens; never deploy |
| `POSTGRES_*`             | docker compose | no       | see `.env.example`             | Must match `DATABASE_URL`                    |

External services that will need credentials in later phases (email delivery, Google OAuth,
web push/VAPID) are documented here as each is implemented. None are required for Phase 1.

## Commands

| Command                               | What it does                                                        |
| ------------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                            | Build shared, then run shared (watch), server (watch), web (dev)    |
| `pnpm build`                          | Production build of all packages (topological order)                |
| `pnpm check`                          | format:check + lint + typecheck + test                              |
| `pnpm lint`                           | ESLint (type-aware for server/shared; Next rules for web)           |
| `pnpm typecheck`                      | `tsc --noEmit` everywhere (web runs `next typegen` first)           |
| `pnpm test`                           | Vitest in every package                                             |
| `pnpm format`                         | Prettier write                                                      |
| `pnpm db:migrate`                     | `prisma migrate dev` (create and apply migrations in development)   |
| `pnpm db:deploy`                      | `prisma migrate deploy` (apply committed migrations; CI/production) |
| `pnpm db:seed`                        | Idempotent seed of reference data                                   |
| `pnpm db:studio`                      | Prisma Studio                                                       |
| `pnpm db:embedded`                    | Docker-less PostgreSQL (dev only, data in `.local/pgdata`)          |
| `pnpm services:up`                    | Start PostgreSQL + Redis containers                                 |
| `pnpm --filter @tienlen/web test:e2e` | Playwright: production build in preview mode, 3 viewports           |
| `pnpm --filter @tienlen/web icons`    | Regenerate the PWA PNG icons from `apps/web/assets/logo.svg`        |

Production start: `pnpm --filter @tienlen/server start` (runs `dist/main.js`) and
`pnpm --filter @tienlen/web start`.

Playwright needs Chromium once: `pnpm --filter @tienlen/web exec playwright install chromium`.
Set `E2E_SCREENSHOT_DIR` to save screenshots of the main screens for visual review.

## UI preview mode and PWA (Phase 2)

The signed-in screens (lobby, waiting room, game table, profile, …) need the backend from
Phases 3 and 5. Until then they run only in **UI preview mode**: build or start the web app
with `NEXT_PUBLIC_UI_PREVIEW=true` and they use the in-memory mock in
`apps/web/lib/dev-preview/`, with a visible "preview" banner on every screen. Without the
flag, those routes redirect to `/login`. The login and registration forms always call the
real API; they do not fake success. The mock does not validate card combinations (Phase 4),
and its bots only play single cards.

PWA behaviour:

- Manifest at `/manifest.webmanifest` (standalone, starts at `/lobby`), 192/512 px and
  maskable icons, and an Apple touch icon.
- Service worker at `/sw.js`, versioned by the build ID (`BUILD_ID`, otherwise the git
  commit). Hashed static assets are cache-first. Page navigations are network-only and fall
  back to a pre-cached `/offline` page. HTML and API responses are never cached, because
  signed-in pages contain private data.
- Install prompt: browsers that fire `beforeinstallprompt` (Chrome, Edge, Android) get an
  install button. iOS/iPadOS Safari gets "Share → Add to Home Screen" instructions. Other
  browsers show nothing.

## API conventions (implemented so far)

- Every route is under **`/api/v1`**.
- Every response carries an **`x-request-id`** header. A well-formed incoming ID
  (`[A-Za-z0-9_-]{8,64}`) is propagated; otherwise a UUID is generated. The same ID appears
  in the server logs and in error bodies.
- Errors use one envelope (`apiErrorSchema` in `@tienlen/shared`):

  ```json
  {
    "error": {
      "code": "NOT_FOUND",
      "message": "Không tìm thấy nội dung yêu cầu.",
      "requestId": "…"
    }
  }
  ```

  Clients branch on `code`. Messages are Vietnamese and never contain stack traces or
  framework internals. Validation errors add `details: [{ path, message }]`.

| Method | Path                   | Auth | Response                                                              |
| ------ | ---------------------- | ---- | --------------------------------------------------------------------- |
| GET    | `/api/v1/health/live`  | none | `200 { status: "ok", uptimeSeconds }`                                 |
| GET    | `/api/v1/health/ready` | none | `200`/`503 { status: "ok"\|"degraded", checks: { database, redis } }` |

Each dependency check returns `{ status: "up" | "down", latencyMs }` and times out after 2 s.
Failure details are logged server-side only. The full REST and WebSocket contracts are
documented here as each phase implements them.

## Data model

[`apps/server/prisma/schema.prisma`](apps/server/prisma/schema.prisma) defines all entities:
users, profiles, OAuth accounts, sessions, email-verification and password-reset tokens,
wallets, the append-only wallet ledger, rooms, seats, matches, match players, match events,
reward claims, achievements, notifications, chat, reports, the admin audit log, and versioned
game-rule presets.

Integrity is enforced in the database, not only in application code:

- Unique: email; room code; one seat per user across all rooms (`room_players.userId`); seat
  and placement per match; ledger idempotency key per user; reward claim per
  user/type/period; match event sequence and action ID per match.
- CHECK constraints (in the init migration): non-negative wallet balance and ledger
  `balanceAfter`; non-zero ledger amounts; seats 0–3; placements 1–4; four-player rooms;
  non-negative fees.
- History-bearing relations use `onDelete: Restrict`, and users are soft-deleted.
- Retention defaults are documented at the top of the schema.

## Known limitations

- No Redis on the development machine used to verify Phase 1, so readiness was observed as
  `degraded`. The Redis code path is covered by the stubbed e2e tests only.
- Docker files were written but not executed on the verification machine, which has no Docker.
  CI runs against real PostgreSQL and Redis service containers.
- Signed-in screens work only in UI preview mode until Phases 3 (auth) and 5 (rooms) land.
  Wallet, history, leaderboard and notification pages are placeholders for Phases 6–7.
- Installability and offline behaviour are tested automatically in Chromium only, the one
  browser installed on the verification machine. iOS Safari and Firefox were not tested.
- On Windows, stop `pnpm db:embedded` with Ctrl+C. If the process is killed instead, stop the
  orphaned server with `pg_ctl -D .local/pgdata stop` (the binary is under
  `node_modules/.pnpm/@embedded-postgres+windows-x64*/…/native/bin`).

## Troubleshooting

- **`Environment variable not found: DATABASE_URL`** when running Prisma directly: use the
  `pnpm db:*` scripts. They load the root `.env` through `dotenv-cli`.
- **`character … has no equivalent in encoding "WIN1252"`**: the PostgreSQL cluster was
  created with a non-UTF-8 encoding. The embedded script forces UTF-8; for an existing bad
  cluster, delete `.local/pgdata` and restart `pnpm db:embedded`.
- **`EPERM … rename` during `pnpm install` on Windows**: antivirus or the indexer locked a
  file; re-run `pnpm install`.
