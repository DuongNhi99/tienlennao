import { describe, expect, it } from 'vitest';
import { ALL_CARD_IDS, type CardId } from './cards';
import { createDeck, createSeededRandom, dealCards, type RandomSource, shuffleDeck } from './deck';
import {
  applyPass,
  applyPlay,
  applyTimeout,
  calculateMatchResult,
  canPass,
  type EngineEvent,
  legalPlays,
  type MatchState,
  startMatch,
} from './engine';
import { DEFAULT_GAME_RULES, type GameRules } from './rules';

/**
 * Plays whole matches with random legal moves (seeded, so failures are reproducible) and
 * checks the engine's invariants after every action.
 */
function playMatch(seed: number, rules: GameRules) {
  const random: RandomSource = createSeededRandom(seed);
  const start = startMatch(dealCards(shuffleDeck(createDeck(), random)), rules);
  let state = start.state;
  const log: EngineEvent[] = [...start.events];
  const played: CardId[] = [];

  for (let step = 0; state.status === 'PLAYING'; step++) {
    if (step > 500) throw new Error(`Seed ${seed}: the match did not end`);
    const seat = state.turnSeat!;
    checkInvariants(state, played);

    // Someone else acting out of turn is always rejected.
    const other = (seat + 1 + random.nextInt(3)) % 4;
    if (applyPass(state, other).ok)
      throw new Error(`Seed ${seed}: seat ${other} acted out of turn`);

    const plays = legalPlays(state, seat);
    const options = plays.length + (canPass(state, seat) ? 1 : 0) + 1; // + timeout
    const choice = random.nextInt(options);
    const before = JSON.stringify(state);
    const result =
      choice < plays.length
        ? applyPlay(state, seat, plays[choice]!.cards)
        : choice === plays.length && canPass(state, seat)
          ? applyPass(state, seat)
          : applyTimeout(state, seat);

    if (!result.ok) throw new Error(`Seed ${seed}: legal action rejected (${result.violation})`);
    if (JSON.stringify(state) !== before) throw new Error(`Seed ${seed}: input state mutated`);
    if (result.state.version !== state.version + 1) throw new Error(`Seed ${seed}: bad version`);
    for (const event of result.events) {
      if (event.type === 'PLAY') played.push(...event.combination.cards);
    }
    log.push(...result.events);
    state = result.state;
  }
  checkInvariants(state, played);
  return { state, log };
}

/** Plain checks rather than `expect`: this runs after every action of every simulated match. */
function checkInvariants(state: MatchState, played: CardId[]) {
  const fail = (message: string) => {
    throw new Error(`Invariant broken: ${message}`);
  };
  // Every card is either in exactly one hand or has been played exactly once.
  const all = [...state.hands.flat(), ...played];
  if (all.length !== ALL_CARD_IDS.length || new Set(all).size !== ALL_CARD_IDS.length) {
    fail('cards were duplicated or lost');
  }
  state.hands.forEach((hand, seat) => {
    if ((hand.length === 0) !== (state.finishOrder.includes(seat) && !state.instantWin)) {
      fail(`seat ${seat} has an empty hand without finishing, or the reverse`);
    }
  });
  if (state.status === 'PLAYING') {
    const turn = state.turnSeat!;
    if (state.finishOrder.includes(turn)) fail('a finished player has the turn');
    if (state.passed[turn]) fail('a player who passed has the turn');
    if (state.table === null && state.passed.some(Boolean)) fail('passes survived a new trick');
  }
}

const RULE_SETS: [string, GameRules][] = [
  ['default rules', DEFAULT_GAME_RULES],
  ['FIRST_FINISHER', { ...DEFAULT_GAME_RULES, endCondition: 'FIRST_FINISHER' }],
  [
    'free opening, no bombs',
    {
      ...DEFAULT_GAME_RULES,
      opening: 'HOLDER_LEADS_FREELY',
      bombs: { threeConsecutivePairs: false, fourOfAKind: false, fourConsecutivePairs: false },
    },
  ],
];

describe.each(RULE_SETS)('simulated matches (%s)', (_, rules) => {
  it('finish with valid placements and conserve every card', { timeout: 60_000 }, () => {
    let instantWins = 0;
    let chops = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { state, log } = playMatch(seed, rules);
      const result = calculateMatchResult(state);
      expect(result.placements.map((p) => p.seat).sort()).toEqual([0, 1, 2, 3]);
      expect(result.placements.map((p) => p.placement)).toEqual([1, 2, 3, 4]);
      expect(log.filter((e) => e.type === 'MATCH_FINISHED')).toHaveLength(1);
      expect(log.at(-1)).toMatchObject({ type: 'MATCH_FINISHED', winnerSeat: result.winnerSeat });
      chops += result.chops.length;
      if (result.reason === 'INSTANT_WIN') {
        instantWins++;
        continue;
      }
      const finishers = log.filter((e) => e.type === 'PLAYER_FINISHED');
      expect(finishers).toHaveLength(rules.endCondition === 'FIRST_FINISHER' ? 1 : 3);
      expect(finishers.map((e) => e.type === 'PLAYER_FINISHED' && e.place)).toEqual(
        finishers.map((_, i) => i + 1),
      );
      for (const placement of result.placements) {
        const expected = placement.penalties.reduce((sum, p) => sum + p.points, 0);
        expect(placement.penaltyPoints).toBe(expected);
      }
    }
    // Instant wins are rare but happen (mostly six pairs) — the loop must still cover play.
    expect(instantWins).toBeLessThan(60);
    // Random play must reach bomb beats when they are enabled, and never otherwise.
    const bombsEnabled = Object.values(rules.bombs).some(Boolean);
    expect(chops > 0).toBe(bombsEnabled);
  });
});

describe('determinism', () => {
  it('replays the same events for the same seed', () => {
    for (const seed of [11, 12, 13]) {
      expect(playMatch(seed, DEFAULT_GAME_RULES).log).toEqual(
        playMatch(seed, DEFAULT_GAME_RULES).log,
      );
    }
  });
});
