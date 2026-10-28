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

## Phase 2 — UI and PWA ✅

Playwright runs against a production build in three projects: phone 360×740 (touch), tablet
820×1180 (touch) and desktop 1366×820. Verified with `--repeat-each=2`: 90 runs, 90 passed.

| Item                                | Status | Evidence                                                                                                |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| Design system                       | ✅     | Tokens in `globals.css`; `components/ui` (button, fields, modal, confirm, toasts, states)               |
| Landing, terms, privacy, 404/error  | ✅     | `public.spec.ts`; no horizontal overflow at any viewport                                                |
| Login, registration, password reset | ✅     | Client validation with shared Zod schemas and Vietnamese messages; submissions call the real API        |
| Lobby                               | ✅     | Rooms with filters, quick play, join by code, daily reward, top 5, notifications (`lobby.spec.ts`)      |
| Waiting room                        | ✅     | Create a private room, seats, ready, leave with confirmation                                            |
| Responsive game table               | ✅     | Hand fits without scrolling; controls stay inside the viewport; touch multi-select (`game.spec.ts`)     |
| Mock data boundary                  | ✅     | `lib/dev-preview/`, only with `NEXT_PUBLIC_UI_PREVIEW=true`; banner on every screen; otherwise `/login` |
| Manifest and icons                  | ✅     | 192/512/maskable PNGs and Apple touch icon served (`pwa.spec.ts`)                                       |
| Service worker, offline fallback    | ✅     | Versioned `/sw.js` (`no-cache`); offline navigation shows a styled `/offline` page                      |
| Install prompts                     | 🟡     | `beforeinstallprompt` button plus iOS instructions; automated tests in Chromium only (see README)       |
| Placeholder screens                 | 🟡     | Wallet, history, leaderboard and notifications pages wait for Phases 6–7                                |

Fixes made while verifying Phase 2:

- Registration and reset forms now report a password mismatch even while another field (for
  example the terms checkbox) is invalid. Zod 4 skipped the refinement before.
- The header balance link announced only "Ví xu". Its accessible name now includes the balance.
- Card selection survives opponents' moves. Only cards that leave the hand drop out of it.
- Full-height screens (game table, app shell) subtract the preview banner's height
  (`h-screen-fit`), so the bottom of the hand is no longer cut off.

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
