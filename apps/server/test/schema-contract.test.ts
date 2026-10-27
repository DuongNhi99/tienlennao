import { MatchStatus, RoomStatus } from '@prisma/client';
import { MATCH_STATUSES, ROOM_STATUSES } from '@tienlen/shared';
import { describe, expect, it } from 'vitest';

// The database enums and the shared lifecycle constants must never drift apart.
describe('Prisma schema ↔ shared contract', () => {
  it('RoomStatus enum matches ROOM_STATUSES', () => {
    expect(Object.values(RoomStatus)).toEqual([...ROOM_STATUSES]);
  });

  it('MatchStatus enum matches MATCH_STATUSES', () => {
    expect(Object.values(MatchStatus)).toEqual([...MATCH_STATUSES]);
  });
});
