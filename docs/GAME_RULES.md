# Game rules — Tiến Lên Miền Nam (rule spec v2)

This is the authoritative rule specification for Tiến Lên Online. The engine in
`packages/shared/src/game/` implements it; every rule below has unit tests in the same
folder. Where regional variants disagree, this document picks one behavior and says so. The
engine never mixes variants silently: anything not listed as configurable is fixed.

Configurable rules live in a `GameRules` object (`gameRulesSchema`, `rules.ts`). Presets are
stored in `game_rule_configurations`; a match copies its preset into `matches.ruleSnapshot`
when it starts, so later preset changes never affect a running or finished match.

## 1. Deck, players and dealing

- Standard 52-card deck. A match has **2, 3 or 4 players**; a table has four seats.
- Every player gets thirteen cards. With four players all 52 cards are dealt; with two or
  three, the remaining 26 or 13 cards are not used and nobody sees them.
- Production shuffling uses the platform CSPRNG (`crypto.getRandomValues`) with rejection
  sampling and a Fisher–Yates shuffle. Seeded shuffling exists only for deterministic tests.
- Cards are dealt one at a time in seat order (card _i_ goes to player _i_ mod _n_). Players are
  numbered in the order of their table seats.

## 2. Card order

- Ranks, lowest to highest: 3 4 5 6 7 8 9 10 J Q K A 2. Fixed.
- Suits break ties between equal ranks. **Configurable** (`suitOrder`, any permutation).
  Default, lowest to highest: ♠ bích < ♣ chuồn < ♦ rô < ♥ cơ.
- A card's strength is its rank first, then its suit. 3♠ is the weakest card and 2♥ the
  strongest under the default order.
- ♠ and ♣ 2s are "black twos"; ♦ and ♥ 2s are "red twos" (used for penalties, §11).

## 3. Combinations

| Type                | Vietnamese | Cards | Definition                                        |
| ------------------- | ---------- | ----- | ------------------------------------------------- |
| `SINGLE`            | rác / lẻ   | 1     | Any card                                          |
| `PAIR`              | đôi        | 2     | Two cards of the same rank                        |
| `TRIPLE`            | sám cô     | 3     | Three cards of the same rank                      |
| `FOUR_OF_A_KIND`    | tứ quý     | 4     | All four cards of one rank                        |
| `STRAIGHT`          | sảnh       | 3–12  | Three or more consecutive ranks, one card each    |
| `CONSECUTIVE_PAIRS` | đôi thông  | 6+    | Three or more consecutive ranks, exactly two each |

- Suits do not matter for membership: a straight may mix suits (there is no flush rule).
- **A 2 can never be part of a straight or consecutive pairs.** The Ace is high only:
  Q-K-A is a straight; A-2-3, K-A-2 and 2-3-4 are not. Ranks do not wrap around.
- Anything else is invalid (for example, a full house, two unrelated pairs, or 3-3-4-4).

## 4. Comparing combinations

A play beats the combination on the table when either:

1. **Same type and same number of cards, higher top card.** The top card is the strongest
   card of the combination (rank, then suit). Examples: 8♥ beats 8♦; 8♠8♥ beats 8♣8♦
   (top 8♥ > 8♦); 5-6-7 ending in 7♥ beats 5-6-7 ending in 7♦; a 4-card straight can never
   answer a 3-card straight.
2. **A bomb (chặt) beats it** (§5).

## 5. Bombs (chặt)

Each bomb power is **configurable** (`bombs`). With a power disabled, that combination still
plays normally against its own type but loses its special beats.

| Bomb                                  | Setting                 | Beats (in addition to the normal rule)                                             |
| ------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| Three consecutive pairs (3 đôi thông) | `threeConsecutivePairs` | A single 2                                                                         |
| Four of a kind (tứ quý)               | `fourOfAKind`           | A single 2, a pair of 2s, three consecutive pairs                                  |
| Four or more consecutive pairs        | `fourConsecutivePairs`  | A single 2, a pair of 2s, three consecutive pairs, four of a kind, any shorter run |

Defaults: all three enabled. A run of four or more pairs always keeps the three-pair power
(beating a single 2) when that power is enabled, even if `fourConsecutivePairs` is disabled.

- Bombs chain naturally: 2 → chopped by 3 đôi thông → chopped by tứ quý → chopped by
  4 đôi thông.
- Three consecutive pairs **cannot** beat a pair of 2s. A triple of 2s cannot be beaten at
  all: no higher triple exists and no bomb beats a triple.
- A bomb led to open a trick is an ordinary combination of its type; it can be answered by a
  higher one of the same type or by a stronger bomb.
- Every bomb beat is recorded as a **chop** (`chops` in the match state and result) with the
  chopping seat, the chopped seat and both combinations. Chops carry no automatic points in
  this version; the settlement policy (Phase 6) decides whether they move coins.

## 6. Out-of-turn plays

Not supported. Every combination, including bombs, is played only on the player's own turn.
A player who has passed cannot chop later in the same trick.

## 7. Opening the match

- The holder of the lowest **dealt** card takes the first turn: 3♠ under the default suit
  order, which is always dealt with four players. With two or three players 3♠ may be among
  the unused cards; the weakest card that was dealt opens instead (for example 3♣).
- **Configurable** (`opening`):
  - `HOLDER_MUST_PLAY_LOWEST` (default): the first combination of the match must contain
    that card.
  - `HOLDER_LEADS_FREELY`: the holder may lead any valid combination.
