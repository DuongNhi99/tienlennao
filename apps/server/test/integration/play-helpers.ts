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
  shuffleDeck,
} from '@tienlen/shared';

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
