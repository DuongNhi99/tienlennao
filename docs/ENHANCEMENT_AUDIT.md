# Enhancement audit — rules, rounds, spectators, invitations, statistics

Audit of the application at commit `b2091f5` (branch `phase-8-deployment`) against the
"Tiến Lên Miền Nam — Complete Game Enhancement" specification, followed by the plan that was
implemented. Status legend: **COMPLETE**, **PARTIAL**, **MISSING**, **BROKEN**, **N/A**.

Statuses describe the code **before** this work. The final state is recorded in
[IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) ("Enhancement: rounds, spectators,
invitations, statistics").

## Architecture found

- pnpm monorepo: `apps/web` (Next.js 16 PWA), `apps/server` (NestJS 11, REST + Socket.IO
  notifications), `packages/shared` (Zod contracts and the pure game engine).
- PostgreSQL via Prisma 6, Redis for rate limits and the Socket.IO adapter. **Not Supabase**:
  the specification's Supabase/RLS items map to server-side authorization in NestJS (every route
  is deny-by-default; the database is reachable only by the API).
- The server is authoritative: actions lock the match row, carry an idempotency key and a state
  version, and the engine validates them. Clients receive a per-player view; Socket.IO payloads
  never carry private data.
- Terminology: the existing `Match` is one hand (Vietnamese _ván_), which the specification calls
  a **round**. A multi-round **match** (the specification's term) did not exist.

## Feature audit matrix

| Module / feature                            | Status   | Existing files                                                     | Gaps / bugs                                                                                                                               | Action                                                                                |
| ------------------------------------------- | -------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Combinations (single … tứ quý, sảnh, thông) | COMPLETE | `shared/game/combinations.ts` (+ tests)                            | —                                                                                                                                         | Keep                                                                                  |
| Rank / suit order, tie-breaks               | COMPLETE | `cards.ts`, `rules.ts` (`suitOrder`)                               | —                                                                                                                                         | Keep                                                                                  |
| Cutting hierarchy and timing (chặt, ngang)  | COMPLETE | `combinations.ts` (`isChop`), `engine.ts` (`checkPlay`)            | —                                                                                                                                         | Keep                                                                                  |
| Rule presets                                | PARTIAL  | `RULE_VARIANTS`, admin preset form                                 | Only admins choose; every room plays the single active preset. No Strict / Casual presets                                                 | Add Competitive and Casual presets; per-room rules chosen by the host                 |
| Rule settings UI for rooms                  | MISSING  | `room-settings-modal.tsx` (fee, timer only)                        | Host cannot pick or edit rules; players cannot read them before the start                                                                 | Rule editor (presets, toggles, numbers, help, reset, summary) in create/settings      |
| Pig (2) and leftover penalties              | PARTIAL  | `hand-analysis.ts` (`scoreLeftoverHand`)                           | No per-card penalty, no penalty for an unplayed hand (cóng); penalty records not persisted, no keys/explanations                          | Rule spec v4: `perCard`, `unplayedHand`; persisted `match_penalties` with unique keys |
| "2 as a single" / "pair of 2s" toggles      | N/A      | —                                                                  | Disabling them leaves hands that can never be emptied (a lone 2 could never be led); needs its own rule decision                          | Documented as not modelled (GAME_RULES.md §16)                                        |
| Illegal actions                             | COMPLETE | `engine.ts` violations                                             | Rejected, never penalized — a documented decision                                                                                         | Keep                                                                                  |
| Immutable rules snapshot per match          | COMPLETE | `matches.ruleSnapshot`                                             | —                                                                                                                                         | Keep; series add one snapshot for all their rounds                                    |
| Event log                                   | PARTIAL  | `match_events` (sequence, actionId, actor, payload)                | `PLAYER_DISCONNECTED/RECONNECTED` exist in the enum but are never written; no state version per event; rows are not protected from UPDATE | Write presence events; `stateVersion` column; trigger refusing UPDATE/DELETE          |
| Match (round) history                       | COMPLETE | `history.service.ts`, `history-list.tsx`, `history-detail.tsx`     | No round numbers / series grouping                                                                                                        | Show the series and round number                                                      |
| Round timeline                              | COMPLETE | `history-detail.tsx`, `describe-event.ts`                          | Hidden in the UI by the owner in `b2091f5` ("Hidden for now")                                                                             | Leave hidden (owner's decision); data still served                                    |
| Replay viewer                               | PARTIAL  | `replay.ts` (`buildReplay`), `match-replay.tsx`                    | No 0.5×/1×/2×/4× speeds; hidden in the UI by the owner in `b2091f5`                                                                       | Add speeds; leave hidden                                                              |
| Replay snapshots                            | N/A      | `matches.stateSnapshot` (latest full state)                        | A round has ≤ ~200 public events; `buildReplay` is O(n) and already verified against real engine states after every action                | Not added (documented)                                                                |
| End of round, ranking, settlement           | COMPLETE | `engine.ts`, `game.service.ts` (`finalize`)                        | —                                                                                                                                         | Extend `finalize` with round scores, stats and penalty records                        |
| Remaining-hand reveal                       | COMPLETE | `game.service.ts` (`revealedCards` only when FINISHED)             | Hidden in the UI by the owner in `b2091f5`                                                                                                | Leave hidden; spectators get the same rule                                            |
| Results screen                              | PARTIAL  | `match-result-modal.tsx`                                           | No "View history", no next-round action, no round score                                                                                   | Add history link, round score, next round / series standings                          |
| Multi-round match (series)                  | MISSING  | Rematch rooms (`rooms.rematchRoomId`)                              | No rounds, cumulative scores or end conditions                                                                                            | `game_series`: rounds / target score / manual; cumulative standings                   |
| Spectator mode                              | MISSING  | —                                                                  | —                                                                                                                                         | `room_spectators`, public projection, spectator screen, leak tests                    |
| Rooms: create, join, code, password         | COMPLETE | `rooms.service.ts`, lobby screens                                  | Max players fixed at 4 (CHECK); no spectator toggle                                                                                       | `maxPlayers` 2–4; `allowSpectators`                                                   |
| Room lobby host controls                    | PARTIAL  | `waiting-room.tsx`                                                 | Host cannot remove a member or close the room                                                                                             | Kick and close endpoints + UI                                                         |
| Invitations                                 | MISSING  | `NotificationType.ROOM_INVITATION` (unused); copy-link button      | The copied link does not work for private rooms                                                                                           | `room_invitations`: direct (single use) and link (reusable until expiry) invitations  |
| Server-authoritative actions                | COMPLETE | `game.service.ts` (locks, versions, action IDs)                    | —                                                                                                                                         | Keep                                                                                  |
| Reconnection and timeout policy             | COMPLETE | `realtime.gateway.ts`, `rooms.service.ts` (`setConnected`), timers | Presence changes not recorded in the match log                                                                                            | Record them                                                                           |
| Player statistics                           | PARTIAL  | `users.service.ts` (`getStats`: played, won, win rate)             | No placements, average place, cards played, chops, penalties, streaks                                                                     | Per-round stat columns on `match_players`; `/users/me/stats` extended                 |
| Player profile                              | PARTIAL  | `profile-view.tsx`                                                 | No recent rounds, charts, achievements, privacy, other players' profiles                                                                  | Public profiles with a privacy setting; charts; achievements                          |
| Leaderboard                                 | PARTIAL  | `leaderboard.ts`, `history.service.ts`                             | Only wins / win rate / played; only week / all time; no search                                                                            | Points, best streak, chops, lowest penalty; today / week / month / all; name search   |
| Achievements                                | PARTIAL  | `rewards.service.ts` (3 codes)                                     | Only match-count based                                                                                                                    | Streak, pig hunter, bomb master, comeback, penalty-free; listing endpoint and screen  |
| Statistics dashboard                        | MISSING  | —                                                                  | —                                                                                                                                         | Charts (no chart library: SVG/CSS)                                                    |
| Security: hidden cards, authz, rate limits  | COMPLETE | Views, guards, rate limits, leak tests in `multiplayer.test.ts`    | Must be extended to spectators and invitations                                                                                            | Leak tests for spectator views and notifications                                      |
| Supabase RLS                                | N/A      | —                                                                  | The app does not use Supabase; the API is the only database client                                                                        | Authorization tests instead                                                           |

## Preserved as they are

The engine and its tests, the authoritative action path (locks, versions, action IDs), the
economy (fees at start, payouts once, refunds), sessions and CSRF checks, quick match, admin,
notifications, the PWA, and every existing route. Existing rows stay readable: new columns are
nullable or defaulted, and rule snapshots v2/v3 upgrade on read.

## Plan (as implemented)

1. **Rules spec v4** (`packages/shared`): `perCard` and `unplayedHand` penalties, round scoring
   (`scoring`), Competitive and Casual presets, a v3 → v4 upgrade with v3-identical defaults.
2. **One migration** (`20261105090000_rounds_spectators_invitations`): series, spectators,
   invitations, penalty records, per-round statistics, room rules and options, profile
   visibility, event state versions, the event immutability trigger, a 2–4 `maxPlayers` CHECK,
   and a backfill of the statistics that can be derived in SQL.
3. **Server**: room rules and options, kick and close, series, statistics and penalty records
   at settlement, presence events, spectators, invitations, statistics, leaderboards and
   achievements.
4. **Web**: rule editor, series standings, spectator screen, invitations, profiles, statistics
   dashboard, leaderboards, achievements.
5. **Tests and docs**: shared unit tests, integration tests against PostgreSQL (including
   hidden-card checks for spectators), updated GAME_RULES.md, README and checklist.

## Risks noted

- The owner hid leftover cards, the replay and the timeline in the UI one commit before this
  work. That decision was kept; the specification's reveal and replay requirements are met on
  the server and in the (hidden) components, and can be shown again by uncommenting the blocks
  marked "Hidden for now".
- Series rooms reuse the rematch-room mechanism, so every round keeps its own clean room and
  match lifecycle (recorded decision: FINISHED rooms are terminal).

## Final state

Every MISSING, PARTIAL and BROKEN item above was implemented or fixed; the N/A items are explained in
the matrix. Evidence and test counts: [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md),
section "Enhancement: rules, rounds, spectators, invitations, statistics".
