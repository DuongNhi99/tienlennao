# Virtual coin economy (Phase 6)

Coins are **virtual game points**. They cannot be bought, withdrawn or exchanged for anything
of real-world value. This document is the policy the wallet, settlement and reward code
implements; the tests in `apps/server/test/integration/wallet.test.ts` check each rule.

## Ledger

- Every balance change is one row in `wallet_transactions`, which is append-only: rows are
  never updated or deleted. Corrections are new rows (`ADMIN_ADJUSTMENT`).
- `amount` is signed: credits are positive, debits negative, never zero. `balanceAfter` is
  the balance right after the row was applied.
- Every row has an idempotency key, unique per user. Posting the same key twice returns the
  first row and changes nothing.
- The balance is changed with one conditional `UPDATE … WHERE balance + amount >= 0`, in the
  same transaction as the ledger row. Concurrent debits therefore cannot overspend, and a
  balance can never go negative (a database CHECK enforces it as well).
- Reconciliation: for every wallet, the sum of its ledger amounts equals its balance, and the
  latest row's `balanceAfter` equals the balance. `totalEarned` and `totalSpent` are the sums
  of credits and of debits.
- Clients never submit amounts or balances; every amount comes from server configuration.

| Type                 | Sign | Idempotency key            | When                               |
| -------------------- | ---- | -------------------------- | ---------------------------------- |
| `INITIAL_BONUS`      | +    | `initial-bonus`            | Account created                    |
| `DAILY_REWARD`       | +    | `daily:<YYYY-MM-DD>`       | Daily reward claimed               |
| `MATCH_ENTRY`        | −    | `match-entry:<matchId>`    | Paid match starts                  |
| `MATCH_REWARD`       | +    | `match-reward:<matchId>`   | Paid match settles (payout > 0)    |
| `MATCH_REFUND`       | +    | `match-refund:<matchId>`   | Paid match aborted                 |
| `ACHIEVEMENT_REWARD` | +    | `achievement:<code>`       | Achievement unlocked               |
| `ADMIN_ADJUSTMENT`   | ±    | supplied by the admin tool | Correction with a reason (Phase 7) |

## Entry fees

- Fees come from the active rule preset (`allowedEntryFees`, default 0, 100, 500, 1000, 5000).
- Joining a room or the quick-match queue requires a balance of at least the fee. Nothing is
  reserved at that point.
- The fee is **charged when the match starts**, inside the start transaction, for all four
  players at once. If any player can no longer pay, nothing is charged, the match does not
  start and the host sees `INSUFFICIENT_COINS`.
- Free rooms (fee 0) create no ledger rows.

## Payouts

- The pool is four times the fee. It is paid out in full by placement; there is no house cut.

  | Placement | Share of the pool |
  | --------- | ----------------- |
  | 1st       | 50 %              |
  | 2nd       | 30 %              |
  | 3rd       | 20 %              |
  | 4th       | 0 %               |

- Rounding: each share is rounded down to whole coins and the remainder goes to 1st place, so
  the payouts always add up to the pool exactly.
- A player's `coinDelta` for the match is their payout minus the fee. Rewards of 0 create no
  ledger row; a player's net result can be negative (the fee).
- Instant wins pay out the same way, using their placements.
- Leftover penalties and chops (docs/GAME_RULES.md §5, §11) are recorded but do not move
  coins in this version.

## Settlement

Settlement runs once, in the same transaction that ends the match (match row locked): placements,
payouts, `match_players.coinDelta`, statistics and `matches.settledAt` are written together.
A match with `settledAt` set is never settled again, and every payout row has a per-match
idempotency key as a second guard. Players are notified (`user:updated`) after commit.

## Cancellation and refunds

- Players cannot cancel a running match, and disconnecting does not end one: the timeout action
  plays for an absent player. There is no extra penalty for disconnecting, and no win or coins
  are awarded because someone else disconnected.
- A match that is **aborted** (by an administrator, Phase 7, or by an unrecoverable server
  error) refunds every entry fee in full (`MATCH_REFUND`) and pays no rewards.
- Rooms that never start charge nothing, so expiring or leaving them needs no refund.
- There are no draws: every finished match has four distinct placements.

## Daily reward

- One claim per calendar day in the **Asia/Ho_Chi_Minh** time zone (UTC+7, no daylight saving).
  A new day starts at local midnight.
- Streak: claiming on the day after the previous claim increases the streak day by one, up to 7.
  Missing a day resets it to 1. Day 7 stays at 7 while the streak continues.
- Amount: 100 coins × streak day (100 … 700).
- Claims are unique per user and day in the database, so double clicks and concurrent requests
  credit once; a second claim answers `ACTION_ALREADY_PROCESSED`.

## Achievements

Unlocked automatically when a match is settled, each at most once per user:

| Code          | Condition              | Reward |
| ------------- | ---------------------- | ------ |
| `FIRST_MATCH` | First finished match   | 200    |
| `FIRST_WIN`   | First 1st-place finish | 500    |
| `TEN_MATCHES` | Ten finished matches   | 1000   |

Rewards come from the `achievements` table (seeded); inactive achievements are not awarded.

## Administrative corrections

Administrators may post `ADMIN_ADJUSTMENT` rows with a mandatory reason. The row records the
acting administrator and is written to the audit log. The tool arrives in Phase 7.
