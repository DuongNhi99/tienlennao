# Implementation checklist

Legend: ✅ done and verified · 🟡 partial · ⏳ pending · ⛔ blocked

## Phase 1 — Foundation ✅

| Item                               | Status | Evidence                                                                                         |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| Inspect repository                 | ✅     | Empty apart from the specification                                                               |
| pnpm workspace monorepo            | ✅     | `pnpm-workspace.yaml`, 3 packages                                                                |
| Next.js + Tailwind                 | ✅     | `next build` passes; `/` and `/status` render                                                    |
| NestJS                             | ✅     | `nest build` passes; `node dist/main.js` serves `/api/v1`                                        |
| Prisma + PostgreSQL                | ✅     | Init migration applied on PostgreSQL 17 (UTF8); 22 tables, 17 CHECKs                             |
| Redis                              | 🟡     | Client and readiness check implemented and tested with stubs; no Redis server on the dev machine |
| Shared contracts                   | ✅     | `@tienlen/shared`: errors, health, lifecycle tables                                              |
| Lint, format, env validation       | ✅     | ESLint 9, Prettier 3, Zod env schemas (server + web)                                             |
| Health checks                      | ✅     | `/health/live`, `/health/ready` (503 when degraded)                                              |
| Structured logs + request IDs      | ✅     | pino JSON logs, `x-request-id` propagation, credential redaction                                 |
| Docker Compose (PostgreSQL, Redis) | 🟡     | Written; not executed (no Docker on the dev machine)                                             |
| CI pipeline                        | 🟡     | Written; not yet run (the repository is not on GitHub yet)                                       |
| Seed                               | ✅     | Idempotent; verified by running it twice                                                         |

## Phase 2 — UI and PWA ⏳

Design system, landing page, login/registration screens, lobby, waiting room, responsive
game table (development mock data behind an explicit boundary), manifest, icons, service
worker, offline fallback, install prompts.

## Phase 3 — Authentication and profile ⏳

Registration (Argon2id), server-managed sessions (HttpOnly cookie plus a hashed token in the
`sessions` table), login rate limiting, logout and logout-all, password reset, email
verification, profile and stats, role guards, Google OAuth (optional).

## Phase 4 — Game engine ⏳

Written rule specification for all regional variants, deck/shuffle/deal, combination
classification and comparison, turn state machine, match resolution, exhaustive unit tests.

## Phase 5 — Multiplayer and rooms ⏳

Rooms, matchmaking, Socket.IO contract in `@tienlen/shared`, authoritative actions,
idempotent action IDs, state versions, reconnect, per-player snapshots.

## Phase 6 — Wallet and rewards ⏳

Ledger service, entry-fee policy, exactly-once settlement, refunds, daily rewards,
concurrency and idempotency tests.

## Phase 7 — History, leaderboard, admin ⏳

## Phase 8 — Quality and deployment ⏳

Dockerfiles for web and server, Playwright end-to-end tests, load tests, deployment and
backup documentation.

## Decisions recorded so far

- **Room lifecycle:** FINISHED, CANCELLED and EXPIRED are terminal. A rematch creates a new
  room so every match has a clean, auditable lifecycle.
- **Match lifecycle:** RESOLVING means play has ended and placements and settlement are being
  computed. Any non-terminal state may move to ABORTED.
- **One seat per user** across all rooms, enforced by a unique `room_players.userId`. Seat rows
  are deleted when a player leaves or the room closes.
- **Ledger:** append-only; signed `amount` (credit > 0, debit < 0); `balanceAfter` stored;
  idempotency key unique per user.
- **Boot without dependencies:** the API starts even if PostgreSQL or Redis are down, and
  readiness reports 503 so orchestrators withhold traffic.
