import { describe, expect, it } from 'vitest';
import { ALL_CARD_IDS, type CardId, sortCards } from './cards';
import { classifyCombination } from './combinations';
import {
  type ActionResult,
  applyPass,
  applyPlay,
  applyTimeout,
  calculateMatchResult,
  canPass,
  determineOpeningPlayer,
  determineWinner,
  GAME_VIOLATION_ERROR_CODES,
  GAME_VIOLATIONS,
  legalPlays,
  type MatchState,
  startMatch,
} from './engine';
import { DEFAULT_GAME_RULES, type GameRules } from './rules';

const NO_INSTANT_WINS: GameRules = { ...DEFAULT_GAME_RULES, instantWins: [] };
// The filler cards in `deal` contain pairs, so tests about four 2s enable only that kind.
const FOUR_TWOS_ONLY: GameRules = { ...DEFAULT_GAME_RULES, instantWins: ['FOUR_TWOS'] };
const cards = (text: string) => (text ? (text.split(' ') as CardId[]) : []);

/** A hand-built state for testing transitions; seats with empty hands count as finished. */
function makeState(
  hands: string[],
  overrides: Partial<MatchState> = {},
  rules: GameRules = DEFAULT_GAME_RULES,
): MatchState {
  return {
    rules,
    status: 'PLAYING',
    version: 0,
    hands: hands.map((hand) => sortCards(cards(hand), 'rank', rules.suitOrder)),
    turnSeat: 0,
    table: null,
    passed: [false, false, false, false],
    finishOrder: hands.flatMap((hand, seat) => (hand ? [] : [seat])),
    openingCard: null,
    chops: [],
    instantWin: null,
    ...overrides,
  };
}

const table = (seat: number, text: string) => ({
  seat,
  combination: classifyCombination(cards(text), DEFAULT_GAME_RULES)!,
});

function ok(result: ActionResult): MatchState {
  if (!result.ok) throw new Error(`Rejected: ${result.violation}`);
  return result.state;
}

/** Full 13-card hands: the given cards first, the rest of the deck in order. */
function deal(fixed: string[]): CardId[][] {
  const hands = [0, 1, 2, 3].map((seat) => cards(fixed[seat] ?? ''));
  const used = new Set(hands.flat());
  const rest = ALL_CARD_IDS.filter((card) => !used.has(card));
  for (const hand of hands) while (hand.length < 13) hand.push(rest.shift()!);
  return hands;
}

