import { z } from 'zod';
import { CARDS_PER_PLAYER } from '../constants/game';
import { cardIdSchema } from '../game/cards';

/**
 * Game action requests. Every action names the state version it was decided on (stale actions
 * are rejected with STALE_STATE) and carries a client-generated action ID: retries with the
 * same ID are processed once and answered with the current state.
 */
const actionBase = z.object({
  stateVersion: z.number().int().nonnegative(),
  actionId: z.uuid(),
});

export const playCardsRequestSchema = actionBase.extend({
  cards: z.array(cardIdSchema).min(1).max(CARDS_PER_PLAYER),
});
export type PlayCardsRequest = z.infer<typeof playCardsRequestSchema>;

export const passRequestSchema = actionBase;
export type PassRequest = z.infer<typeof passRequestSchema>;
