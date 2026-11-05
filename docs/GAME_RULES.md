# Game rules — Tiến Lên Miền Nam (rule spec v4)

This is the authoritative rule specification for Tiến Lên Online. The engine in
`packages/shared/src/game/` implements it; every rule below has unit tests in the same
folder. Where regional variants disagree, this document picks one behavior and says so. The
engine never mixes variants silently: anything not listed as configurable is fixed.

Configurable rules live in a `GameRules` object (`gameRulesSchema`, `rules.ts`). Presets are
stored in `game_rule_configurations`; a match copies its preset into `matches.ruleSnapshot`
when it starts, so later preset changes never affect a running or finished match.

Spec v3 added the settings marked _(v3)_ below, spec v4 those marked _(v4)_. Every new default
reproduces the previous version's behaviour, and older rules (stored presets, room rules,
snapshots of running matches) are upgraded on read (v2 → v3 → v4) with exactly those defaults, so
nothing that was already playing changes. Rooms may carry their own rules, chosen by the host
before the start (`rooms.ruleSnapshot`); without them a room plays the active preset.

Terminology: a **round** (_ván_) is one hand — one `matches` row. A **series** (multi-round
match, §20) is a sequence of rounds with cumulative scores. Statistics are round-based.

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

Defaults: all three enabled. A run of four or more pairs always keeps the three-pair powers
(below) when they are enabled, even if `fourConsecutivePairs` is disabled.

Further settings _(v3)_:

| Setting                               | Default | Effect                                                                                                              |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `threeConsecutivePairsBeatPairOfTwos` | off     | Three consecutive pairs also chop a pair of 2s (only with `threeConsecutivePairs`)                                  |
| `bombsBeatBombs`                      | on      | Bombs chop other bombs: tứ quý over 3 đôi thông; 4+ đôi thông over tứ quý and shorter runs. Off: bombs chop 2s only |
| `outOfTurn`                           | off     | Chops may be played out of turn (chặt ngang), §6                                                                    |

- Bombs chain naturally: 2 → chopped by 3 đôi thông → chopped by tứ quý → chopped by
  4 đôi thông (while `bombsBeatBombs` is on).
- By default three consecutive pairs **cannot** beat a pair of 2s. A triple of 2s cannot be
  beaten at all: no higher triple exists and no bomb beats a triple.
- A chop is a beat decided by a bomb power (`isChop`); a higher combination of the same shape
  (a higher tứ quý over a tứ quý) is a normal beat, not a chop.
- A bomb led to open a trick is an ordinary combination of its type; it can be answered by a
  higher one of the same type or by a stronger bomb.
- Every bomb beat is recorded as a **chop** (`chops` in the match state and result) with the
  chopping seat, the chopped seat and both combinations. Chops carry no automatic points in
  this version; the settlement policy (Phase 6) decides whether they move coins.

## 6. Out-of-turn plays

By default every combination, including bombs, is played only on the player's own turn, and a
player who has passed cannot chop later in the same trick.

**Configurable** _(v3)_ (`bombs.outOfTurn`, chặt ngang): a player still in the match may play a
**chop** (§5) at any moment, even if it is not their turn and even if they passed in this trick.
Nothing else may be played out of turn: not a normal beat, not a lead, not a pass, and never a
play on top of one's own combination. After the chop the player is back in the trick, and play
continues with the next seat after them, as if they had played on their turn. The play event
carries `outOfTurn: true`. Concurrent actions are ordered by the match lock and state version:
an action decided on an older version is rejected (`STALE_STATE`).

## 7. Opening the match

- The holder of the lowest **dealt** card takes the first turn: 3♠ under the default suit
  order, which is always dealt with four players. With two or three players 3♠ may be among
  the unused cards; the weakest card that was dealt opens instead (for example 3♣).
- **Configurable** (`opening`):
  - `HOLDER_MUST_PLAY_LOWEST` (default): the first combination of the match must contain
    that card.
  - `HOLDER_LEADS_FREELY`: the holder may lead any valid combination.