describe('startMatch', () => {
  it('rejects incomplete, oversized or overlapping deals', () => {
    const good = deal([]);
    expect(() => startMatch(good.slice(0, 3), NO_INSTANT_WINS)).toThrow(/Invalid deal/);
    expect(() => startMatch([good[0]!.slice(1), ...good.slice(1)], NO_INSTANT_WINS)).toThrow();
    expect(() => startMatch([good[0]!, good[0]!, good[2]!, good[3]!], NO_INSTANT_WINS)).toThrow();
  });

  it('rejects invalid rules', () => {
    expect(() => startMatch(deal([]), { ...NO_INSTANT_WINS, specVersion: 1 } as never)).toThrow();
  });

  it('gives the first turn to the 3♠ holder, who must play it', () => {
    const { state, events } = startMatch(deal(['', '', '3S']), NO_INSTANT_WINS);
    expect(events).toEqual([]);
    expect(state).toMatchObject({ status: 'PLAYING', version: 0, turnSeat: 2, openingCard: '3S' });
    expect(state.passed).toEqual([false, false, false, false]);
    expect(state.hands[2]![0]).toBe('3S');
  });

  it('uses the configured suit order for the opening card', () => {
    const rules: GameRules = { ...NO_INSTANT_WINS, suitOrder: ['H', 'D', 'C', 'S'] };
    const hands = deal(['', '3H', '3S']);
    expect(determineOpeningPlayer(hands, rules)).toBe(1);
    expect(startMatch(hands, rules).state.openingCard).toBe('3H');
  });

  it('has no opening card when the holder may lead freely', () => {
    const rules: GameRules = { ...NO_INSTANT_WINS, opening: 'HOLDER_LEADS_FREELY' };
    expect(startMatch(deal(['3S']), rules).state.openingCard).toBeNull();
  });

  it('sorts hands weakest first without mutating the deal', () => {
    const hands = deal(['2H 3S']);
    const { state } = startMatch(hands, NO_INSTANT_WINS);
    expect(hands[0]![0]).toBe('2H');
    expect(state.hands[0]).toEqual(sortCards(hands[0]!));
  });

  it('ends the match immediately on an instant win', () => {
    const { state, events } = startMatch(deal(['', '2S 2C 2D 2H']), FOUR_TWOS_ONLY);
    expect(state).toMatchObject({
      status: 'FINISHED',
      turnSeat: null,
      openingCard: null,
      finishOrder: [1],
      instantWin: { seat: 1, kind: 'FOUR_TWOS' },
    });
    expect(events).toEqual([{ type: 'MATCH_FINISHED', winnerSeat: 1, reason: 'INSTANT_WIN' }]);
    expect(determineWinner(state)).toBe(1);
  });

  it('prefers the higher-priority instant win, then seat order from the opener', () => {
    const dragon = '4S 5S 6S 7S 8S 9S 10S JS QS KS AS 3C';
    const sixPairs = '4C 4D 5C 5D 6C 6D 7C 7D 8C 8D 9C 9D';
    // Seat 2 holds 3♠ and opens. Seat 3 has six pairs, seat 1 the dragon.
    const hands = deal(['', dragon, '3S', sixPairs]);
    expect(startMatch(hands, DEFAULT_GAME_RULES).state.instantWin).toEqual({
      seat: 1,
      kind: 'DRAGON_STRAIGHT',
    });
    const pairsFirst: GameRules = {
      ...DEFAULT_GAME_RULES,
      instantWins: ['SIX_PAIRS', 'DRAGON_STRAIGHT'],
    };
    expect(startMatch(hands, pairsFirst).state.instantWin?.seat).toBe(3);

    // Two six-pair hands: seat 0 comes after the opener (seat 3) before seat 1, so seat 0 wins.
    const tie = [
      `${sixPairs} 3C`,
      '10C 10D JC JD QC QD KC KD AC AD 3D 3H 2S',
      '7H 8H 9H 10H JH QH KS KH AS AH 2C 2D 2H',
      '3S 4S 4H 5S 5H 6S 6H 7S 8S 9S 10S JS QS',
    ].map(cards);
    const sixPairsOnly: GameRules = { ...DEFAULT_GAME_RULES, instantWins: ['SIX_PAIRS'] };
    expect(startMatch(tie, sixPairsOnly).state.instantWin).toEqual({
      seat: 0,
      kind: 'SIX_PAIRS',
    });
  });

  it('ignores instant wins when none are enabled', () => {
    expect(startMatch(deal(['', '2S 2C 2D 2H']), NO_INSTANT_WINS).state.status).toBe('PLAYING');
  });
});

