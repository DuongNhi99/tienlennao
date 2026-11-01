import { randomUUID } from 'node:crypto';
import {
  canBeatCombination,
  type CardId,
  classifyCombination,
  createDeck,
  createSeededRandom,
  dealCards,
  DEFAULT_GAME_RULES,
  detectInstantWin,
  listCombinations,
  type PlayerGameView,
  playerGameViewSchema,
  shuffleDeck,
} from '@tienlen/shared';
import type { client } from './helpers';

/** A simple legal strategy computed only from the player's own view. */
export function choosePlay(view: PlayerGameView): CardId[] | null {
  const rules = DEFAULT_GAME_RULES;
  const target = view.currentTrick && classifyCombination(view.currentTrick.cards, rules);
  const option = listCombinations(view.myHand, rules).find(
    (c) =>
      // The very first play of the match must contain 3♠.
      (view.stateVersion > 0 || !view.myHand.includes('3S') || c.cards.includes('3S')) &&
      (!target || canBeatCombination(c, target, rules)),
  );
  return option?.cards ?? null;
}

/**
 * Replaces the production Dealer in tests: planned deals first, otherwise seeded deals without
 * an instant win, so that every match is actually played.
 */
export class TestDealer {
  readonly planned: CardId[][][] = [];
  private readonly random = createSeededRandom(2026);

  deal(): CardId[][] {
    const planned = this.planned.shift();
    if (planned) return planned;
    for (;;) {
      const hands = dealCards(shuffleDeck(createDeck(), this.random));
      if (hands.every((hand) => !detectInstantWin(hand, DEFAULT_GAME_RULES.instantWins))) {
        return hands;
      }
    }
  }
}

const API = '/api/v1';

/** Anything with a cookie-keeping HTTP client (see `registerUser`). */
export interface TablePlayer {
  http: ReturnType<typeof client>;
}

/** A room hosted by the first player, joined and readied by all four. Returns its ID. */
export async function readyRoom(table: TablePlayer[], entryFee = 0): Promise<string> {
  const res = await table[0]!.http
    .post(`${API}/rooms`)
    .send({ visibility: 'PUBLIC', entryFee, turnTimerSeconds: 30, requestId: randomUUID() })
    .expect(201);
  const { roomId } = res.body as { roomId: string };
  for (const p of table.slice(1)) {
    await p.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);
  }
  for (const p of table) {
    await p.http.put(`${API}/rooms/${roomId}/ready`).send({ ready: true }).expect(200);
  }
  return roomId;
}

export async function gameView(p: TablePlayer, roomId: string): Promise<PlayerGameView> {
  return playerGameViewSchema.parse((await p.http.get(`${API}/rooms/${roomId}/game`)).body);
}

/** Plays a started match to the end, every move chosen from the mover's own view. */
export async function playToEnd(table: TablePlayer[], roomId: string): Promise<void> {
  const seats = await Promise.all(table.map(async (p) => (await gameView(p, roomId)).mySeat));
  for (let step = 0; step < 500; step++) {
    const any = await gameView(table[0]!, roomId);
    if (any.status !== 'PLAYING') return;
    const actor = table[seats.indexOf(any.turnSeat!)]!;
    const mine = await gameView(actor, roomId);
    const cards = choosePlay(mine);
    const action = { actionId: randomUUID(), stateVersion: mine.stateVersion };
    await actor.http
      .post(`${API}/rooms/${roomId}/game/${cards ? 'play' : 'pass'}`)
      .send(cards ? { ...action, cards } : action)
      .expect(200);
  }
  throw new Error('The match did not end');
}