- Every match starts this way. A rematch creates a new room (see the room lifecycle in
  `IMPLEMENTATION_CHECKLIST.md`), so there is no "previous winner leads" rule.

## 8. Turns, passing and tricks

- Play moves to the next seat (seat index + 1, wrapping). The UI shows this counter-clockwise,
  as in a physical game.
- The player who leads a trick may play any valid combination and may not pass.
- Other players either beat the combination on the table or pass.
- **Passing locks the player out of the trick** until it ends, even if their turn would
  otherwise come round again.
- When every other player still in the trick has passed (or has finished), the trick ends.
  The player who made the last play leads the next trick with a clean table.
- Players who have emptied their hands are skipped.

## 9. Finishing and leading after a player finishes

- A player who plays their last card finishes and takes the next free place (1st, 2nd …).
- There are no final-play restrictions: a player may finish with a 2 or with a bomb.
- The trick does not end because the last play came from a finished player; the remaining
  players may still answer it. If they all pass, the lead goes to the **next active player
  after the finished player** (hưởng sái).

## 10. End of the match

**Configurable** (`endCondition`):

- `ALL_PLACEMENTS` (default): play continues until only one player has cards. That player
  takes last place. Placements are the order in which players finished.
- `FIRST_FINISHER`: the match ends as soon as one player finishes. The other three are
  ranked by fewest cards remaining; ties go to the player who comes first in seat order
  after the winner.

Instant wins (§12) end the match before any card is played.

## 11. Leftover penalties (thối)

When a match ends by normal play, each player still holding cards receives penalty points
for what they hold. Each weight is **configurable** (`leftoverPenalties`); 0 disables it.

| Leftover                                   | Default weight |
| ------------------------------------------ | -------------- |
| Each black 2 (♠, ♣)                        | 1              |
| Each red 2 (♦, ♥)                          | 2              |
| Each four of a kind (ranks 3 to A)         | 4              |
| Each run of three consecutive pairs        | 3              |
| Each run of four or more consecutive pairs | 6              |

The hand is scored deterministically: count each 2; count each four of a kind except 2s
(those are already counted card by card); remove those four-of-a-kind cards; then find each
maximal run of consecutive ranks (3 to A) holding at least two cards, and score runs of
length 3 or 4+.

Points are reported per player in the match result. They do not change placements. Whether
they move coins is a settlement policy decision (Phase 6). No penalties apply after an
instant win.

"Cóng" (a player who has not played a card when someone finishes) is not part of this
version.

## 12. Instant wins (tới trắng)

Checked once, right after the deal. **Configurable** (`instantWins`): an ordered list of the
enabled kinds; earlier kinds take priority. Default order:

1. `DRAGON_STRAIGHT` — sảnh rồng: one card of every rank from 3 to A.
2. `FOUR_TWOS` — tứ quý 2.
3. `FIVE_CONSECUTIVE_PAIRS` — năm đôi thông: five consecutive ranks (3 to A) with at least
   two cards each.
4. `SIX_PAIRS` — sáu đôi: six disjoint pairs (a four of a kind counts as two pairs).

`FOUR_THREES` (tứ quý 3) is available but off by default.

If several players qualify, the one with the highest-priority kind wins. If they share the
kind, the player who comes first in seat order starting from the opening player (§7) wins.
The winner takes 1st place; everyone else follows in seat order after the winner. The match
ends without any play.

## 13. Turn timeouts

The server owns the turn deadline (Phase 5). When it expires, the engine applies the
timeout action for the player whose turn it is:

- If there is a combination on the table, the player passes.
- If the player is leading, the player plays their weakest single card (under the opening
  rule this is 3♠, which satisfies it).

Disconnected players are handled the same way at each of their deadlines. The engine never
awards wins or coins because of a timeout.

## 14. What the engine validates

For every action, before changing any state:

| Check                                              | Violation                                               | API error code           |
| -------------------------------------------------- | ------------------------------------------------------- | ------------------------ |
| The match is in play                               | `MATCH_NOT_PLAYING`                                     | `MATCH_FINISHED`         |
| The seat exists                                    | `INVALID_SEAT`                                          | `FORBIDDEN`              |
| It is this seat's turn (never a finished player's) | `NOT_YOUR_TURN`                                         | `NOT_YOUR_TURN`          |
| At least one card, no duplicates, all owned        | `EMPTY_SELECTION`, `DUPLICATE_CARDS`, `CARDS_NOT_OWNED` | `INVALID_CARD_SELECTION` |
| The cards form a valid combination                 | `INVALID_COMBINATION`                                   | `INVALID_COMBINATION`    |
| The first play contains the opening card           | `MUST_PLAY_OPENING_CARD`                                | `INVALID_COMBINATION`    |
| The combination beats the table                    | `CANNOT_BEAT`                                           | `INVALID_COMBINATION`    |
| Passing is allowed (not leading)                   | `PASS_NOT_ALLOWED`                                      | `PASS_NOT_ALLOWED`       |

The mapping is exported as `GAME_VIOLATION_ERROR_CODES`. State versions, action IDs
(idempotency), timing and identity-to-seat mapping are checked by the server before the
engine is called (Phase 5). The engine increments `version` on every accepted action.

## 15. Determinism

Engine functions are pure: they never mutate their input, never read the clock and never
use randomness except through an injected random source. Given the same deal and the same
actions, the engine always produces the same states and events.