describe('action validation', () => {
  const state = makeState(['3S 4S 5S 9H', '6C 7C', '8D 9D', 'JH QH'], { openingCard: '3S' });

  it.each([
    ['another seat', () => applyPlay(state, 1, cards('6C')), 'NOT_YOUR_TURN'],
    ['a seat that does not exist', () => applyPlay(state, 4, cards('6C')), 'INVALID_SEAT'],
    ['a fractional seat', () => applyPass(state, 0.5), 'INVALID_SEAT'],
    ['no cards', () => applyPlay(state, 0, []), 'EMPTY_SELECTION'],
    ['duplicate cards', () => applyPlay(state, 0, cards('3S 3S')), 'DUPLICATE_CARDS'],
    ["another player's card", () => applyPlay(state, 0, cards('3S 6C')), 'CARDS_NOT_OWNED'],
    ['an invalid combination', () => applyPlay(state, 0, cards('3S 9H')), 'INVALID_COMBINATION'],
    ['skipping the opening card', () => applyPlay(state, 0, cards('9H')), 'MUST_PLAY_OPENING_CARD'],
    ['passing while leading', () => applyPass(state, 0), 'PASS_NOT_ALLOWED'],
  ])('rejects %s', (_, act, violation) => {
    expect(act()).toEqual({ ok: false, violation });
  });

  it('rejects every action once the match has finished', () => {
    const finished = { ...state, status: 'FINISHED' as const, turnSeat: null };
    expect(applyPlay(finished, 0, cards('3S'))).toEqual({
      ok: false,
      violation: 'MATCH_NOT_PLAYING',
    });
    expect(applyPass(finished, 0)).toEqual({ ok: false, violation: 'MATCH_NOT_PLAYING' });
    expect(applyTimeout(finished, 0)).toEqual({ ok: false, violation: 'MATCH_NOT_PLAYING' });
  });

  it('rejects a combination that does not beat the table', () => {
    const s = makeState(['3S 4S 5S 9H', '6C 7C', '8D 9D', 'JH QH'], {
      table: table(3, 'JD'),
    });
    expect(applyPlay(s, 0, cards('9H'))).toEqual({ ok: false, violation: 'CANNOT_BEAT' });
    expect(applyPlay(s, 0, cards('3S 4S 5S'))).toEqual({ ok: false, violation: 'CANNOT_BEAT' });
  });

  it('accepts a lead containing the opening card', () => {
    const next = ok(applyPlay(state, 0, cards('3S 4S 5S')));
    expect(next.openingCard).toBeNull();
    expect(next.hands[0]).toEqual(['9H']);
  });

  it('maps every violation to an API error code', () => {
    expect(Object.keys(GAME_VIOLATION_ERROR_CODES).sort()).toEqual([...GAME_VIOLATIONS].sort());
  });
});

describe('turns, passing and tricks', () => {
  const start = () => makeState(['3S 9S', '4C 10C', '5D JD', '6H QH']);

  it('moves to the next seat and increments the version on each action', () => {
    const result = applyPlay(start(), 0, cards('3S'));
    expect(result).toMatchObject({ ok: true });
    const s1 = ok(result);
    expect(s1).toMatchObject({ turnSeat: 1, version: 1, table: { seat: 0 } });
    if (result.ok) {
      expect(result.events).toEqual([
        { type: 'PLAY', seat: 0, combination: s1.table!.combination, choppedSeat: null },
      ]);
    }
    const s2 = ok(applyPass(s1, 1));
    expect(s2).toMatchObject({ turnSeat: 2, version: 2, passed: [false, true, false, false] });
  });

  it('never mutates the input state', () => {
    const s0 = start();
    const snapshot = JSON.stringify(s0);
    const s1 = ok(applyPlay(s0, 0, cards('3S')));
    ok(applyPass(s1, 1));
    applyPlay(s0, 1, cards('4C'));
    expect(JSON.stringify(s0)).toBe(snapshot);
    expect(JSON.parse(JSON.stringify(s1))).toEqual(s1);
  });

  it('ends the trick when everyone else passes; the last player leads', () => {
    let s = ok(applyPlay(start(), 0, cards('3S')));
    s = ok(applyPlay(s, 1, cards('4C')));
    s = ok(applyPass(s, 2));
    s = ok(applyPass(s, 3));
    const result = applyPass(s, 0);
    expect(result).toMatchObject({
      ok: true,
      events: [
        { type: 'PASS', seat: 0 },
        { type: 'TRICK_RESOLVED', winnerSeat: 1, leaderSeat: 1 },
      ],
    });
    expect(ok(result)).toMatchObject({
      turnSeat: 1,
      table: null,
      passed: [false, false, false, false],
    });
  });

  it('locks a passed player out until the trick ends', () => {
    let s = ok(applyPlay(start(), 0, cards('3S')));
    s = ok(applyPass(s, 1));
    s = ok(applyPlay(s, 2, cards('5D')));
    s = ok(applyPlay(s, 3, cards('6H')));
    // Seat 1 passed, so the turn skips from 0 straight to 2.
    s = ok(applyPlay(s, 0, cards('9S')));
    expect(s.turnSeat).toBe(2);
    expect(applyPlay(s, 1, cards('10C'))).toEqual({ ok: false, violation: 'NOT_YOUR_TURN' });
  });

  it('records bomb beats as chops, including chained ones', () => {
    let s = makeState(['2H 3S', '4S 4C 5S 5C 6S 6C 9D', '8S 8C 8D 8H 10D', 'KH'], { turnSeat: 0 });
    s = ok(applyPlay(s, 0, cards('2H')));
    const chop = applyPlay(s, 1, cards('4S 4C 5S 5C 6S 6C'));
    expect(chop).toMatchObject({ ok: true, events: [{ type: 'PLAY', seat: 1, choppedSeat: 0 }] });
    s = ok(chop);
    s = ok(applyPlay(s, 2, cards('8S 8C 8D 8H')));
    expect(
      s.chops.map(({ seat, choppedSeat, chopped }) => [seat, choppedSeat, chopped.type]),
    ).toEqual([
      [1, 0, 'SINGLE'],
      [2, 1, 'CONSECUTIVE_PAIRS'],
    ]);
  });

  it('does not record a same-type beat as a chop', () => {
    let s = makeState(['2S 3S', '2H 4C', '5D', '6H']);
    s = ok(applyPlay(s, 0, cards('2S')));
    s = ok(applyPlay(s, 1, cards('2H')));
    expect(s.chops).toEqual([]);
  });
});

