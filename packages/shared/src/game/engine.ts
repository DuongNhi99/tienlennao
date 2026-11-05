import { MIN_PLAYERS_PER_MATCH } from '../constants/game';
import type { ErrorCode } from '../contracts/errors';
import { type CardId, sortCards } from './cards';
import {
  canBeatCombination,
  classifyCombination,
  type Combination,
  isChop,
  listCombinations,
} from './combinations';
import { detectInstantWin, type LeftoverPenalty, scoreLeftoverHand } from './hand-analysis';
import { type GameRules, gameRulesSchema, type InstantWinKind } from './rules';

/**
 * The deterministic match engine (docs/GAME_RULES.md). Every function is pure: it never
 * mutates its input, reads the clock or uses randomness. States are plain JSON-serializable
 * data so the server can persist them (`matches.stateSnapshot`) and replay events.
 *
 * Engine status covers play only. The database lifecycle (CREATED → DEALING → PLAYING →
 * RESOLVING → FINISHED) is the server's: RESOLVING starts when the engine reports FINISHED.
 */

export interface TablePlay {
  seat: number;
  combination: Combination;
}

/** A bomb beat (docs/GAME_RULES.md §5). */
export interface ChopRecord {
  seat: number;
  choppedSeat: number;
  combination: Combination;
  chopped: Combination;
}

export interface MatchState {
  rules: GameRules;
  status: 'PLAYING' | 'FINISHED';
  /** Incremented on every accepted action. */
  version: number;
  /** Indexed by seat, weakest card first. Private: never send another player's hand. */
  hands: CardId[][];
  /** Null once the match has finished. */
  turnSeat: number | null;
  /** The combination to beat; null when the player to act leads a new trick. */
  table: TablePlay | null;
  /** Seats that passed in the current trick (locked out until it ends). */
  passed: boolean[];
  /** Seats in the order they emptied their hands. */
  finishOrder: number[];
  /** The card the first play must contain, until the first play is made. */
  openingCard: CardId | null;
  chops: ChopRecord[];
  instantWin: { seat: number; kind: InstantWinKind } | null;
}

export type MatchEndReason = 'NORMAL' | 'INSTANT_WIN';

/** Domain events; `type` matches the `MatchEventType` database enum. */
export type EngineEvent =
  | {
      type: 'PLAY';
      seat: number;
      combination: Combination;
      choppedSeat: number | null;
      /** Present (true) only for a chop played out of turn (`bombs.outOfTurn`). */
      outOfTurn?: true;
    }
  | { type: 'PASS'; seat: number }
  | { type: 'TURN_TIMEOUT'; seat: number }
  | { type: 'TRICK_RESOLVED'; winnerSeat: number; leaderSeat: number }
  | { type: 'PLAYER_FINISHED'; seat: number; place: number }
  | { type: 'MATCH_FINISHED'; winnerSeat: number; reason: MatchEndReason };

export interface Transition {
  state: MatchState;
  events: EngineEvent[];
}

export const GAME_VIOLATIONS = [
  'MATCH_NOT_PLAYING',
  'INVALID_SEAT',
  'NOT_YOUR_TURN',
  'EMPTY_SELECTION',
  'DUPLICATE_CARDS',
  'CARDS_NOT_OWNED',
  'INVALID_COMBINATION',
  'MUST_PLAY_OPENING_CARD',
  'CANNOT_BEAT',
  'PASS_NOT_ALLOWED',
] as const;
export type GameViolation = (typeof GAME_VIOLATIONS)[number];

/** How the server reports each engine rejection to clients. */
export const GAME_VIOLATION_ERROR_CODES: Readonly<Record<GameViolation, ErrorCode>> = {
  MATCH_NOT_PLAYING: 'MATCH_FINISHED',
  INVALID_SEAT: 'FORBIDDEN',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  EMPTY_SELECTION: 'INVALID_CARD_SELECTION',
  DUPLICATE_CARDS: 'INVALID_CARD_SELECTION',
  CARDS_NOT_OWNED: 'INVALID_CARD_SELECTION',
  INVALID_COMBINATION: 'INVALID_COMBINATION',
  MUST_PLAY_OPENING_CARD: 'INVALID_COMBINATION',
  CANNOT_BEAT: 'INVALID_COMBINATION',
  PASS_NOT_ALLOWED: 'PASS_NOT_ALLOWED',
};

export type ActionResult = ({ ok: true } & Transition) | { ok: false; violation: GameViolation };

const reject = (violation: GameViolation): ActionResult => ({ ok: false, violation });

function weakestCard(cards: readonly CardId[], rules: GameRules): CardId {
  const card = sortCards(cards, 'rank', rules.suitOrder)[0];
  if (card === undefined) throw new Error('No cards to choose from.');
  return card;
}

