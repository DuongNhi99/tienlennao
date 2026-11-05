import { describe, expect, it } from 'vitest';
import { type CardId, sortCards } from './cards';
import { chooseBotMove } from './bot';
import { classifyCombination } from './combinations';
import { createDeck, createSeededRandom, dealCards, shuffleDeck } from './deck';
import { applyPass, applyPlay, type MatchState, startMatch } from './engine';
import { DEFAULT_GAME_RULES } from './rules';

const cards = (text: string) => (text ? (text.split(' ') as CardId[]) : []);

function makeState(hands: string[], overrides: Partial<MatchState> = {}): MatchState {
  return {
    rules: DEFAULT_GAME_RULES,
    status: 'PLAYING',
    version: 0,
    hands: hands.map((hand) => sortCards(cards(hand))),
    turnSeat: 0,
    table: null,
    passed: [false, false, false, false],
    finishOrder: [],
    openingCard: null,
    chops: [],
    instantWin: null,
    ...overrides,
  };
}

const onTable = (seat: number, text: string) => ({
  seat,
  combination: classifyCombination(cards(text), DEFAULT_GAME_RULES)!,
});

describe('chooseBotMove', () => {
  it('only moves on its own turn', () => {
    const s = makeState(['3S', '4S', '5S', '6S']);
    expect(chooseBotMove(s, 1)).toBeNull();
    expect(chooseBotMove({ ...s, status: 'FINISHED', turnSeat: null }, 0)).toBeNull();
  });

  it('plays the opening card when it must', () => {
    const s = makeState(['3S 3C 4D 5H 9S', '6S', '7S', '8S'], { openingCard: '3S' });
    const move = chooseBotMove(s, 0);
    expect(move).toMatchObject({ type: 'PLAY' });
    expect(move?.type === 'PLAY' && move.cards).toContain('3S');
  });

  it('finishes when one legal play empties the hand', () => {
    const s = makeState(['9S 10C JD', '6S', '7S', '8S'], { table: onTable(3, '6S 7S 8D') });
    expect(chooseBotMove(s, 0)).toEqual({ type: 'PLAY', cards: cards('9S 10C JD') });
  });

  it('leads from its weakest card, as many cards as possible, keeping 2s', () => {
    const s = makeState(['4S 5C 6D 9H 2S', '6S', '7S', '8S']);
    expect(chooseBotMove(s, 0)).toEqual({ type: 'PLAY', cards: cards('4S 5C 6D') });
  });

  it('answers with the cheapest ordinary beat', () => {
    const s = makeState(['8S 9C KD 2H', '6S', '7S', '8H'], { table: onTable(3, '7D') });
    expect(chooseBotMove(s, 0)).toEqual({ type: 'PLAY', cards: cards('8S') });
  });

  it('chops a 2 with its smallest bomb when nothing else beats it', () => {
    const s = makeState(['5S 5C 6S 6C 7S 7C 9S 9C 9D 9H JD', '6D', '7D', '8H'], {
      table: onTable(3, '2H'),
    });
    expect(chooseBotMove(s, 0)).toEqual({ type: 'PLAY', cards: cards('5S 5C 6S 6C 7S 7C') });
  });

  it('never spends a bomb on an ordinary combination', () => {
    const s = makeState(['4S 9S 9C 9D 9H JD', '6D', '7D', '8H'], { table: onTable(3, 'AH') });
    expect(chooseBotMove(s, 0)).toEqual({ type: 'PASS' });
  });

  it('saves its 2s for a high table or the endgame', () => {
    const early = makeState(['4S 5D 7C 9H JD 2S', '6D', '7D', '8H'], { table: onTable(3, 'KH') });
    expect(chooseBotMove(early, 0)).toEqual({ type: 'PASS' });
    const onAce = { ...early, table: onTable(3, 'AH') };
    expect(chooseBotMove(onAce, 0)).toEqual({ type: 'PLAY', cards: cards('2S') });
    const endgame = makeState(['4S 2S', '6D', '7D', '8H'], { table: onTable(3, 'KH') });
    expect(chooseBotMove(endgame, 0)).toEqual({ type: 'PLAY', cards: cards('2S') });
  });

  it('plays whole matches against itself: every move legal, every match finished', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rules = { ...DEFAULT_GAME_RULES, instantWins: [] };
      let state = startMatch(
        dealCards(shuffleDeck(createDeck(), createSeededRandom(seed))),
        rules,
      ).state;
      for (let step = 0; state.status === 'PLAYING'; step++) {
        if (step > 400) throw new Error(`Seed ${seed}: bots did not finish`);
        const seat = state.turnSeat!;
        const move = chooseBotMove(state, seat);
        if (!move) throw new Error(`Seed ${seed}: no move for seat ${seat}`);
        const result =
          move.type === 'PLAY' ? applyPlay(state, seat, move.cards) : applyPass(state, seat);
        if (!result.ok) throw new Error(`Seed ${seed}: illegal bot move (${result.violation})`);
        state = result.state;
      }
      expect(state.finishOrder).toHaveLength(3);
    }
  });
});