describe('finishing and match end', () => {
  it('lets others answer a finished player, then gives the lead to the next active seat', () => {
    let s = makeState(['9S', '4C 10C', '5D 6D', '6H QH'], { turnSeat: 0 });
    const result = applyPlay(s, 0, cards('9S'));
    expect(result).toMatchObject({
      ok: true,
      events: [
        { type: 'PLAY', seat: 0 },
        { type: 'PLAYER_FINISHED', seat: 0, place: 1 },
      ],
    });
    s = ok(result);
    expect(s).toMatchObject({ status: 'PLAYING', turnSeat: 1, finishOrder: [0] });
    s = ok(applyPass(s, 1));
    s = ok(applyPass(s, 2));
    const resolved = applyPass(s, 3);
    expect(resolved).toMatchObject({
      events: [
        { type: 'PASS', seat: 3 },
        { type: 'TRICK_RESOLVED', winnerSeat: 0, leaderSeat: 1 },
      ],
    });
    expect(ok(resolved)).toMatchObject({ turnSeat: 1, table: null });
  });

  it('skips finished players when passing the turn', () => {
    let s = makeState(['', '4C 10C', '5D JD', '6H QH'], { turnSeat: 1 });
    s = ok(applyPlay(s, 1, cards('4C')));
    s = ok(applyPlay(s, 2, cards('5D')));
    s = ok(applyPlay(s, 3, cards('6H')));
    expect(s.turnSeat).toBe(1);
  });

  it('plays on until one player is left (ALL_PLACEMENTS)', () => {
    let s = makeState(['', '4C', '', 'QH 3H'], { turnSeat: 1, finishOrder: [2, 0] });
    const result = applyPlay(s, 1, cards('4C'));
    expect(result).toMatchObject({
      ok: true,
      events: [
        { type: 'PLAY', seat: 1 },
        { type: 'PLAYER_FINISHED', seat: 1, place: 3 },
        { type: 'MATCH_FINISHED', winnerSeat: 2, reason: 'NORMAL' },
      ],
    });
    s = ok(result);
    expect(s).toMatchObject({ status: 'FINISHED', turnSeat: null, finishOrder: [2, 0, 1] });
    expect(calculateMatchResult(s).placements.map((p) => [p.seat, p.placement])).toEqual([
      [2, 1],
      [0, 2],
      [1, 3],
      [3, 4],
    ]);
  });

  it('ends at the first finisher when configured (FIRST_FINISHER)', () => {
    const rules: GameRules = { ...DEFAULT_GAME_RULES, endCondition: 'FIRST_FINISHER' };
    const s = ok(
      applyPlay(makeState(['9S', '4C 10C', '5D 6D 7D', '6H QH'], {}, rules), 0, cards('9S')),
    );
    expect(s).toMatchObject({ status: 'FINISHED', finishOrder: [0] });
    // Seats 1 and 3 both hold two cards: seat 1 comes first after the winner.
    expect(calculateMatchResult(s).placements.map((p) => p.seat)).toEqual([0, 1, 3, 2]);
  });
});

