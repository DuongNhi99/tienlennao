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

## Phase 3 — Authentication and profile ✅

Integration tests run the API against a real PostgreSQL database (`pnpm test:integration`):
3 files, 35 tests, all passed. The Playwright auth suite is `apps/web/e2e-auth/`.

| Item                                     | Status | Evidence                                                                                 |
| ---------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| Registration (Argon2id), duplicate email | ✅     | `auth.test.ts`; profile, wallet and initial bonus created together                       |
| Login, server-managed sessions           | ✅     | HttpOnly cookie, SHA-256 token hash in `sessions`, sliding expiry                        |
| Logout and logout-all                    | ✅     | Sessions revoked server-side; checked on every request                                   |
| Login and email rate limits              | ✅     | Redis fixed windows with in-memory fallback; 429 with `Retry-After`                      |
| Password reset, email verification       | ✅     | `email-tokens.test.ts`: single-use, latest-link-only, expiry, reset signs out everywhere |
| Profile, avatar, statistics              | ✅     | `profile-admin.test.ts`; avatars re-encoded to 256×256 WebP                              |
| Role guards, admin suspension            | ✅     | Deny-by-default guard, `@Roles('ADMIN')`, audited suspension                             |
| Google OAuth (optional)                  | ⏳     | Not implemented                                                                          |

## Phase 4 — Game engine ✅

Rule specification: [GAME_RULES.md](GAME_RULES.md). Engine: `packages/shared/src/game/`.
`pnpm --filter @tienlen/shared test`: 12 files, 158 tests, all passed (including the Phase 1–3
shared tests).

| Item                                  | Status | Evidence                                                                                       |
| ------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| Written rule specification            | ✅     | `docs/GAME_RULES.md` (spec v2): every regional variant decided; configurable ones listed       |
| Rule presets                          | ✅     | `gameRulesSchema`, `DEFAULT_GAME_RULES`; seed stores preset `default` v2, v1 draft deactivated |
| Deck, secure shuffle, deal            | ✅     | `deck.test.ts`: 52 unique cards, 13 each, nothing lost, CSPRNG with rejection sampling         |
| Combination classification            | ✅     | `combinations.test.ts`: every 2- and 3-card selection checked against an independent rule      |
| Comparison and bombs                  | ✅     | Same-shape comparison, bomb table, each bomb power toggled off; Ace/2 straight edge cases      |
| Turn state machine                    | ✅     | `engine.test.ts`: opening card, turn order, pass lockout, trick resolution, lead after finish  |
| Instant wins, leftover penalties      | ✅     | `hand-analysis.test.ts`; priority and tie-break between players in `engine.test.ts`            |
| Timeout action                        | ✅     | Pass if possible, otherwise the weakest single (satisfies the 3♠ opening rule)                 |
| Match resolution                      | ✅     | Placements for both end conditions and instant wins; penalties only for unfinished hands       |
| Whole-match simulation                | ✅     | `simulation.test.ts`: 900 seeded random matches, invariants checked after every action         |
| Turn deadlines, idempotency, versions | ✅     | Done on the server in Phase 5 (see below)                                                      |
| Client-side feedback with the engine  | ✅     | Phase 5: the game screen labels the selection and disables "Đánh" for a non-combination        |

## Phase 5 — Multiplayer and rooms ✅

`pnpm test:integration`: 4 files, 50 tests, all passed. The 15 multiplayer tests
(`test/integration/multiplayer.test.ts`) drive four independent HTTP + Socket.IO clients
against PostgreSQL. The browser test `apps/web/e2e-auth/multiplayer.spec.ts` plays a full
match from the UI against three API clients. Browser suites: real stack 8/8 passed; preview 45 tests, of which 4
tablet tests timed out under machine load on the first run and passed (14/14) on a rerun.

