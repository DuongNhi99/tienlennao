import { z } from 'zod';
import { CARDS_PER_PLAYER, PLAYERS_PER_MATCH } from '../constants/game';
import { MATCH_STATUSES } from '../constants/lifecycle';
import { cardIdSchema } from '../game/cards';
import { publicPlayerSchema } from './lobby';

/**
 * Player-specific game state. The server builds one per player: `myHand` contains only that
 * player's cards; opponents are represented by card counts only. Draft v0 (finalized in Phase 5).
 */

const seatIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(PLAYERS_PER_MATCH - 1);

export const gameSeatSchema = publicPlayerSchema.extend({
  seatIndex: seatIndexSchema,
  cardCount: z.number().int().min(0).max(CARDS_PER_PLAYER),
  hasPassed: z.boolean(),
  /** 1-based finishing position once the player has emptied their hand. */
  finishedPlace: z.number().int().min(1).max(PLAYERS_PER_MATCH).nullable(),
  connected: z.boolean(),
});
export type GameSeat = z.infer<typeof gameSeatSchema>;

export const trickPlaySchema = z.object({
  seatIndex: seatIndexSchema,
  cards: z.array(cardIdSchema).min(1),
});
export type TrickPlay = z.infer<typeof trickPlaySchema>;

export const playerGameViewSchema = z.object({
  matchId: z.uuid(),
  roomId: z.uuid(),
  status: z.enum(MATCH_STATUSES),
  /** Monotonic; clients discard snapshots older than the one they hold. */
  stateVersion: z.number().int().nonnegative(),
  entryFee: z.number().int().nonnegative(),
  mySeat: seatIndexSchema,
  myHand: z.array(cardIdSchema).max(CARDS_PER_PLAYER),
  seats: z.array(gameSeatSchema).length(PLAYERS_PER_MATCH),
  /** The combination currently on the table; null when a new trick starts. */
  currentTrick: trickPlaySchema.nullable(),
  turnSeat: seatIndexSchema.nullable(),
  /** Server-owned deadline for the current turn (ISO 8601). Clients only display it. */
  turnDeadline: z.iso.datetime().nullable(),
  /** False when the current player must lead a new trick. */
  canPass: z.boolean(),
});
export type PlayerGameView = z.infer<typeof playerGameViewSchema>;

export const matchResultSchema = z.object({
  matchId: z.uuid(),
  placements: z
    .array(
      publicPlayerSchema.extend({
        seatIndex: seatIndexSchema,
        placement: z.number().int().min(1).max(PLAYERS_PER_MATCH),
        cardsRemaining: z.number().int().min(0).max(CARDS_PER_PLAYER),
        coinDelta: z.number().int(),
      }),
    )
    .length(PLAYERS_PER_MATCH),
});
export type MatchResult = z.infer<typeof matchResultSchema>;
