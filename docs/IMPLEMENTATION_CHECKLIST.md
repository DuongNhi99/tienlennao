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

| Item                                   | Status | Evidence                                                                                          |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| Create, list, join (ID or code), leave | ✅     | Idempotent create per `requestId`; one seat per user; host hand-over; empty room → CANCELLED      |
| Private rooms                          | ✅     | Argon2 room password; hidden from the list; detail forbidden to outsiders                         |
| Waiting room: ready, settings, start   | ✅     | WAITING ⇄ READY by shared transitions; host-only settings reset readiness; host-only start        |
| Quick match                            | ✅     | Per-fee queue; four players → ready public room, match started; cancel; leaves queue on join      |
| Socket.IO contract                     | ✅     | `contracts/realtime.ts`; cookie-authenticated handshake; foreign origins refused                  |
| Authoritative actions                  | ✅     | Row lock per match; membership, turn, ownership, combination checked; engine decides legality     |
| Idempotent action IDs, state versions  | ✅     | Retried `actionId` applied once; stale version → `STALE_STATE`                                    |
| Player-specific views                  | ✅     | Each view holds only the caller's hand; tests scan every view and notification for card IDs       |
| Turn deadlines and timeouts            | ✅     | Server-owned deadline in the snapshot; timeout action applied once; timers rebuilt at boot        |
| Disconnect and reconnect               | ✅     | Connected flag on seats; waiting-room seat freed after the grace period; reconnect resyncs        |
| Match end                              | ✅     | Placements, statistics, gap-free event log; room FINISHED and seats freed; instant win at start   |
| Room cleanup                           | ✅     | Idle rooms expire (`ROOM_IDLE_MINUTES`)                                                           |
| Web client                             | ✅     | Real API data source and socket notifications; selection label and Play disabled for non-combos   |
| Paid rooms                             | ⏳     | Offered from Phase 6, when entry fees are charged and settled (the server offers only free rooms) |
| Multi-instance realtime                | ⏳     | Queues, presence and timers are per process; Redis adapter and shared queue in Phase 8            |

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
- **Boot without dependencies:** the API starts even if PostgreSQL or Redis are down, and
  readiness reports 503 so orchestrators withhold traffic.
