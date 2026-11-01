# Tiến Lên Online

A Vietnamese multiplayer card game (**Tiến Lên Miền Nam**, four players) delivered as a
responsive, installable **Next.js PWA** with a **NestJS** backend.

> All coin values are **virtual game points**. There are no deposits, withdrawals, payments,
> or real-world prize redemption. Adding any of these requires a separate legal, compliance,
> and security review first.

**Status:** Phases 1–4 (foundation, UI and PWA, accounts, game engine) are complete. See [docs/IMPLEMENTATION_CHECKLIST.md](docs/IMPLEMENTATION_CHECKLIST.md).

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
│   └── shared/         Zod schemas, error codes, lifecycle state machines, constants and
│                       the game engine, shared by web and server (CommonJS in dist/)
├── docs/               GAME_RULES.md (rule specification), IMPLEMENTATION_CHECKLIST.md
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
- **Game rules** live in a framework-free, deterministic engine in
  `packages/shared/src/game/` (see [Game rules and engine](#game-rules-and-engine-phase-4)),
  never in React components.

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
| `TRUST_PROXY`            | server         | no       | `0`                            | Reverse proxies whose X-Forwarded-For counts |
| `WEB_APP_URL`            | server         | no       | first `WEB_ORIGIN`             | Base of links in emails                      |
| `API_PUBLIC_URL`         | server         | no       | `http://localhost:PORT/api/v1` | Base of avatar URLs                          |
| `SESSION_TTL_DAYS`       | server         | no       | `30`                           | Idle timeout; absolute limit is 3×           |
| `COOKIE_DOMAIN`          | server         | no       | host-only                      | Parent domain if web/API are on subdomains   |
| `INITIAL_COIN_BONUS`     | server         | no       | `10000`                        | Coins credited once at registration          |
| `SMTP_URL`               | server         | prod     | —                              | `smtp://` or `smtps://`; see below           |
| `MAIL_FROM`              | server         | no       | `Tiến Lên Online <no-reply@…>` |                                              |
| `MAIL_OUTBOX_DIR`        | server         | no       | `.local/mail`                  | Dev outbox (relative to the API's directory) |
| `UPLOAD_DIR`             | server         | no       | `.local/uploads`               | Avatars; shared storage when scaled out      |

**Email.** With `SMTP_URL` set, emails go through SMTP. Without it, development writes each
email as a text file to `MAIL_OUTBOX_DIR` (`apps/server/.local/mail` under `pnpm dev`), so you
can open verification and reset links. In production without SMTP nothing is sent, and a
warning is logged at startup. Links are never written to the logs.

**Cookies across web and API.** The browser must send `tl_session` to both the API and the
web server (which checks the session before rendering signed-in pages). This works when both
run on the same host (as in development), or on sibling subdomains with
`COOKIE_DOMAIN=<parent domain>`. Web push/VAPID and Google OAuth credentials will be documented
when those features are built.

## Commands

| Command                                    | What it does                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `pnpm dev`                                 | Build shared, then run shared (watch), server (watch), web (dev)           |
| `pnpm build`                               | Production build of all packages (topological order)                       |
| `pnpm check`                               | format:check + lint + typecheck + test                                     |
| `pnpm lint`                                | ESLint (type-aware for server/shared; Next rules for web)                  |
| `pnpm typecheck`                           | `tsc --noEmit` everywhere (web runs `next typegen` first)                  |
| `pnpm test`                                | Vitest in every package                                                    |
| `pnpm format`                              | Prettier write                                                             |
| `pnpm db:migrate`                          | `prisma migrate dev` (create and apply migrations in development)          |
| `pnpm db:deploy`                           | `prisma migrate deploy` (apply committed migrations; CI/production)        |
| `pnpm db:seed`                             | Idempotent seed of reference data                                          |
| `pnpm db:studio`                           | Prisma Studio                                                              |
| `pnpm db:embedded`                         | Docker-less PostgreSQL (dev only, data in `.local/pgdata`)                 |
| `pnpm services:up`                         | Start PostgreSQL + Redis containers                                        |
| `pnpm test:integration`                    | API + real PostgreSQL (database `<name>_test`, created and emptied)        |
| `pnpm db:set-role <email> ADMIN`           | Grant (or with `PLAYER`, remove) the admin role; audited                   |
| `pnpm --filter @tienlen/web test:e2e`      | Playwright: production build in preview mode, 3 viewports                  |
| `pnpm --filter @tienlen/web test:e2e:auth` | Playwright against the real API on ports 3200/4100 (`<name>_e2e` database) |
| `pnpm --filter @tienlen/web icons`         | Regenerate the PWA PNG icons from `apps/web/assets/logo.svg`               |

Production start: `pnpm --filter @tienlen/server start` (runs `dist/main.js`) and
`pnpm --filter @tienlen/web start`.

Playwright needs Chromium once: `pnpm --filter @tienlen/web exec playwright install chromium`.
Set `E2E_SCREENSHOT_DIR` to save screenshots of the main screens for visual review.

## UI preview mode and PWA (Phase 2)

Normally the signed-in screens need a real account (Phase 3). Rooms and matches arrive in
Phase 5, so to work on those screens before then, build or start the web app with
`NEXT_PUBLIC_UI_PREVIEW=true`. **UI preview mode** skips sign-in and uses the in-memory mock
in `apps/web/lib/dev-preview/`, with a visible "preview" banner on every screen. The login and
registration forms always call the real API, even in preview mode. The mock does not
use the game engine yet (the real match flow arrives in Phase 5), and its bots only play
single cards.

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

## Game rules and engine (Phase 4)

The rule specification is [docs/GAME_RULES.md](docs/GAME_RULES.md). It settles every
regional variant: card and suit order, combinations, which bombs beat what, the opening rule,
passing, how the lead moves after a player finishes, how a match ends, instant wins,
leftover penalties and the timeout action. Configurable rules are a `GameRules` object
validated by `gameRulesSchema`. `pnpm db:seed` stores the default as preset `default`
version 2. Presets are never edited in place; a match copies its preset into
`matches.ruleSnapshot`.

The engine (`@tienlen/shared`, `packages/shared/src/game/`) is pure TypeScript with no
framework, clock or I/O. The server runs it as the authority (Phase 5); the web client may
use the same functions for instant feedback, but the server decides.

| Module             | Functions                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `deck.ts`          | `createDeck`, `shuffleDeck` (CSPRNG by default), `dealCards`, `createSeededRandom` (tests) |
| `cards.ts`         | `sortCards`, `compareCards`, `cardStrength`                                                |
| `combinations.ts`  | `classifyCombination`, `validateCombination`, `canBeatCombination`, `listCombinations`     |
| `hand-analysis.ts` | `detectInstantWin`, `scoreLeftoverHand`                                                    |
| `engine.ts`        | `startMatch`, `determineOpeningPlayer`, `applyPlay`, `applyPass`, `applyTimeout`,          |
|                    | `advanceTurn`, `resolveTrick`, `legalPlays`, `determineWinner`, `calculateMatchResult`     |

Actions return `{ ok: true, state, events }` or `{ ok: false, violation }`. They never
mutate their input. `GAME_VIOLATION_ERROR_CODES` maps each violation to an API error code.
Event types match the `MatchEventType` database enum. Match states are plain JSON, ready for
`matches.stateSnapshot`.

Tests: `pnpm --filter @tienlen/shared test`. Besides rule-by-rule cases, the suite checks
every 2- and 3-card selection against an independent definition and compares
`listCombinations` with the full power set of random 13-card hands. It also plays 900 seeded
random matches across three rule sets, checking card conservation, turn order, pass lockout,
immutability and placements after every action.

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

### Authentication and sessions (Phase 3)

- **Server-managed sessions.** Sign-in sets the `tl_session` cookie: 32 random bytes,
  `HttpOnly`, `SameSite=Lax`, `Secure` in production. The `sessions` table stores only the
  SHA-256 hash. Every request is checked against the database, so logout, password reset and
  suspension take effect immediately. Sessions slide: `SESSION_TTL_DAYS` of inactivity, and
  at most 3× that in total. There is no refresh token, and the web app never sees or stores
  the token.
- **Deny by default.** Every route requires a session unless it is marked `@Public()`.
  `@Roles('ADMIN')` is enforced on the server.
- **CSRF.** Besides `SameSite=Lax`, state-changing requests that carry an `Origin` header must
  come from `WEB_ORIGIN`, and `Sec-Fetch-Site: cross-site` is rejected.
- **Passwords.** Argon2id (19 MiB, t=2, p=1). Unknown emails still run a hash, so response time
  does not reveal which accounts exist.
- **Rate limits** (fixed windows, in Redis; in-process memory if Redis is down):
  login 20/15 min per IP and 10/15 min per email; registration 10/h per IP; forgot-password
  10/h per IP and 3/h per email (the email limit is silent); token links 30/h per IP; resending
  verification 3/h per user. Exceeding a limit returns `429 RATE_LIMITED` with `Retry-After`.
- **Email tokens.** Verification links last 24 h; reset links last 30 min. Both are
  single-use, and only the latest link works. A password reset signs out every device and also
  counts as email verification.
- **Web app.** `proxy.ts` sends visitors without a session cookie to
  `/login?next=…`. `app/(game)/layout.tsx` then verifies the session with `GET /auth/me`.
  Rooms, matches, rewards, leaderboard and notifications return `FEATURE_UNAVAILABLE`
  ("Sắp ra mắt") until Phases 5–7.
- **Google OAuth** (optional in the specification) is **not implemented yet**.

| Method | Path                          | Auth    | Success                                   | Errors                                                           |
| ------ | ----------------------------- | ------- | ----------------------------------------- | ---------------------------------------------------------------- |
| POST   | `/auth/register`              | none    | `201 { user }` + cookie                   | `400 VALIDATION_ERROR`, `409 EMAIL_ALREADY_EXISTS`, 429          |
| POST   | `/auth/login`                 | none    | `200 { user }` + cookie                   | `401 INVALID_CREDENTIALS`, `403 ACCOUNT_SUSPENDED`, 429          |
| POST   | `/auth/logout`                | none    | `204` (clears the cookie)                 | —                                                                |
| POST   | `/auth/logout-all`            | session | `204` (revokes every session)             | 401                                                              |
| GET    | `/auth/me`                    | session | `200 { user }`                            | `401 UNAUTHENTICATED`/`SESSION_EXPIRED`, `403 ACCOUNT_SUSPENDED` |
| POST   | `/auth/forgot-password`       | none    | `202 { message }` (always)                | 400, 429                                                         |
| POST   | `/auth/reset-password`        | none    | `200 { message }`                         | `400 INVALID_TOKEN`, 429                                         |
| POST   | `/auth/verify-email`          | none    | `200 { message }`                         | `400 INVALID_TOKEN`, 429                                         |
| POST   | `/auth/resend-verification`   | session | `202 { message }`                         | 401, 429                                                         |
| GET    | `/users/me`                   | session | `200 CurrentUserSummary`                  | 401                                                              |
| PATCH  | `/users/me`                   | session | `200 CurrentUserSummary`                  | 400, 401                                                         |
| GET    | `/users/me/stats`             | session | `200 UserStats`                           | 401                                                              |
| PUT    | `/users/me/avatar`            | session | `200 CurrentUserSummary`                  | `400` (not PNG/JPEG/WebP), `413` (> 2 MB), 401                   |
| DELETE | `/users/me/avatar`            | session | `200 CurrentUserSummary`                  | 401                                                              |
| GET    | `/avatars/:file`              | none    | `200 image/webp` (immutable)              | 404                                                              |
| PATCH  | `/admin/users/:userId/status` | ADMIN   | `200 { userId, status, revokedSessions }` | `403 FORBIDDEN`, 404, 400                                        |

Paths are relative to `/api/v1`. `{ user }` is `AuthUser` (`id, email, displayName, role,
emailVerified`); schemas live in `@tienlen/shared`. Avatar uploads are multipart
(`avatar` field). The server decodes each one and re-encodes it as a 256×256 WebP, so only
real images survive. Suspending a user requires a reason, revokes their sessions, and is
written to `admin_audit_logs`. Admins cannot suspend themselves. The first admin is created
from the command line: `pnpm db:set-role <email> ADMIN`.

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
- With a real account, the lobby shows "Sắp ra mắt" for rooms, quick play, rewards,
  leaderboard and notifications until Phases 5–7. Wallet and history pages are placeholders.
- Google OAuth is not implemented (optional in the specification).
- Rate limiting falls back to per-process memory when Redis is unreachable. With several API
  instances and no Redis, the effective limits are multiplied by the number of instances.
- Avatars are stored on local disk (`UPLOAD_DIR`). Several API instances need shared storage
  (for example a mounted volume) or an object-storage adapter.
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
