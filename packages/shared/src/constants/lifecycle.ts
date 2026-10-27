/**
 * Room and match lifecycle states, shared by the database schema (Prisma enums must
 * list the same values), the server state machines, and the web client.
 *
 * Terminal states have no outgoing transitions. A finished room is not reused; a
 * rematch creates a new room so that every match has a clean, auditable lifecycle.
 */

export const ROOM_STATUSES = [
  'WAITING',
  'READY',
  'STARTING',
  'IN_PROGRESS',
  'FINISHED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const ROOM_TRANSITIONS: Readonly<Record<RoomStatus, readonly RoomStatus[]>> = {
  // READY means all four seats are filled and every player is ready.
  WAITING: ['READY', 'CANCELLED', 'EXPIRED'],
  // A player leaving or un-readying sends the room back to WAITING.
  READY: ['WAITING', 'STARTING', 'CANCELLED', 'EXPIRED'],
  // STARTING covers entry-fee charging and dealing; failure returns to WAITING.
  STARTING: ['IN_PROGRESS', 'WAITING', 'CANCELLED'],
  IN_PROGRESS: ['FINISHED', 'CANCELLED'],
  FINISHED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export const MATCH_STATUSES = [
  'CREATED',
  'DEALING',
  'PLAYING',
  'RESOLVING',
  'FINISHED',
  'ABORTED',
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_TRANSITIONS: Readonly<Record<MatchStatus, readonly MatchStatus[]>> = {
  CREATED: ['DEALING', 'ABORTED'],
  DEALING: ['PLAYING', 'ABORTED'],
  // RESOLVING = play has ended; placements and settlement are being computed.
  PLAYING: ['RESOLVING', 'ABORTED'],
  RESOLVING: ['FINISHED', 'ABORTED'],
  FINISHED: [],
  ABORTED: [],
};

export function canTransition<S extends string>(
  table: Readonly<Record<S, readonly S[]>>,
  from: S,
  to: S,
): boolean {
  return table[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invalid state transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition<S extends string>(
  table: Readonly<Record<S, readonly S[]>>,
  from: S,
  to: S,
): void {
  if (!canTransition(table, from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function isTerminal<S extends string>(
  table: Readonly<Record<S, readonly S[]>>,
  state: S,
): boolean {
  return table[state].length === 0;
}