const isActive = (state: MatchState, seat: number) => !state.finishOrder.includes(seat);

/** The first seat after `from` (in turn order, ending with `from` itself) matching `test`. */
function nextSeat(state: MatchState, from: number, test: (seat: number) => boolean) {
  const players = state.hands.length;
  for (let offset = 1; offset <= players; offset++) {
    const seat = (from + offset) % players;
    if (test(seat)) return seat;
  }
  return null;
}

function checkSeat(state: MatchState, seat: number): GameViolation | null {
  if (state.status !== 'PLAYING') return 'MATCH_NOT_PLAYING';
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.hands.length) return 'INVALID_SEAT';
  return null;
}

function checkTurn(state: MatchState, seat: number): GameViolation | null {
  // Finished players never hold the turn, so this also rejects them.
  return checkSeat(state, seat) ?? (state.turnSeat !== seat ? 'NOT_YOUR_TURN' : null);
}

/**
 * Everything a play is judged on, from one seat's point of view. The server builds it from the
 * full state (`playContext`); clients build it from their own view, so both judge a selection
 * with this same code (docs/GAME_RULES.md §14).
 */
export interface PlayContext {
  rules: GameRules;
  seat: number;
  hand: readonly CardId[];
  turnSeat: number | null;
  table: TablePlay | null;
  openingCard: CardId | null;
  /** False once the seat has emptied its hand. */
  active: boolean;
}

export type PlayCheck =
  | { ok: true; combination: Combination; chop: boolean; outOfTurn: boolean }
  | { ok: false; violation: GameViolation };

export function playContext(state: MatchState, seat: number): PlayContext {
  return {
    rules: state.rules,
    seat,
    hand: state.hands[seat] ?? [],
    turnSeat: state.turnSeat,
    table: state.table,
    openingCard: state.openingCard,
    active: isActive(state, seat),
  };
}

/**
 * Whether `cards` may be played now (docs/GAME_RULES.md §4–6, §14). Out of turn, only a chop
 * is allowed, and only under `bombs.outOfTurn`, by a player still in the match whose own play
 * is not the one on the table.
 */
export function checkPlay(context: PlayContext, cards: readonly CardId[]): PlayCheck {
  const { rules, seat, hand, table, openingCard } = context;
  const fail = (violation: GameViolation): PlayCheck => ({ ok: false, violation });
  const outOfTurn = context.turnSeat !== seat;
  if (outOfTurn && (!rules.bombs.outOfTurn || table === null || !context.active)) {
    return fail('NOT_YOUR_TURN');
  }
  if (cards.length === 0) return fail('EMPTY_SELECTION');
  if (new Set(cards).size !== cards.length) return fail('DUPLICATE_CARDS');
  if (!cards.every((card) => hand.includes(card))) return fail('CARDS_NOT_OWNED');
  const combination = classifyCombination(cards, rules);
  if (combination === null) return fail('INVALID_COMBINATION');
  const chop = table !== null && isChop(combination, table.combination, rules);
  if (outOfTurn && (!chop || table.seat === seat)) return fail('NOT_YOUR_TURN');
  if (openingCard !== null && !cards.includes(openingCard)) return fail('MUST_PLAY_OPENING_CARD');
  if (table !== null && !canBeatCombination(combination, table.combination, rules)) {
    return fail('CANNOT_BEAT');
  }
  return { ok: true, combination, chop, outOfTurn };
}

/** The seat holding the weakest dealt card (3♠ under the default suit order). */
export function determineOpeningPlayer(
  hands: readonly (readonly CardId[])[],
  rules: GameRules,
): number {
  const opening = weakestCard(hands.flat(), rules);
  return hands.findIndex((hand) => hand.includes(opening));
}

export interface StartOptions {
  /**
   * The seat in this match of the previous match's winner, when the same group plays again
   * and that player is seated. Used only under `starter: 'PREVIOUS_WINNER'`.
   */
  previousWinnerSeat?: number | null;
}

/**
 * Creates the initial state from a deal. Checks instant wins (docs/GAME_RULES.md §12): if a
 * player has one, the returned state is already FINISHED.
 */