| Item                                   | Status | Evidence                                                                                        |
| -------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| Create, list, join (ID or code), leave | ✅     | Idempotent create per `requestId`; one seat per user; host hand-over; empty room → CANCELLED    |
| Private rooms                          | ✅     | Argon2 room password; hidden from the list; detail forbidden to outsiders                       |
| Waiting room: ready, settings, start   | ✅     | WAITING ⇄ READY by shared transitions; host-only settings reset readiness; host-only start      |
| Quick match                            | ✅     | Per-fee queue; four players → ready public room, match started; cancel; leaves queue on join    |
| Socket.IO contract                     | ✅     | `contracts/realtime.ts`; cookie-authenticated handshake; foreign origins refused                |
| Authoritative actions                  | ✅     | Row lock per match; membership, turn, ownership, combination checked; engine decides legality   |
| Idempotent action IDs, state versions  | ✅     | Retried `actionId` applied once; stale version → `STALE_STATE`                                  |
| Player-specific views                  | ✅     | Each view holds only the caller's hand; tests scan every view and notification for card IDs     |
| Turn deadlines and timeouts            | ✅     | Server-owned deadline in the snapshot; timeout action applied once; timers rebuilt at boot      |
| Disconnect and reconnect               | ✅     | Connected flag on seats; waiting-room seat freed after the grace period; reconnect resyncs      |
| Match end                              | ✅     | Placements, statistics, gap-free event log; room FINISHED and seats freed; instant win at start |
| Room cleanup                           | ✅     | Idle rooms expire (`ROOM_IDLE_MINUTES`)                                                         |
| Web client                             | ✅     | Real API data source and socket notifications; selection label and Play disabled for non-combos |
| Paid rooms                             | ✅     | Since Phase 6: fees charged at start, pool paid out at the end (see below)                      |
| Multi-instance realtime                | ⏳     | Queues, presence and timers are per process; Redis adapter and shared queue in Phase 8          |

## Phase 6 — Wallet and rewards ✅

Policy: [ECONOMY.md](ECONOMY.md). Integration tests: `test/integration/wallet.test.ts`
(10 tests) against PostgreSQL. Results: `pnpm check` passed (164 shared, 27 server, 30 web
unit tests); `pnpm test:integration` 60/60; real-stack browser suite 9/9, including
`e2e-auth/wallet.spec.ts`. Preview browser suite 45/45; its lobby
test also checks the wallet page.

An auth browser test was fixed: it swapped in a revoked session cookie while the lobby was
still making its own API calls, which (correctly) cleared the cookie before the step under
test. It now swaps the cookie with no page open.

| Item                                 | Status | Evidence                                                                                        |
| ------------------------------------ | ------ | ----------------------------------------------------------------------------------------------- |
| Policy written before implementation | ✅     | `docs/ECONOMY.md`: fees, payouts, rounding, refunds, disconnects, draws, daily reward           |
| Ledger service                       | ✅     | Append-only rows, idempotency key per user, conditional balance update in one transaction       |
| No overspending under concurrency    | ✅     | 15 parallel 1 000-coin debits on 10 000: exactly 10 succeed, balance 0, reconciled              |
| Entry-fee policy                     | ✅     | Balance checked to join; all four fees charged at start, or none (`INSUFFICIENT_COINS`)         |
| Settlement exactly once              | ✅     | In the finishing transaction; `settledAt`; one reward row per paid placement; pool paid in full |
| Refunds and cancellation             | ✅     | `GameService.abort` refunds every fee once (second abort is a no-op); room cancelled            |
| Daily rewards                        | ✅     | Vietnam-day periods, 7-day streak; concurrent claims credit once                                |
| Achievements                         | ✅     | FIRST_MATCH, FIRST_WIN, TEN_MATCHES rewarded once at settlement                                 |
| Transaction history                  | ✅     | `/wallet`, `/wallet/transactions` (cursor pages); wallet page in the web app                    |
| Reconciliation                       | ✅     | `WalletService.reconcile` checked after every wallet test scenario                              |
| Admin adjustments, abort tool        | ⏳     | Ledger supports `ADMIN_ADJUSTMENT` with a reason; the admin UI and audit entries are Phase 7    |

