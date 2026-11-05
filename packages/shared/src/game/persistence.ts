import { z } from 'zod';
import { CARDS_PER_PLAYER, MIN_PLAYERS_PER_MATCH, PLAYERS_PER_MATCH } from '../constants/game';
import { cardIdSchema } from './cards';
import { classifyCombination, COMBINATION_TYPES } from './combinations';
import type { MatchState } from './engine';
import { gameRulesSchema, INSTANT_WIN_KINDS } from './rules';

/**
 * Reading engine states back from storage (`matches.stateSnapshot`). A state is checked against
 * its shape and the engine's invariants before any action is applied to it, and older rule
 * versions are upgraded (see `gameRulesSchema`), so a snapshot written by an earlier release
 * resumes exactly where it stopped, and a damaged one is refused instead of played on.
 */

const seat = z
  .number()
  .int()
  .min(0)
  .max(PLAYERS_PER_MATCH - 1);

const combinationSchema = z.object({
  type: z.enum(COMBINATION_TYPES),
  cards: z.array(cardIdSchema).min(1),
  top: cardIdSchema,
});

const matchStateSchema = z.object({
  rules: gameRulesSchema,
  status: z.enum(['PLAYING', 'FINISHED']),
  version: z.number().int().nonnegative(),
  hands: z
    .array(z.array(cardIdSchema).max(CARDS_PER_PLAYER))
    .min(MIN_PLAYERS_PER_MATCH)
    .max(PLAYERS_PER_MATCH),
  turnSeat: seat.nullable(),
  table: z.object({ seat, combination: combinationSchema }).nullable(),
  passed: z.array(z.boolean()),
  finishOrder: z.array(seat),
  openingCard: cardIdSchema.nullable(),
  chops: z.array(
    z.object({
      seat,
      choppedSeat: seat,
      combination: combinationSchema,
      chopped: combinationSchema,
    }),
  ),
  instantWin: z.object({ seat, kind: z.enum(INSTANT_WIN_KINDS) }).nullable(),
});

/** Why a stored state cannot be resumed, or null if it is consistent. */
function inconsistency(state: MatchState): string | null {
  const players = state.hands.length;
  const held = state.hands.flat();
  if (new Set(held).size !== held.length) return 'a card is held twice';
  if (state.passed.length !== players) return 'pass flags do not match the players';
  if (new Set(state.finishOrder).size !== state.finishOrder.length) return 'a seat finished twice';
  if ([...state.finishOrder, state.turnSeat ?? 0].some((s) => s >= players)) return 'unknown seat';
  // After an instant win the winner finishes holding the whole hand.
  if (!state.instantWin && state.finishOrder.some((s) => state.hands[s]!.length > 0)) {
    return 'a finished seat has cards';
  }
  if (state.status === 'PLAYING') {
    if (state.turnSeat === null) return 'nobody holds the turn';
    if (state.finishOrder.includes(state.turnSeat)) return 'a finished seat holds the turn';
  }
  const table = state.table;
  if (table) {
    if (table.seat >= players) return 'unknown seat on the table';
    const replayed = classifyCombination(table.combination.cards, state.rules);
    if (replayed?.type !== table.combination.type) return 'the table is not a valid combination';
  }
  return null;
}

export type RestoreResult = { ok: true; state: MatchState } | { ok: false; reason: string };

/** Validates and upgrades a stored engine state. Never throws. */
export function restoreMatchState(value: unknown): RestoreResult {
  const parsed = matchStateSchema.safeParse(value);
  if (!parsed.success) return { ok: false, reason: 'the stored state has an unknown shape' };
  const state = parsed.data;
  const problem = inconsistency(state);
  return problem ? { ok: false, reason: problem } : { ok: true, state };
}