export function startMatch(
  hands: readonly (readonly CardId[])[],
  rules: GameRules,
  { previousWinnerSeat = null }: StartOptions = {},
): Transition {
  const parsed = gameRulesSchema.parse(rules);
  const cards = hands.flat();
  if (
    hands.length < MIN_PLAYERS_PER_MATCH ||
    hands.length > parsed.players ||
    hands.some((hand) => hand.length !== parsed.cardsPerPlayer) ||
    new Set(cards).size !== cards.length
  ) {
    throw new Error('Invalid deal: 2–4 players, each with a full hand of distinct cards.');
  }
  if (
    previousWinnerSeat !== null &&
    (!Number.isInteger(previousWinnerSeat) ||
      previousWinnerSeat < 0 ||
      previousWinnerSeat >= hands.length)
  ) {
    throw new Error('The previous winner must hold a seat in this match.');
  }

  // The previous winner leads freely; otherwise the lowest card opens (docs/GAME_RULES.md §7).
  const winnerLeads = parsed.starter === 'PREVIOUS_WINNER' && previousWinnerSeat !== null;
  const opener = winnerLeads ? previousWinnerSeat : determineOpeningPlayer(hands, parsed);
  const state: MatchState = {
    rules: parsed,
    status: 'PLAYING',
    version: 0,
    hands: hands.map((hand) => sortCards(hand, 'rank', parsed.suitOrder)),
    turnSeat: opener,
    table: null,
    passed: hands.map(() => false),
    finishOrder: [],
    openingCard:
      !winnerLeads && parsed.opening === 'HOLDER_MUST_PLAY_LOWEST'
        ? weakestCard(cards, parsed)
        : null,
    chops: [],
    instantWin: null,
  };

  // Highest-priority kind wins; ties go to the first seat in turn order from the opener.
  let best: { seat: number; kind: InstantWinKind; priority: number } | null = null;
  for (let offset = 0; offset < hands.length; offset++) {
    const seat = (opener + offset) % hands.length;
    const kind = detectInstantWin(state.hands[seat]!, parsed.instantWins);
    const priority = kind === null ? -1 : parsed.instantWins.indexOf(kind);
    if (kind !== null && (best === null || priority < best.priority)) {
      best = { seat, kind, priority };
    }
  }
  if (best === null) return { state, events: [] };

  return {
    state: {
      ...state,
      status: 'FINISHED',
      turnSeat: null,
      openingCard: null,
      finishOrder: [best.seat],
      instantWin: { seat: best.seat, kind: best.kind },
    },
    events: [{ type: 'MATCH_FINISHED', winnerSeat: best.seat, reason: 'INSTANT_WIN' }],
  };
}

/** Ends the current trick: the last player to play leads, or the next active seat after them. */
export function resolveTrick(state: MatchState): Transition {
  if (state.table === null) throw new Error('There is no trick to resolve.');
  const winnerSeat = state.table.seat;
  const leaderSeat = isActive(state, winnerSeat)
    ? winnerSeat
    : nextSeat(state, winnerSeat, (seat) => isActive(state, seat));
  if (leaderSeat === null) throw new Error('No active player can lead.');
  return {
    state: { ...state, table: null, passed: state.passed.map(() => false), turnSeat: leaderSeat },
    events: [{ type: 'TRICK_RESOLVED', winnerSeat, leaderSeat }],
  };
}

/**
 * Gives the turn to the next active seat after `fromSeat` that has not passed. If that is the
 * player who made the last play (or nobody can answer), the trick ends instead.
 */
export function advanceTurn(state: MatchState, fromSeat: number): Transition {
  const next = nextSeat(state, fromSeat, (seat) => isActive(state, seat) && !state.passed[seat]);
  if (state.table !== null && (next === null || next === state.table.seat)) {
    return resolveTrick(state);
  }
  return { state: { ...state, turnSeat: next }, events: [] };
}

function isMatchOver(state: MatchState): boolean {
  if (state.rules.endCondition === 'FIRST_FINISHER') return state.finishOrder.length > 0;
  return state.hands.length - state.finishOrder.length <= 1;
}

export function applyPlay(state: MatchState, seat: number, cards: readonly CardId[]): ActionResult {
  const seatViolation = checkSeat(state, seat);
  if (seatViolation) return reject(seatViolation);
  const check = checkPlay(playContext(state, seat), cards);
  if (!check.ok) return reject(check.violation);
  const { combination, chop, outOfTurn } = check;
  const { table } = state;

  const choppedSeat = chop ? table!.seat : null;
  const remaining = state.hands[seat]!.filter((card) => !cards.includes(card));
  const finished = remaining.length === 0;
  const next: MatchState = {
    ...state,
    version: state.version + 1,
    hands: state.hands.map((h, s) => (s === seat ? remaining : h)),
    table: { seat, combination },
    // A chop out of turn brings a player who had passed back into the trick.
    passed: outOfTurn ? state.passed.map((value, s) => value && s !== seat) : state.passed,
    openingCard: null,
    finishOrder: finished ? [...state.finishOrder, seat] : state.finishOrder,
    chops:
      choppedSeat === null
        ? state.chops
        : [...state.chops, { seat, choppedSeat, combination, chopped: table!.combination }],
  };
  const events: EngineEvent[] = [
    { type: 'PLAY', seat, combination, choppedSeat, ...(outOfTurn ? { outOfTurn: true } : {}) },
  ];
  if (finished) {
    events.push({ type: 'PLAYER_FINISHED', seat, place: next.finishOrder.length });
    if (isMatchOver(next)) {
      events.push({ type: 'MATCH_FINISHED', winnerSeat: next.finishOrder[0]!, reason: 'NORMAL' });
      return { ok: true, state: { ...next, status: 'FINISHED', turnSeat: null }, events };
    }
  }
  const advanced = advanceTurn(next, seat);
  return { ok: true, state: advanced.state, events: [...events, ...advanced.events] };
}