describe('timeouts', () => {
  it('passes when there is a combination to beat', () => {
    const s = makeState(['3S 9S', '4C', '5D', '6H'], { turnSeat: 1, table: table(0, '3S') });
    const result = applyTimeout(s, 1);
    expect(result).toMatchObject({
      ok: true,
      events: [
        { type: 'TURN_TIMEOUT', seat: 1 },
        { type: 'PASS', seat: 1 },
      ],
    });
  });

  it('leads the weakest single card, which satisfies the opening rule', () => {
    const { state } = startMatch(deal(['', '', '3S']), NO_INSTANT_WINS);
    const next = ok(applyTimeout(state, 2));
    expect(next.table?.combination.cards).toEqual(['3S']);
    expect(next.turnSeat).toBe(3);
  });

  it('only applies to the player whose turn it is', () => {
    const s = makeState(['3S', '4C', '5D', '6H']);
    expect(applyTimeout(s, 1)).toEqual({ ok: false, violation: 'NOT_YOUR_TURN' });
  });
});

describe('legalPlays and canPass', () => {
  it('lists only plays that contain the opening card when opening', () => {
    const s = makeState(['3S 3C 4S 5S 9H', '6C', '8D', 'JH'], { openingCard: '3S' });
    const plays = legalPlays(s, 0).map((c) => c.cards.join(' '));
    expect(plays.sort()).toEqual(['3S', '3S 3C', '3S 4S 5S'].sort());
    expect(canPass(s, 0)).toBe(false);
    expect(legalPlays(s, 1)).toEqual([]);
  });

  it('lists only plays that beat the table, including bombs', () => {
    const s = makeState(['3S', '4S 4C 5S 5C 6S 6C 2C', '8D', 'JH'], {
      turnSeat: 1,
      table: table(0, '2S'),
    });
    const plays = legalPlays(s, 1).map((c) => c.cards.join(' '));
    expect(plays).toEqual(['2C', '4S 4C 5S 5C 6S 6C']);
    expect(canPass(s, 1)).toBe(true);
  });
});

describe('calculateMatchResult', () => {
  it('refuses to score a match in progress', () => {
    const s = makeState(['3S', '4C', '5D', '6H']);
    expect(determineWinner(s)).toBeNull();
    expect(() => calculateMatchResult(s)).toThrow(/not finished/);
  });

  it('applies leftover penalties to players still holding cards', () => {
    const s = makeState(['', '', '', '2H 2S 9S 9C 9D 9H 3C'], {
      status: 'FINISHED',
      turnSeat: null,
      finishOrder: [1, 0, 2],
    });
    const result = calculateMatchResult(s);
    expect(result).toMatchObject({ reason: 'NORMAL', winnerSeat: 1, instantWin: null });
    const last = result.placements[3]!;
    expect(last).toMatchObject({ seat: 3, placement: 4, penaltyPoints: 1 + 2 + 4 });
    expect(last.penalties.map((p) => p.kind)).toEqual(['BLACK_TWO', 'RED_TWO', 'FOUR_OF_A_KIND']);
    expect(result.placements[0]).toMatchObject({ penalties: [], penaltyPoints: 0 });
  });

  it('orders players after an instant win by seat, without penalties', () => {
    const { state } = startMatch(deal(['', '', '2S 2C 2D 2H']), FOUR_TWOS_ONLY);
    const result = calculateMatchResult(state);
    expect(result.reason).toBe('INSTANT_WIN');
    expect(result.placements.map((p) => p.seat)).toEqual([2, 3, 0, 1]);
    expect(result.placements.every((p) => p.penaltyPoints === 0)).toBe(true);
    expect(result.placements[1]!.remainingCards).toHaveLength(13);
  });
});
