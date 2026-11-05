import { type CardId, cardStrength } from './cards';
import { type Combination, isBomb, isTwo } from './combinations';
import { canPass, legalPlays, type MatchState } from './engine';

/**
 * A simple opponent for the dev preview and simulations. It only ever chooses among
 * `legalPlays`, so it follows exactly the rules the engine enforces for people, and it never
 * plays out of turn. Strategy, in order:
 *
 * 1. Finish if one legal play empties the hand.
 * 2. Keep 2s and bombs: shed ordinary cards first — leading from the weakest card with as many
 *    cards as possible, answering with the cheapest beat.
 * 3. Chop only a 2 or a bomb, with the smallest bomb that does it; a bomb is never spent on an
 *    ordinary combination.
 * 4. Spend a 2 only on a high table (an Ace or a 2) or when few cards are left.
 * 5. Otherwise pass.
 */

export type BotMove = { type: 'PLAY'; cards: CardId[] } | { type: 'PASS' };

/** A bot with this many cards or fewer stops saving its 2s. */
const ENDGAME_CARDS = 4;

const holdsTwos = (c: Combination) => isTwo(c.top) && !isBomb(c);
const precious = (c: Combination) => isBomb(c) || c.cards.some(isTwo);

/** The move for `seat`, or null when it is not that seat's turn. */
export function chooseBotMove(state: MatchState, seat: number): BotMove | null {
  if (state.status !== 'PLAYING' || state.turnSeat !== seat) return null;
  const hand = state.hands[seat]!;
  const plays = legalPlays(state, seat);
  const strength = (card: CardId) => cardStrength(card, state.rules.suitOrder);
  const play = (c: Combination): BotMove => ({ type: 'PLAY', cards: c.cards });

  const finishing = plays.find((c) => c.cards.length === hand.length);
  if (finishing) return play(finishing);

  const ordinary = plays.filter((c) => !precious(c));
  const table = state.table?.combination ?? null;
  if (table === null) {
    // Lead: from the weakest card, as long as possible, then the lowest top.
    const leads = ordinary.length ? ordinary : plays;
    const lead = [...leads].sort(
      (a, b) =>
        strength(a.cards[0]!) - strength(b.cards[0]!) ||
        b.cards.length - a.cards.length ||
        strength(a.top) - strength(b.top),
    )[0];
    return lead ? play(lead) : null;
  }

  const cheapest = (options: Combination[]) =>
    [...options].sort(
      (a, b) => strength(a.top) - strength(b.top) || a.cards.length - b.cards.length,
    )[0];
  const beat = cheapest(ordinary);
  if (beat) return play(beat);

  if (holdsTwos(table) || isBomb(table)) {
    const chop = cheapest(plays.filter(isBomb));
    if (chop) return play(chop);
  }
  const highTable = isTwo(table.top) || table.top.startsWith('A');
  if (highTable || hand.length <= ENDGAME_CARDS) {
    const two = cheapest(plays.filter((c) => !isBomb(c)));
    if (two) return play(two);
  }
  return canPass(state, seat) ? { type: 'PASS' } : null;
}