- **Configurable** _(v3)_ (`starter`):
  - `LOWEST_CARD` (default): every match starts as above.
  - `PREVIOUS_WINNER`: in a rematch room ("chơi tiếp" creates a new room linked to the old
    one), the winner of the previous match takes the first turn and leads freely — there is no
    opening card. When there was no previous match, or its winner did not join the rematch,
    the lowest card opens as above. Instant-win ties (§12) are broken in seat order from
    whoever takes the first turn.

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

| Leftover                                          | Default weight |
| ------------------------------------------------- | -------------- |
| Each black 2 (♠, ♣)                               | 1              |
| Each red 2 (♦, ♥)                                 | 2              |
| Each four of a kind (ranks 3 to A)                | 4              |
| Each run of three consecutive pairs               | 3              |
| Each run of four or more consecutive pairs        | 6              |
| _(v4)_ Each card still held (`perCard`)           | 0              |
| _(v4)_ Cóng: never played a card (`unplayedHand`) | 0              |

The hand is scored deterministically: count each 2; count each four of a kind except 2s
(those are already counted card by card); remove those four-of-a-kind cards; then find each
maximal run of consecutive ranks (3 to A) holding at least two cards, and score runs of
length 3 or 4+.

Precedence (no double counting): each 2 counts once, as a 2; a four of a kind never also counts
as part of a run; then, once per hand, either **cóng** (all 13 cards still held, when
`unplayedHand` > 0) **or** the per-card penalty — cóng replaces the per-card penalty, while 2s
and bombs still count. A card is therefore counted at most once per kind. Kinds added in v4 are
listed only when their weight is above 0. Illegal actions are always rejected, never penalized.

Every item is stored at settlement as a penalty record (`match_penalties`: player, cards, rule
setting, points, explanation) with a unique key per match, seat, kind and cards, so a retried
settlement can never charge a hand twice.

Points are reported per player in the match result. They do not change placements. Whether
they move coins is a settlement policy decision (Phase 6). No penalties apply after an
instant win.

Cóng is configurable since v4 (`unplayedHand`, off by default): a player still holding all 13
cards when the round ends by normal play.

## 11a. Round score _(v4)_

Every finished round gives each player a **round score** (`scoring`):

- place points by player count (`placementPoints.four`, `.three`, `.two`; defaults 3/2/1/0,
  2/1/0 and 1/0; a worse place never scores more than a better one), then
- minus the round's penalty points when `subtractPenalties` is on (default on).

Round scores feed series standings (§20), the points leaderboard and statistics. They never change
placements or coins.

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

The same check runs in the client: `checkPlay` judges a selection from one seat's point of
view (rules, own hand, turn, table, opening card), and the game view carries the match's rules
(and, to the opener only, the opening card), so the UI disables plays the server would refuse
and says why. The server remains authoritative.

## 15. Determinism

Engine functions are pure: they never mutate their input, never read the clock and never
use randomness except through an injected random source. Given the same deal and the same
actions, the engine always produces the same states and events.

## 16. Regional variants

`RULE_VARIANTS` (`rules.ts`) names three complete presets and regional variants that differ
from the standard rules only where their name says. Hosts pick one in the room's rule editor and
may then change any configurable rule (shown as "Tùy chỉnh"); the admin preset form offers the
same starting points:

| Key                | Vietnamese                       | Difference                                                                                                      |
| ------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `STANDARD`         | Miền Nam chuẩn                   | none (`DEFAULT_GAME_RULES`)                                                                                     |
| `COMPETITIVE`      | Thi đấu nghiêm ngặt              | `perCard` 1, `unplayedHand` 20                                                                                  |
| `CASUAL`           | Vui vẻ                           | free opening; 3 đôi thông chop a pair of 2s; instant wins only dragon and four 2s; no penalties, not subtracted |
| `CHOP_OUT_OF_TURN` | Chặt ngang                       | `bombs.outOfTurn`                                                                                               |
| `WINNER_LEADS`     | Người thắng ván trước đánh trước | `starter: 'PREVIOUS_WINNER'`                                                                                    |
| `FIRST_FINISHER`   | Nhất ăn tất                      | `endCondition: 'FIRST_FINISHER'`                                                                                |

