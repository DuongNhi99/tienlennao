import { CARDS_PER_PLAYER, type PlayerGameView } from '@tienlen/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDataSource } from '@/features/data-source/types';
import { ApiClientError } from '@/lib/api/client';
import { createPreviewDataSource } from '@/lib/dev-preview/preview-data-source';

// The preview backend must enforce the same guarantees the UI relies on from the real server.
const PRACTICE_ROOM = '00000000-0000-4000-8000-000000000a05'; // 3 ready bots, 1 free seat
const PRIVATE_ROOM_CODE = 'FRND55';

let source: GameDataSource;

/** Resolves a data-source call while advancing fake timers past its simulated latency. */
async function call<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.advanceTimersByTimeAsync(300);
  const result = await settled;
  if (!result.ok) throw result.error;
  return result.value;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await call(promise).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiClientError);
  expect((error as ApiClientError).code).toBe(code);
}

async function startPracticeMatch(): Promise<PlayerGameView> {
  await call(source.joinRoom(PRACTICE_ROOM));
  await call(source.setReady(PRACTICE_ROOM, true));
  await vi.advanceTimersByTimeAsync(1500); // bot host auto-starts once all are ready
  return call(source.getGameView(PRACTICE_ROOM));
}

async function waitForMyTurn(): Promise<PlayerGameView> {
  for (let i = 0; i < 10; i++) {
    const view = await call(source.getGameView(PRACTICE_ROOM));
    if (view.turnSeat === view.mySeat) return view;
    await vi.advanceTimersByTimeAsync(1000);
  }
  throw new Error('never became my turn');
}

beforeEach(() => {
  vi.useFakeTimers();
  source = createPreviewDataSource();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('preview data source — rooms', () => {
  it('de-duplicates room creation by request id and blocks a second room', async () => {
    const input = {
      visibility: 'PUBLIC' as const,
      entryFee: 0,
      turnTimerSeconds: 30,
      requestId: crypto.randomUUID(),
    };
    const first = await call(source.createRoom(input));
    const retry = await call(source.createRoom(input));
    expect(retry.roomId).toBe(first.roomId);
    await expectCode(
      source.createRoom({ ...input, requestId: crypto.randomUUID() }),
      'ALREADY_IN_ROOM',
    );
  });

  it('rejects unknown codes and wrong private-room passwords', async () => {
    await expectCode(source.joinRoomByCode({ code: 'ZZZZZZ' }), 'ROOM_NOT_FOUND');
    await expectCode(
      source.joinRoomByCode({ code: PRIVATE_ROOM_CODE, password: 'sai' }),
      'INVALID_ROOM_PASSWORD',
    );
    const { roomId } = await call(
      source.joinRoomByCode({ code: PRIVATE_ROOM_CODE, password: 'banbe' }),
    );
    const room = await call(source.getRoom(roomId));
    expect(room.mySeat).not.toBeNull();
  });

  it('only the host may start, and only when the room is READY', async () => {
    const { roomId } = await call(
      source.createRoom({
        visibility: 'PUBLIC',
        entryFee: 0,
        turnTimerSeconds: 30,
        requestId: crypto.randomUUID(),
      }),
    );
    await expectCode(source.startMatch(roomId), 'ROOM_NOT_READY');
  });
});

describe('preview data source — game', () => {
  it('deals 13 cards each and never exposes opponents’ hands', async () => {
    const view = await startPracticeMatch();
    expect(view.myHand).toHaveLength(CARDS_PER_PLAYER);
    expect(view.seats.reduce((sum, s) => sum + s.cardCount, 0)).toBe(52);
    for (const seat of view.seats) {
      expect(Object.keys(seat)).not.toContain('hand');
      expect(Object.keys(seat)).not.toContain('cards');
    }
    expect(Object.keys(view)).not.toContain('hands');
  });

  it('enforces turn order, card ownership, state version, and idempotency', async () => {
    await startPracticeMatch();
    const view = await waitForMyTurn();
    const card = view.myHand[0]!;
    const notMine = ['3S', '3C', '3D', '3H'].find((c) => !view.myHand.includes(c as never))!;
    const base = { roomId: PRACTICE_ROOM, stateVersion: view.stateVersion };

    await expectCode(
      source.playCards({
        ...base,
        stateVersion: view.stateVersion - 1,
        actionId: 'a1',
        cards: [card],
      }),
      'STALE_STATE',
    );
    await expectCode(
      source.playCards({ ...base, actionId: 'a2', cards: [notMine as never] }),
      'INVALID_CARD_SELECTION',
    );
    await expectCode(
      source.playCards({ ...base, actionId: 'a3', cards: [card, card] }),
      'INVALID_CARD_SELECTION',
    );

    const after = await call(source.playCards({ ...base, actionId: 'a4', cards: [card] }));
    expect(after.myHand).toHaveLength(view.myHand.length - 1);
    expect(after.myHand).not.toContain(card);

    // Replaying the same action ID is a no-op, even with the old state version.
    const replay = await call(source.playCards({ ...base, actionId: 'a4', cards: [card] }));
    expect(replay.myHand).toHaveLength(view.myHand.length - 1);

    if (after.turnSeat !== after.mySeat) {
      await expectCode(
        source.playCards({
          ...base,
          stateVersion: after.stateVersion,
          actionId: 'a5',
          cards: [after.myHand[0]!],
        }),
        'NOT_YOUR_TURN',
      );
    }
  });
});

describe('preview data source — rewards', () => {
  it('pays the daily reward exactly once', async () => {
    const before = await call(source.getCurrentUser());
    const { amount, balance } = await call(source.claimDailyReward());
    expect(balance).toBe(before.balance + amount);
    await expectCode(source.claimDailyReward(), 'ACTION_ALREADY_PROCESSED');
    expect((await call(source.getCurrentUser())).balance).toBe(balance);
  });
});