export function applyPass(state: MatchState, seat: number): ActionResult {
  const turnViolation = checkTurn(state, seat);
  if (turnViolation) return reject(turnViolation);
  if (state.table === null) return reject('PASS_NOT_ALLOWED');

  const passed = state.passed.map((value, s) => value || s === seat);
  const advanced = advanceTurn({ ...state, version: state.version + 1, passed }, seat);
  return { ok: true, state: advanced.state, events: [{ type: 'PASS', seat }, ...advanced.events] };
}

/**
 * The timeout action (docs/GAME_RULES.md §13): pass if there is a combination to beat,
 * otherwise lead the weakest single card.
 */
export function applyTimeout(state: MatchState, seat: number): ActionResult {
  const turnViolation = checkTurn(state, seat);
  if (turnViolation) return reject(turnViolation);
  const result =
    state.table === null
      ? applyPlay(state, seat, [weakestCard(state.hands[seat]!, state.rules)])
      : applyPass(state, seat);
  if (!result.ok) return result;
  return { ...result, events: [{ type: 'TURN_TIMEOUT', seat }, ...result.events] };
}

/**
 * Every combination `seat` may legally play now: empty when it is not their turn, except for
 * out-of-turn chops under `bombs.outOfTurn`.
 */
export function legalPlays(state: MatchState, seat: number): Combination[] {
  if (checkSeat(state, seat)) return [];
  if (state.turnSeat !== seat && (!state.rules.bombs.outOfTurn || state.table === null)) return [];
  const context = playContext(state, seat);
  return listCombinations(context.hand, state.rules).filter(
    (combination) => checkPlay(context, combination.cards).ok,
  );
}

export function canPass(state: MatchState, seat: number): boolean {
  return checkTurn(state, seat) === null && state.table !== null;
}

/** The first-place seat, or null while the match is still being played. */
export function determineWinner(state: MatchState): number | null {
  return state.status === 'FINISHED' ? (state.finishOrder[0] ?? null) : null;
}

export interface PlacementResult {
  seat: number;
  /** 1-based. */
  placement: number;
  remainingCards: CardId[];
  penalties: LeftoverPenalty[];
  penaltyPoints: number;
}

export interface MatchOutcome {
  reason: MatchEndReason;
  winnerSeat: number;
  instantWin: MatchState['instantWin'];
  /** Ordered by placement. */
  placements: PlacementResult[];
  chops: ChopRecord[];
}

/**
 * Final placements and penalties (docs/GAME_RULES.md §10–12). Finished players keep their
 * finishing order; the rest follow by fewest cards, then seat order after the winner.
 */
export function calculateMatchResult(state: MatchState): MatchOutcome {
  const winnerSeat = determineWinner(state);
  if (winnerSeat === null) throw new Error('The match has not finished.');
  const players = state.hands.length;
  const reason: MatchEndReason = state.instantWin ? 'INSTANT_WIN' : 'NORMAL';
  const afterWinner = (seat: number) => (seat - winnerSeat + players) % players;
  const unfinished = state.hands
    .map((_, seat) => seat)
    .filter((seat) => isActive(state, seat))
    .sort(
      (a, b) => state.hands[a]!.length - state.hands[b]!.length || afterWinner(a) - afterWinner(b),
    );

  const placements = [...state.finishOrder, ...unfinished].map((seat, index) => {
    const remainingCards = state.hands[seat]!;
    const penalties =
      reason === 'NORMAL' && remainingCards.length > 0
        ? scoreLeftoverHand(remainingCards, state.rules)
        : [];
    return {
      seat,
      placement: index + 1,
      remainingCards,
      penalties,
      penaltyPoints: penalties.reduce((sum, item) => sum + item.points, 0),
    };
  });
  return { reason, winnerSeat, instantWin: state.instantWin, placements, chops: state.chops };
}