Fix made while verifying Phase 6: a socket that disconnected while its connection was still
being set up could leave the player marked as connected. Connections are now counted before
any asynchronous work, and seat updates for one user run in order and record the current
presence (the multiplayer and wallet tests passed three times in a row afterwards).

## Phase 7 — History, leaderboard, admin ✅

Integration tests: `test/integration/history-admin.test.ts` (13 tests). Browser tests:
`e2e/history.spec.ts` (preview), `e2e-auth/admin.spec.ts` and the history and notification
steps of `e2e-auth/multiplayer.spec.ts` (real stack). Results: `pnpm check` passed (170 shared,
27 server, 30 web unit tests); `pnpm test:integration` 73/73; real-stack browser suite 10/10;
preview browser suite 54/54.

Fix made while verifying Phase 7: the web ESLint config now sets `tsconfigRootDir`. Without it
the VS Code ESLint extension, which loads every package config in one process, could not tell
which TypeScript project a web file belongs to and reported a parsing error on every file.

| Item                                | Status | Evidence                                                                                          |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| Match history (list, detail, pages) | ✅     | Own matches only (others get 404); coinDelta equals the ledger; timeline without the deal         |
| Leaderboards                        | ✅     | Weekly/all-time wins, win rate (minimum matches), played; written tie-breaks; unit-tested ranking |
| Exclusions                          | ✅     | Aborted matches and suspended or deleted accounts never count                                     |
| Notification center                 | ✅     | Results, cancellations, daily reminder, security, admin notices; read/read-all; de-duplicated     |
| Player reports                      | ✅     | From a shared match only; repeated open reports are not duplicated                                |
| Admin overview                      | ✅     | Users, rooms, matches, coins in circulation, incidents, dependency health                         |
| Admin user management               | ✅     | Search, detail, matches, ledger, suspend/reactivate, revoke sessions, notices                     |
| Audited coin adjustments            | ✅     | New ledger row with reason and actor; idempotent; cannot go below zero                            |
| Match investigation                 | ✅     | Full event log (with the deal), flag for review, abort with refunds                               |
| Report review                       | ✅     | Resolve or dismiss once                                                                           |
| Rule preset versions                | ✅     | New versions only, validated against the rules schema, activation switches presets                |
| Audit log                           | ✅     | Every admin action with actor, target, reason and IP, in the same transaction                     |
| Web push notifications              | ⏳     | Optional in the specification; not implemented                                                    |
| Reward tables as admin settings     | ⏳     | Kept as reviewed code constants (docs/ECONOMY.md), by decision                                    |

## Changes after Phase 7 ✅

| Item                               | Status | Evidence                                                                                                                                                                                                                                      |
| ---------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email-in-use check at registration | ✅     | `POST /auth/email-availability` (same normalization, rate-limited per IP); the form checks on blur; integration and browser tests                                                                                                             |
| Matches with 2, 3 or 4 players     | ✅     | READY with ≥ 2 seated players all ready; engine deals 13 each; payouts 50/30/20/0, 70/30/0, 100/0; simulated 2- and 3-player matches; integration tests for a 2-player match and a 3-player paid settlement; browser test of a 2-player start |

## Phase 8 — Quality and deployment ✅

Deployment and operations guide: [DEPLOYMENT.md](DEPLOYMENT.md). Results: `pnpm check` passed (174
shared, 27 server, 30 web unit tests); `pnpm test:integration` 78/78; real-stack browser suite 12/12;
preview browser suite 54/54 (unchanged web code since its last run); production builds of the API
(compiled for the load test) and the web app (standalone, served and checked locally).

