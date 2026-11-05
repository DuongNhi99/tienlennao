import { describe, expect, it } from 'vitest';
import { createDeck, createSeededRandom, dealCards, shuffleDeck } from './deck';
import { applyPass, applyPlay, legalPlays, type MatchState, startMatch } from './engine';
import { restoreMatchState } from './persistence';
import { DEFAULT_GAME_RULES } from './rules';

const NO_INSTANT_WINS = { ...DEFAULT_GAME_RULES, instantWins: [] };

/** A match a few actions in, with a combination on the table. */
function midMatch(): MatchState {
  const hands = dealCards(shuffleDeck(createDeck(), createSeededRandom(7)));
  let state = startMatch(hands, NO_INSTANT_WINS).state;
  for (let i = 0; i < 3; i++) {
    const seat = state.turnSeat!;
    const result = state.table
      ? applyPass(state, seat)
      : applyPlay(state, seat, legalPlays(state, seat)[0]!.cards);
    if (!result.ok) throw new Error(result.violation);
    state = result.state;
  }
  return state;
}

const stored = (state: unknown) => JSON.parse(JSON.stringify(state)) as Record<string, unknown>;

describe('restoreMatchState', () => {
  it('restores exactly what was stored: hands, turn, table, passes and finishers', () => {
    const state = midMatch();
    expect(state.table).not.toBeNull();
    expect(restoreMatchState(stored(state))).toEqual({ ok: true, state });
  });

  it('continues an upgraded spec v2 snapshot exactly where it stopped', () => {
    const state = midMatch();
    const { starter: _, ...v2Rules } = state.rules;
    const old = stored({
      ...state,
      rules: {
        ...v2Rules,
        specVersion: 2,
        bombs: { threeConsecutivePairs: true, fourOfAKind: true, fourConsecutivePairs: true },
      },
    });
    const restored = restoreMatchState(old);
    expect(restored).toEqual({ ok: true, state });
    if (!restored.ok) return;
    const seat = restored.state.turnSeat!;
    expect(applyPass(restored.state, seat)).toEqual(applyPass(state, seat));
  });

  it('restores a match won instantly, where the winner still holds every card', () => {
    // Seat 1 holds the four 2s; the other 48 cards are dealt in order.
    const rest = createDeck().filter((card) => !card.startsWith('2'));
    const hands = [0, 1, 2, 3].map((seat) => rest.slice(seat * 12, seat * 12 + 12));
    hands[1]!.push('2S', '2C', '2D', '2H');
    hands[0]!.push(hands[1]!.shift()!);
    hands[2]!.push(hands[1]!.shift()!);
    hands[3]!.push(hands[1]!.shift()!);
    const { state } = startMatch(hands, { ...DEFAULT_GAME_RULES, instantWins: ['FOUR_TWOS'] });
    expect(state).toMatchObject({ status: 'FINISHED', finishOrder: [1] });
    expect(restoreMatchState(stored(state))).toEqual({ ok: true, state });
  });

  it.each([
    ['not an object', () => 'state'],
    ['missing hands', (s: Record<string, unknown>) => ({ ...s, hands: undefined })],
    ['an unknown card', (s: Record<string, unknown>) => ({ ...s, hands: [['1Z'], [], [], []] })],
    [
      'a card held twice',
      (s: Record<string, unknown>) => {
        const hands = s.hands as string[][];
        return { ...s, hands: [[...hands[0]!, hands[1]![0]], ...hands.slice(1)] };
      },
    ],
    ['too few pass flags', (s: Record<string, unknown>) => ({ ...s, passed: [false] })],
    ['nobody holding the turn', (s: Record<string, unknown>) => ({ ...s, turnSeat: null })],
    ['a turn seat out of range', (s: Record<string, unknown>) => ({ ...s, turnSeat: 9 })],
    [
      'a finished player with cards',
      (s: Record<string, unknown>) => ({ ...s, finishOrder: [(s.turnSeat as number) ^ 1] }),
    ],
    [
      'an invalid combination on the table',
      (s: Record<string, unknown>) => ({
        ...s,
        table: { seat: 0, combination: { type: 'PAIR', cards: ['3S', '4C'], top: '4C' } },
      }),
    ],
    ['unknown rules', (s: Record<string, unknown>) => ({ ...s, rules: { specVersion: 9 } })],
  ])('refuses a snapshot with %s', (_, corrupt) => {
    expect(restoreMatchState(corrupt(stored(midMatch())))).toMatchObject({ ok: false });
  });
});
