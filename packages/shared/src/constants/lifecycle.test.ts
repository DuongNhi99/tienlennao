import { describe, expect, it } from 'vitest';
import {
  InvalidTransitionError,
  MATCH_STATUSES,
  MATCH_TRANSITIONS,
  ROOM_STATUSES,
  ROOM_TRANSITIONS,
  assertTransition,
  canTransition,
  isTerminal,
} from './lifecycle';

describe('room lifecycle', () => {
  it('defines transitions for every status, targeting only known statuses', () => {
    expect(Object.keys(ROOM_TRANSITIONS).sort()).toEqual([...ROOM_STATUSES].sort());
    for (const targets of Object.values(ROOM_TRANSITIONS)) {
      for (const target of targets) expect(ROOM_STATUSES).toContain(target);
    }
  });

  it('allows the happy path WAITING → READY → STARTING → IN_PROGRESS → FINISHED', () => {
    const path = ['WAITING', 'READY', 'STARTING', 'IN_PROGRESS', 'FINISHED'] as const;
    for (let i = 1; i < path.length; i++) {
      expect(canTransition(ROOM_TRANSITIONS, path[i - 1]!, path[i]!)).toBe(true);
    }
  });

  it('rejects skipping states and leaving terminal states', () => {
    expect(canTransition(ROOM_TRANSITIONS, 'WAITING', 'IN_PROGRESS')).toBe(false);
    expect(canTransition(ROOM_TRANSITIONS, 'FINISHED', 'WAITING')).toBe(false);
    expect(() => assertTransition(ROOM_TRANSITIONS, 'CANCELLED', 'WAITING')).toThrow(
      InvalidTransitionError,
    );
  });

  it('marks exactly FINISHED, CANCELLED, and EXPIRED as terminal', () => {
    const terminal = ROOM_STATUSES.filter((s) => isTerminal(ROOM_TRANSITIONS, s));
    expect(terminal).toEqual(['FINISHED', 'CANCELLED', 'EXPIRED']);
  });
});

describe('match lifecycle', () => {
  it('defines transitions for every status', () => {
    expect(Object.keys(MATCH_TRANSITIONS).sort()).toEqual([...MATCH_STATUSES].sort());
  });

  it('allows the happy path and abort from any non-terminal state', () => {
    expect(() => {
      assertTransition(MATCH_TRANSITIONS, 'CREATED', 'DEALING');
      assertTransition(MATCH_TRANSITIONS, 'DEALING', 'PLAYING');
      assertTransition(MATCH_TRANSITIONS, 'PLAYING', 'RESOLVING');
      assertTransition(MATCH_TRANSITIONS, 'RESOLVING', 'FINISHED');
    }).not.toThrow();
    for (const s of MATCH_STATUSES.filter((s) => !isTerminal(MATCH_TRANSITIONS, s))) {
      expect(canTransition(MATCH_TRANSITIONS, s, 'ABORTED')).toBe(true);
    }
  });

  it('never allows a finished match to be aborted or replayed', () => {
    expect(canTransition(MATCH_TRANSITIONS, 'FINISHED', 'ABORTED')).toBe(false);
    expect(canTransition(MATCH_TRANSITIONS, 'FINISHED', 'PLAYING')).toBe(false);
  });
});
