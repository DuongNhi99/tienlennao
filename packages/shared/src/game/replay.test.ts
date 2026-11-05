import { describe, expect, it } from 'vitest';
import type { TimelineEvent } from '../contracts/history';
import { createDeck, createSeededRandom, dealCards, shuffleDeck } from './deck';
import {
  applyPass,
  applyPlay,
  applyTimeout,
  canPass,
  type EngineEvent,
  legalPlays,
  type MatchState,
  startMatch,
} from './engine';
import { buildReplay, toTimelineEvent } from './replay';
import { DEFAULT_GAME_RULES } from './rules';

const RULES = { ...DEFAULT_GAME_RULES, instantWins: [] };

/** A seeded match, with the stored events and the state after each of them. */
function recordMatch(seed: number) {
  const random = createSeededRandom(seed);
  let state = startMatch(dealCards(shuffleDeck(createDeck(), random)), RULES).state;
  const stored: { sequence: number; type: string; createdAt: Date; payload: unknown }[] = [];
  const stateAfter: MatchState[] = [];
  const store = (events: EngineEvent[]) => {
    for (const { type, ...payload } of events) {
      stored.push({ sequence: stored.length, type, createdAt: new Date(0), payload });
      stateAfter.push(state);
    }
  };
  stored.push({ sequence: 0, type: 'DEALT', createdAt: new Date(0), payload: { hands: [] } });
  stateAfter.push(state);
  while (state.status === 'PLAYING') {
    const seat = state.turnSeat!;
    const plays = legalPlays(state, seat);
    const choice = random.nextInt(plays.length + 2);
    const result =
      choice < plays.length
        ? applyPlay(state, seat, plays[choice]!.cards)
        : canPass(state, seat) && choice === plays.length
          ? applyPass(state, seat)
          : applyTimeout(state, seat);
    if (!result.ok) throw new Error(result.violation);
    state = result.state;
    store(result.events);
  }
  return { stored, stateAfter, final: state };
}

describe('toTimelineEvent', () => {
  it('never publishes the deal', () => {
    const deal = { sequence: 0, type: 'DEALT', createdAt: new Date(0), payload: { hands: [] } };
    expect(toTimelineEvent(deal)).toBeNull();
  });

  it('keeps the public fields of a play, including out-of-turn chops', () => {
    const event = toTimelineEvent({
      sequence: 4,
      type: 'PLAY',
      createdAt: new Date(0),
      payload: {
        seat: 2,
        combination: { type: 'FOUR_OF_A_KIND', cards: ['7S', '7C', '7D', '7H'], top: '7H' },
        choppedSeat: 0,
        outOfTurn: true,
      },
    });
    expect(event).toMatchObject({
      type: 'PLAY',
      seatIndex: 2,
      cards: ['7S', '7C', '7D', '7H'],
      combinationType: 'FOUR_OF_A_KIND',
      choppedSeat: 0,
      outOfTurn: true,
    });
  });
});

describe('buildReplay', () => {
  it('follows the real match: card counts, table, passes and places after every event', () => {
    for (const seed of [3, 4, 5]) {
      const { stored, stateAfter, final } = recordMatch(seed);
      const timeline = stored.map(toTimelineEvent).filter((e): e is TimelineEvent => e !== null);
      const frames = buildReplay(timeline, 4);
      expect(frames[0]).toMatchObject({ event: null, table: null, cardCounts: [13, 13, 13, 13] });

      for (const frame of frames.slice(1)) {
        const state = stateAfter[frame.event!.sequence]!;
        // Within one action the engine reports several events; compare at the action's end
        // only where the frame is the last event of its action.
        const lastOfAction =
          stateAfter[frame.event!.sequence + 1] !== state ||
          frame.event!.sequence === stored.length - 1;
        if (!lastOfAction) continue;
        expect(frame.cardCounts).toEqual(state.hands.map((hand) => hand.length));
        expect(frame.passed).toEqual(state.passed);
        expect(frame.table?.cards ?? null).toEqual(state.table?.combination.cards ?? null);
      }
      const last = frames.at(-1)!;
      expect(last.event?.type).toBe('MATCH_FINISHED');
      expect(last.places.filter((p) => p !== null)).toHaveLength(final.finishOrder.length);
      final.finishOrder.forEach((seat, i) => expect(last.places[seat]).toBe(i + 1));
    }
  });

  it('marks the frame after a turn timeout', () => {
    const at = new Date(0).toISOString();
    const base = {
      at,
      cards: null,
      combinationType: null,
      choppedSeat: null,
      place: null,
      outOfTurn: false,
    };
    const frames = buildReplay(
      [
        { ...base, sequence: 1, type: 'TURN_TIMEOUT', seatIndex: 1 },
        { ...base, sequence: 2, type: 'PASS', seatIndex: 1 },
        { ...base, sequence: 3, type: 'PASS', seatIndex: 2 },
      ],
      3,
    );
    expect(frames.map((f) => f.timedOut)).toEqual([false, true, false]);
    expect(frames.at(-1)!.passed).toEqual([false, true, true]);
  });
});