| Item                                 | Status | Evidence                                                                                                                                                |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Several API instances                | ✅     | Quick-match queue in PostgreSQL (advisory lock per fee); deadline sweep on every instance; presence via Socket.IO (cluster-wide with the Redis adapter) |
| Socket.IO Redis adapter              | ✅     | `SOCKET_IO_REDIS_ADAPTER=true` with `REDIS_URL`; enabled in the Compose stack                                                                           |
| Dockerfiles (API, web)               | 🟡     | Written; web standalone layout run and checked locally; images built and smoke-tested by the `docker` CI job (no Docker on the dev machine)             |
| Compose: full production stack       | 🟡     | `pnpm app:up`: PostgreSQL, Redis, migrate + seed job, API, web; exercised by CI only                                                                    |
| CI                                   | 🟡     | Jobs: check (lint, types, unit, integration, build), e2e (both Playwright suites), docker (build + smoke)                                               |
| Load test                            | ✅     | 25 concurrent matches / 100 players: all finished, 8 915 requests, no errors (DEPLOYMENT.md §10)                                                        |
| Full test suite, production builds   | ✅     | See the results below                                                                                                                                   |
| Responsive layouts, PWA              | ✅     | Preview browser suite on phone, tablet and desktop; manifest, service worker, offline page                                                              |
| Authentication and authorization     | ✅     | Integration tests (sessions, roles, admin 403/404) and the real-stack browser suite                                                                     |
| WebSocket reconnect                  | ✅     | Integration tests: disconnect/reconnect flags, seat freed after grace; resync on reconnect                                                              |
| Wallet concurrency                   | ✅     | Concurrent debits, concurrent daily claims, settlement once (wallet integration tests)                                                                  |
| Deployment, backup and recovery docs | ✅     | DEPLOYMENT.md: proxy and HTTPS, configuration, first deployment, scaling, backup/restore drill, releases, runbook                                       |

Fixes made during Phase 8:

- `status()` of the quick-match queue read "room exists" and "player seated" in two queries;
  while a room was being created it could see the room without the seat and drop the player's
  queue entry. A concurrent 8-player test found it; the two are now read in one query.
- `nestjs-pino` registered its middleware with the old `*` route syntax, which Nest 11
  converted with a warning at every start; it now uses `{*path}`.

`.github/workflows/ci.yml` has not run yet in this session: the repository's CI results are
visible on GitHub after the push.

## Decisions recorded so far

- **Room lifecycle:** FINISHED, CANCELLED and EXPIRED are terminal. A rematch creates a new
  room so every match has a clean, auditable lifecycle.
- **Match lifecycle:** RESOLVING means play has ended and placements and settlement are being
  computed. Any non-terminal state may move to ABORTED.
- **One seat per user** across all rooms, enforced by a unique `room_players.userId`. Seat rows
  are deleted when a player leaves or the room closes.
- **Ledger:** append-only; signed `amount` (credit > 0, debit < 0); `balanceAfter` stored;
  idempotency key unique per user.
- **Game engine location:** `@tienlen/shared`, not the server, so the client can reuse the
  same rules for feedback. The server stays authoritative: it alone holds full states and
  runs actions.
- **Rules:** see `docs/GAME_RULES.md`. Notable defaults: 3♠ must open; passing locks a player
  out of the trick; play continues until three players finish; no out-of-turn chops; no
  final-play restrictions; no "cóng". Chops are recorded but carry no points until Phase 6
  decides the settlement policy.
- **Realtime:** commands are REST (status codes, CSRF origin check, rate limits, idempotency);
  Socket.IO only notifies, never carries private data, and clients refetch their own view.
- **Disconnects:** a disconnected player keeps their match seat and is played by the timeout
  action; nobody wins or loses coins because of a disconnect.
- **Player count:** 2–4 players per match; each gets 13 cards, unused cards stay hidden;
  the weakest dealt card opens. Quick match still waits for four players.
- **Economy:** fees are charged at match start (not reserved at join); payouts 50/30/20/0 % of
  the whole pool, remainders to 1st place; penalties and chops move no coins; aborted matches
  refund in full.
- **Admin:** non-admins see a 404 for /admin; every admin change is audited in the same
  transaction; no ledger row or finished result is ever edited.
- **Boot without dependencies:** the API starts even if PostgreSQL or Redis are down, and
  readiness reports 503 so orchestrators withhold traffic.
