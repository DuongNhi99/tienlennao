import { CARDS_PER_PLAYER } from '../constants/game';
import { TIMELINE_EVENT_TYPES, type TimelineEvent } from '../contracts/history';
import type { CardId } from './cards';
import type { CombinationType } from './combinations';

const PUBLIC_EVENTS: ReadonlySet<string> = new Set(TIMELINE_EVENT_TYPES);

interface StoredPayload {
  seat?: number;
  winnerSeat?: number;
  place?: number;
  choppedSeat?: number | null;
  outOfTurn?: boolean;
  combination?: { type: CombinationType; cards: CardId[] };
}

/**
 * A stored match event (`match_events`) as a public timeline event, or null for private ones
 * (the deal is never published).
 */
export function toTimelineEvent(event: {
  sequence: number;
  type: string;
  createdAt: Date;
  payload: unknown;
}): TimelineEvent | null {
  if (!PUBLIC_EVENTS.has(event.type)) return null;
  const payload = (event.payload ?? {}) as StoredPayload;
  return {
    sequence: event.sequence,
    type: event.type as TimelineEvent['type'],
    at: event.createdAt.toISOString(),
    seatIndex: payload.seat ?? payload.winnerSeat ?? null,
    cards: payload.combination?.cards ?? null,
    combinationType: payload.combination?.type ?? null,
    choppedSeat: payload.choppedSeat ?? null,
    place: payload.place ?? null,
    outOfTurn: payload.outOfTurn === true,
  };
}

/**
 * Step-by-step replay of a finished match from its public timeline (docs/GAME_RULES.md §8–10).
 * Only public information is used: who played which cards, passes, tricks and finishes. The
 * deal is never part of a timeline, so hands appear as card counts.
 */

export interface ReplayFrame {
  /** The event this frame shows; null for the opening frame, before any play. */
  event: TimelineEvent | null;
  /** The combination on the table after the event; null when a trick has just ended. */
  table: { seatIndex: number; cards: CardId[]; type: CombinationType | null } | null;
  /** Indexed by seat. */
  cardCounts: number[];
  passed: boolean[];
  /** Finishing place by seat; null while the player still holds cards. */
  places: (number | null)[];
  /** The turn timer ran out and the server acted for the player (pass or weakest card). */
  timedOut: boolean;
}

const SHOWN: ReadonlySet<TimelineEvent['type']> = new Set([
  'PLAY',
  'PASS',
  'TRICK_RESOLVED',
  'PLAYER_FINISHED',
  'MATCH_FINISHED',
  'MATCH_ABORTED',
]);

/** One frame per visible event, after an opening frame with full hands and an empty table. */
export function buildReplay(timeline: readonly TimelineEvent[], players: number): ReplayFrame[] {
  let frame: ReplayFrame = {
    event: null,
    table: null,
    cardCounts: Array.from({ length: players }, () => CARDS_PER_PLAYER),
    passed: Array.from({ length: players }, () => false),
    places: Array.from({ length: players }, () => null),
    timedOut: false,
  };
  const frames = [frame];
  let timedOut = false;

  for (const event of [...timeline].sort((a, b) => a.sequence - b.sequence)) {
    const seat = event.seatIndex;
    if (event.type === 'TURN_TIMEOUT') {
      timedOut = true;
      continue;
    }
    if (!SHOWN.has(event.type)) continue;
    const next: ReplayFrame = {
      ...frame,
      event,
      cardCounts: [...frame.cardCounts],
      passed: [...frame.passed],
      places: [...frame.places],
      timedOut,
    };
    if (event.type === 'PLAY' && seat !== null && event.cards) {
      next.table = { seatIndex: seat, cards: event.cards, type: event.combinationType };
      next.cardCounts[seat] = Math.max(0, next.cardCounts[seat]! - event.cards.length);
      // A chop out of turn brings a player who had passed back into the trick.
      next.passed[seat] = false;
    } else if (event.type === 'PASS' && seat !== null) {
      next.passed[seat] = true;
    } else if (event.type === 'TRICK_RESOLVED') {
      next.table = null;
      next.passed = next.passed.map(() => false);
    } else if (event.type === 'PLAYER_FINISHED' && seat !== null) {
      next.places[seat] = event.place;
    }
    frames.push(next);
    frame = next;
    timedOut = false;
  }
  return frames;
}