Not modelled in this version (each would need its own rule decision): a pass that only skips
one turn instead of locking the player out of the trick, restrictions on finishing with a 2 or
a bomb ("tới bằng heo"), forbidding a single 2 or a pair of 2s (a player left with a lone 2
could then never lead or finish), and points for chops.

## 17. Persistence and continuing a match

The server stores the engine state after every action (`matches.stateSnapshot`, format `v: 1`)
together with the event log. Before any action or view, `restoreMatchState` validates the
stored state — its shape, that no card is held twice, that pass flags match the players, that
no finished seat holds cards (except the winner of an instant win) or the turn, and that the
table is a valid combination — and upgrades older rule versions. A match therefore resumes
exactly where it stopped after a reload, a reconnect or a server restart, and a damaged
snapshot is refused rather than played on. Players continue a running match from the lobby
(`GET /rooms/current`); a running match cannot be abandoned (the turn timer, §13, plays for
an absent player), while a waiting room can be left.

## 18. Results, history and replay

- The match result lists, per player, the placement, the cards still held (revealed only
  after the match), each leftover penalty item (§11) and the total, the coins, and every chop.
  After an instant win it names the kind.
- History adds the rules the match was played by (its snapshot), the leftovers and chops, and
  the public timeline. `buildReplay` turns the timeline into frames — table, card counts,
  passes and places after each move — for a step-by-step replay (play/pause, step, restart,
  0.5×–4× speed, jump to any step). The deal is never published,
  so the replay shows card counts, not hands.

## 19. Bots

`chooseBotMove` (`bot.ts`) is a simple opponent used by the development preview and by tests.
It chooses only among `legalPlays`, so it obeys every rule the engine enforces: finish when
possible; shed ordinary cards first; chop only a 2 or a bomb, with the smallest bomb; spend a 2
only on a high table or near the end; otherwise pass. Production matches have no bots.

## 20. Multi-round matches (series)

A room can be created as the first round of a **series** that ends:

- `ROUNDS`: after `targetRounds` finished rounds (1–50);
- `TARGET_SCORE`: as soon as a player's cumulative score reaches `targetScore` (1–1000);
- `MANUAL`: when the host ends it, between rounds.

Each round is an ordinary room and match, so every round keeps a clean, auditable lifecycle. The
rules are fixed for the whole series when its first round starts (`game_series.ruleSnapshot`);
later rounds cannot change them. "Next round" from a finished round opens (or joins) the next
round's room: same table, same rules, round number + 1, a fresh deal. Cumulative standings are
always computed from the rounds' settled `match_players.roundScore` — never stored separately —
and ranked by total, then round wins, then fewer penalty points; players still equal share a rank.
Aborted rounds do not count. When the end condition is met at a round's settlement (in the same
transaction) the series finishes and its winner is recorded; a tie at the top goes to the better
place in the latest round all tied players played. After a finished series, "play again" starts a
new series with the same settings; open next-round rooms of a finished series become ordinary
rooms.

## 21. Spectators

A host may allow spectators (`rooms.allowSpectators`). A spectator joins like a player (room
password if any; removed users stay out; at most 20) and may leave at any time without affecting
the match. Spectators receive a **public projection**, built on the server from the same data as
the players' views minus every private field: seats with card counts, passes, places, connection,
the table, the turn and its deadline, the rules, and the public move list. No hand reaches a
spectator while the round is played; leftover hands (`revealedCards`) and the result appear only
after a normal finish, exactly as for the players. Spectators cannot play, pass, change settings,
start or control anything: every such request is refused (403).
