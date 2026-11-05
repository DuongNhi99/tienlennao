import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  ALL_CARD_IDS,
  apiErrorSchema,
  type CardId,
  currentRoomSchema,
  DEFAULT_GAME_RULES,
  detectInstantWin,
  type GameRules,
  type MatchState,
  matchResultSchema,
  matchmakingStatusSchema,
  type PlayerGameView,
  playerGameViewSchema,
  roomDetailSchema,
  roomOptionsSchema,
  roomSummarySchema,
  SOCKET_IO_PATH,
} from '@tienlen/shared';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Dealer } from '../../src/game/dealer';
import { GameService } from '../../src/game/game.service';
import { RoomsService } from '../../src/rooms/rooms.service';
import { createTestApp, registerUser, type TestContext } from './helpers';
import { choosePlay, playToEnd, TestDealer } from './play-helpers';

const dealer = new TestDealer();
let ctx: TestContext;
let baseUrl: string;

beforeAll(async () => {
  ctx = await createTestApp((builder) => builder.overrideProvider(Dealer).useValue(dealer));
  await ctx.app.listen(0, '127.0.0.1');
  baseUrl = `http://127.0.0.1:${(ctx.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await ctx.app.close();
});

type Player = Awaited<ReturnType<typeof registerUser>>;
const API = '/api/v1';
const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;
const CARD_PATTERN = /"(?:10|[2-9JQKA])[SCDH]"/g;

async function players(count: number): Promise<Player[]> {
  return Promise.all(Array.from({ length: count }, () => registerUser(ctx.server)));
}

async function createRoom(host: Player, fields: Record<string, unknown> = {}): Promise<string> {
  const res = await host.http
    .post(`${API}/rooms`)
    .send({
      visibility: 'PUBLIC',
      entryFee: 0,
      turnTimerSeconds: 30,
      requestId: randomUUID(),
      ...fields,
    })
    .expect(201);
  return (res.body as { roomId: string }).roomId;
}

async function detail(player: Player, roomId: string) {
  return roomDetailSchema.parse((await player.http.get(`${API}/rooms/${roomId}`).expect(200)).body);
}

/** Four players in one room, all ready. Returns the room ID. */
async function readyRoom(table: Player[]): Promise<string> {
  const roomId = await createRoom(table[0]!);
  for (const p of table.slice(1))
    await p.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);
  for (const p of table)
    await p.http.put(`${API}/rooms/${roomId}/ready`).send({ ready: true }).expect(200);
  return roomId;
}

async function view(player: Player, roomId: string): Promise<PlayerGameView> {
  return playerGameViewSchema.parse(
    (await player.http.get(`${API}/rooms/${roomId}/game`).expect(200)).body,
  );
}

/** The engine state as stored by the server (test-only peek at the database). */
async function storedState(roomId: string): Promise<MatchState> {
  const match = await ctx.prisma.match.findFirstOrThrow({ where: { roomId } });
  return (match.stateSnapshot as unknown as { engine: MatchState }).engine;
}

function connect(player: Player | null, origin?: string): Promise<Socket> {
  const socket = io(baseUrl, {
    path: SOCKET_IO_PATH,
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: {
      ...(player ? { cookie: player.cookie } : {}),
      ...(origin ? { origin } : {}),
    },
  });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}

/** The caller's seated room (`GET /rooms/current`), the game they can continue. */
async function currentRoom(player: Player) {
  const res = await player.http.get(`${API}/rooms/current`).expect(200);
  return currentRoomSchema.parse(res.body).room;
}

/**
 * Runs `body` with `rules` as the active preset (a new, higher version of `default`), then
 * retires that version so later tests play by the usual rules again.
 */
async function withRules(rules: GameRules, body: () => Promise<void>): Promise<void> {
  const top = await ctx.prisma.gameRuleConfiguration.aggregate({
    where: { key: 'default' },
    _max: { version: true },
  });
  const preset = await ctx.prisma.gameRuleConfiguration.create({
    data: {
      key: 'default',
      // Far above the fixed versions other suites upsert (1, 2).
      version: Math.max(top._max.version ?? 0, 1000) + 1,
      name: 'Rule variant test',
      isActive: true,
      rules,
      allowedEntryFees: [0],
      allowedTurnTimers: [30],
    },
  });
  try {
    await body();
  } finally {
    await ctx.prisma.gameRuleConfiguration.update({
      where: { id: preset.id },
      data: { isActive: false },
    });
  }
}

/** Four hands starting with the given cards, filled up from the rest of the deck in order. */
function plannedDeal(fixed: CardId[][]): CardId[][] {
  const used = new Set(fixed.flat());
  const rest = ALL_CARD_IDS.filter((card) => !used.has(card));
  return fixed.map((hand) => [...hand, ...rest.splice(0, 13 - hand.length)]);
}

async function eventually(check: () => boolean | Promise<boolean>, what: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

describe('rooms', () => {
  it('accepts only the entry fees and timers the active preset offers', async () => {
    const [host] = await players(1);
    const options = roomOptionsSchema.parse(
      (await host!.http.get(`${API}/rooms/options`).expect(200)).body,
    );
    expect(options.entryFees).toContain(0);
    expect(options.entryFees).not.toContain(123);
    const res = await host!.http
      .post(`${API}/rooms`)
      .send({ visibility: 'PUBLIC', entryFee: 123, turnTimerSeconds: 30, requestId: randomUUID() })
      .expect(400);
    expect(errorCode(res.body)).toBe('VALIDATION_ERROR');
  });

  it('reports the room a player is seated in, so an unfinished game can be continued', async () => {
    const [host, other] = await players(2);
    expect(await currentRoom(host!)).toBeNull();
    const roomId = await createRoom(host!);
    expect(await currentRoom(host!)).toMatchObject({ id: roomId, status: 'WAITING' });
    expect(await currentRoom(other!)).toBeNull();
    await host!.http.post(`${API}/rooms/${roomId}/leave`).expect(204);
    expect(await currentRoom(host!)).toBeNull();
  });

  it('creates a room once per request ID and lists it publicly', async () => {
    const [host, other] = await players(2);
    const requestId = randomUUID();
    const body = {
      visibility: 'PUBLIC',
      entryFee: 0,
      turnTimerSeconds: 30,
      requestId,
      name: 'Bàn A',
    };
    const a = await host!.http.post(`${API}/rooms`).send(body).expect(201);
    const b = await host!.http.post(`${API}/rooms`).send(body).expect(201);
    expect(a.body).toEqual(b.body);
    const roomId = (a.body as { roomId: string }).roomId;

    const list = roomSummarySchema
      .array()
      .parse((await other!.http.get(`${API}/rooms?onlyWithSeats=true`).expect(200)).body);
    expect(list.find((r) => r.id === roomId)).toMatchObject({ name: 'Bàn A', playerCount: 1 });

    const room = await detail(host!, roomId);
    expect(room).toMatchObject({
      mySeat: 0,
      hostId: host!.userId,
      status: 'WAITING',
      matchId: null,
    });
    expect(room.seats[0]!.player).toMatchObject({ userId: host!.userId, isHost: true });

    // A player holds one seat at a time.
    const again = await host!.http
      .post(`${API}/rooms`)
      .send({ ...body, requestId: randomUUID() })
      .expect(409);
    expect(errorCode(again.body)).toBe('ALREADY_IN_ROOM');
  });

  it('fills four seats, rejects a fifth, and becomes READY when everyone is ready', async () => {
    const table = await players(5);
    const [host, b, c, d, e] = table as [Player, Player, Player, Player, Player];
    const roomId = await createRoom(host);
    for (const p of [b, c, d]) {
      await p.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);
    }
    // Joining twice is a no-op.
    await b.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);
    const full = await e.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(409);
    expect(errorCode(full.body)).toBe('ROOM_FULL');

    const early = await host.http.post(`${API}/rooms/${roomId}/start`).expect(409);
    expect(errorCode(early.body)).toBe('ROOM_NOT_READY');

    for (const p of [host, b, c, d]) {
      await p.http.put(`${API}/rooms/${roomId}/ready`).send({ ready: true }).expect(200);
    }
    expect((await detail(host, roomId)).status).toBe('READY');
    await b.http.put(`${API}/rooms/${roomId}/ready`).send({ ready: false }).expect(200);
    expect((await detail(host, roomId)).status).toBe('WAITING');
  });

  it('can start with two players, never with one', { timeout: 120_000 }, async () => {
    const [host, guest] = await players(2);
    const roomId = await createRoom(host!);
    await host!.http.put(`${API}/rooms/${roomId}/ready`).send({ ready: true }).expect(200);
    // Alone and ready is not enough.
    expect((await detail(host!, roomId)).status).toBe('WAITING');
    const alone = await host!.http.post(`${API}/rooms/${roomId}/start`).expect(409);
    expect(errorCode(alone.body)).toBe('ROOM_NOT_READY');

    await guest!.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);
    await guest!.http.put(`${API}/rooms/${roomId}/ready`).send({ ready: true }).expect(200);
    expect((await detail(host!, roomId)).status).toBe('READY');
    await host!.http.post(`${API}/rooms/${roomId}/start`).expect(200);

    const v = await view(guest!, roomId);
    expect(v.seats).toHaveLength(2);
    expect(v.myHand).toHaveLength(13);
    expect(v.seats.map((s) => s.cardCount)).toEqual([13, 13]);
    await playToEnd([host!, guest!], roomId);
    const result = matchResultSchema.parse(
      (await host!.http.get(`${API}/rooms/${roomId}/game/result`).expect(200)).body,
    );
    expect(result.placements.map((p) => p.placement)).toEqual([1, 2]);
  });

  it(
    'lets the players of a finished match play again in a new room',
    { timeout: 120_000 },
    async () => {
      const [host, guest, stranger] = await players(3);
      const roomId = await createRoom(host!, { visibility: 'PRIVATE', password: 'banbe' });
      await guest!.http.post(`${API}/rooms/${roomId}/join`).send({ password: 'banbe' }).expect(200);
      for (const p of [host!, guest!])
        await p.http.put(`${API}/rooms/${roomId}/ready`).send({ ready: true }).expect(200);
      const early = await guest!.http.post(`${API}/rooms/${roomId}/rematch`).expect(403);
      expect(errorCode(early.body)).toBe('FORBIDDEN');
      await host!.http.post(`${API}/rooms/${roomId}/start`).expect(200);
      const running = await guest!.http.post(`${API}/rooms/${roomId}/rematch`).expect(409);
      expect(errorCode(running.body)).toBe('ROOM_ALREADY_STARTED');
      await playToEnd([host!, guest!], roomId);
      expect((await detail(guest!, roomId)).rematchRoomId).toBeNull();

      // Only the match's players may ask; the first to ask hosts the new room.
      await stranger!.http.post(`${API}/rooms/${roomId}/rematch`).expect(403);
      const first = await guest!.http.post(`${API}/rooms/${roomId}/rematch`).expect(200);
      const nextId = (first.body as { roomId: string }).roomId;
      expect(nextId).not.toBe(roomId);
      expect((await detail(host!, roomId)).rematchRoomId).toBe(nextId);
      // Asking again is idempotent; the other player follows without the password.
      await guest!.http.post(`${API}/rooms/${roomId}/rematch`).expect(200, { roomId: nextId });
      await host!.http.post(`${API}/rooms/${roomId}/rematch`).expect(200, { roomId: nextId });

      const next = await detail(host!, nextId);
      expect(next).toMatchObject({
        status: 'WAITING',
        visibility: 'PRIVATE',
        hasPassword: true,
        hostId: (await detail(guest!, nextId)).seats[0]!.player!.userId,
        matchId: null,
      });
      expect(next.seats.filter((s) => s.player)).toHaveLength(2);
      for (const p of [host!, guest!])
        await p.http.put(`${API}/rooms/${nextId}/ready`).send({ ready: true }).expect(200);
      await guest!.http.post(`${API}/rooms/${nextId}/start`).expect(200);
      expect((await view(host!, nextId)).myHand).toHaveLength(13);
    },
  );

  it('lets only the host change settings, which resets readiness', async () => {
    const [host, guest] = await players(2);
    const roomId = await createRoom(host!);
    await guest!.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);
    await guest!.http.put(`${API}/rooms/${roomId}/ready`).send({ ready: true }).expect(200);

    const denied = await guest!.http
      .patch(`${API}/rooms/${roomId}/settings`)
      .send({ entryFee: 0, turnTimerSeconds: 15 })
      .expect(403);
    expect(errorCode(denied.body)).toBe('FORBIDDEN');
    const room = roomDetailSchema.parse(
      (
        await host!.http
          .patch(`${API}/rooms/${roomId}/settings`)
          .send({ entryFee: 0, turnTimerSeconds: 15 })
          .expect(200)
      ).body,
    );
    expect(room.turnTimerSeconds).toBe(15);
    expect(room.seats[1]!.player?.isReady).toBe(false);
  });

  it('hands the host role on when the host leaves and cancels an empty room', async () => {
    const [host, guest] = await players(2);
    const roomId = await createRoom(host!);
    await guest!.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);

    await host!.http.post(`${API}/rooms/${roomId}/leave`).expect(204);
    expect((await detail(guest!, roomId)).hostId).toBe(guest!.userId);
    // Leaving again is a no-op, and the seat is free for another room.
    await host!.http.post(`${API}/rooms/${roomId}/leave`).expect(204);
    await createRoom(host!);

    await guest!.http.post(`${API}/rooms/${roomId}/leave`).expect(204);
    const room = await ctx.prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(room.status).toBe('CANCELLED');
  });

  it('protects private rooms with a password and hides them from outsiders', async () => {
    const [host, friend, stranger] = await players(3);
    const roomId = await createRoom(host!, { visibility: 'PRIVATE', password: 'banbe' });
    const { code } = await detail(host!, roomId);

    const list = roomSummarySchema.array().parse((await stranger!.http.get(`${API}/rooms`)).body);
    expect(list.some((r) => r.id === roomId)).toBe(false);
    expect(errorCode((await stranger!.http.get(`${API}/rooms/${roomId}`).expect(403)).body)).toBe(
      'FORBIDDEN',
    );

    const wrong = await friend!.http
      .post(`${API}/rooms/join-by-code`)
      .send({ code: code.toLowerCase(), password: 'sai-mat-khau' })
      .expect(403);
    expect(errorCode(wrong.body)).toBe('INVALID_ROOM_PASSWORD');
    await friend!.http
      .post(`${API}/rooms/join-by-code`)
      .send({ code: code.toLowerCase(), password: 'banbe' })
      .expect(200);
    expect((await detail(friend!, roomId)).mySeat).toBe(1);
  });

  it('expires idle rooms and frees their seats', async () => {
    const [host] = await players(1);
    const roomId = await createRoom(host!);
    await ctx.app.get(RoomsService).sweep(new Date(Date.now() + 31 * 60_000));
    expect((await ctx.prisma.room.findUniqueOrThrow({ where: { id: roomId } })).status).toBe(
      'EXPIRED',
    );
    expect(await ctx.prisma.roomPlayer.count({ where: { roomId } })).toBe(0);
  });
});

describe('a complete match between four independent clients', () => {
  it('plays to the end without leaking hidden cards', { timeout: 120_000 }, async () => {
    const table = await players(4);
    const sockets = await Promise.all(table.map((p) => connect(p)));
    const received: { player: number; event: string; payload: unknown }[] = [];
    sockets.forEach((socket, player) =>
      socket.onAny((event: string, payload: unknown) => received.push({ player, event, payload })),
    );

    try {
      const roomId = await readyRoom(table);
      const notHost = await table[1]!.http.post(`${API}/rooms/${roomId}/start`).expect(403);
      expect(errorCode(notHost.body)).toBe('FORBIDDEN');
      await table[0]!.http.post(`${API}/rooms/${roomId}/start`).expect(200);
      expect((await detail(table[0]!, roomId)).status).toBe('IN_PROGRESS');

      // Nobody may join or leave a running match; outsiders cannot see it.
      const [outsider] = await players(1);
      expect(
        errorCode((await outsider!.http.post(`${API}/rooms/${roomId}/join`).send({})).body),
      ).toBe('ROOM_ALREADY_STARTED');
      expect(
        errorCode((await outsider!.http.get(`${API}/rooms/${roomId}/game`).expect(403)).body),
      ).toBe('FORBIDDEN');
      expect(
        errorCode((await table[2]!.http.post(`${API}/rooms/${roomId}/leave`).expect(409)).body),
      ).toBe('ROOM_ALREADY_STARTED');

      // The deal: 13 cards each, all 52 distinct, each player sees only their own hand.
      const views = await Promise.all(table.map((p) => view(p, roomId)));
      const dealt = views.flatMap((v) => v.myHand);
      expect(new Set(dealt).size).toBe(52);
      for (const v of views) {
        expect(v.myHand).toHaveLength(13);
        // Every card named anywhere in the view is one of the player's own.
        const named = new Set(JSON.stringify(v).match(CARD_PATTERN));
        expect(named).toEqual(new Set(v.myHand.map((card) => `"${card}"`)));
        expect(v.seats.every((s) => s.cardCount === 13)).toBe(true);
        // Only the opener is told which card the first play must contain: they hold it.
        expect(v.openingCard).toBe(v.turnSeat === v.mySeat ? '3S' : null);
        expect(v.rules).toMatchObject({ specVersion: 3 });
      }
      // Each player can find the running match again (a reload, another device).
      for (const p of table) {
        expect(await currentRoom(p)).toMatchObject({ id: roomId, status: 'IN_PROGRESS' });
      }

      // Rejections, checked on the opening position.
      const first = views.find((v) => v.turnSeat === v.mySeat)!;
      const turnPlayer = table[views.indexOf(first)]!;
      const waiting = table[(views.indexOf(first) + 1) % 4]!;
      const act = (p: Player, path: 'play' | 'pass', body: object) =>
        p.http
          .post(`${API}/rooms/${roomId}/game/${path}`)
          .send({ actionId: randomUUID(), ...body });
      const version = first.stateVersion;
      expect(
        errorCode((await act(waiting, 'pass', { stateVersion: version }).expect(409)).body),
      ).toBe('NOT_YOUR_TURN');
      expect(
        errorCode((await act(turnPlayer, 'pass', { stateVersion: version }).expect(409)).body),
      ).toBe('PASS_NOT_ALLOWED');
      expect(
        errorCode((await act(turnPlayer, 'pass', { stateVersion: version + 5 }).expect(409)).body),
      ).toBe('STALE_STATE');
      const notMine = dealt.find((card) => !first.myHand.includes(card))!;
      expect(
        errorCode(
          (await act(turnPlayer, 'play', { stateVersion: version, cards: [notMine] }).expect(400))
            .body,
        ),
      ).toBe('INVALID_CARD_SELECTION');
      const notOpening = first.myHand.find((card) => card !== '3S')!;
      expect(
        errorCode(
          (
            await act(turnPlayer, 'play', { stateVersion: version, cards: [notOpening] }).expect(
              400,
            )
          ).body,
        ),
      ).toBe('INVALID_COMBINATION');

      // The opening play, sent twice with one action ID, is applied once.
      const actionId = randomUUID();
      const opening = { actionId, stateVersion: version, cards: choosePlay(first)! };
      const once = playerGameViewSchema.parse(
        (await turnPlayer.http.post(`${API}/rooms/${roomId}/game/play`).send(opening).expect(200))
          .body,
      );
      const twice = playerGameViewSchema.parse(
        (await turnPlayer.http.post(`${API}/rooms/${roomId}/game/play`).send(opening).expect(200))
          .body,
      );
      expect(once.stateVersion).toBe(version + 1);
      expect(twice.stateVersion).toBe(version + 1);
      expect(await ctx.prisma.matchEvent.count({ where: { match: { roomId }, actionId } })).toBe(1);

      // Play on: whoever's turn it is acts from their own view only.
      let current = once;
      for (let step = 0; current.status === 'PLAYING'; step++) {
        if (step > 400) throw new Error('The match did not end');
        const seat = current.turnSeat!;
        const actor = table[views.map((v) => v.mySeat).indexOf(seat)]!;
        const mine = await view(actor, roomId);

        // Only the actor's own cards and the cards on the table are ever visible.
        const visible = new Set(JSON.stringify(mine).match(CARD_PATTERN));
        const allowed = new Set(
          [...mine.myHand, ...(mine.currentTrick?.cards ?? [])].map((c) => `"${c}"`),
        );
        expect([...visible].every((card) => allowed.has(card))).toBe(true);
        const hidden = (await storedState(roomId)).hands.filter((_, s) => s !== seat).flat();
        expect(hidden.some((card) => mine.myHand.includes(card))).toBe(false);

        const cards = choosePlay(mine);
        const res = cards
          ? await act(actor, 'play', { stateVersion: mine.stateVersion, cards })
          : await act(actor, 'pass', { stateVersion: mine.stateVersion });
        expect(res.status).toBe(200);
        current = playerGameViewSchema.parse(res.body);
      }

      // Results: four distinct placements, stats updated, room closed and seats freed.
      expect(current.status).toBe('FINISHED');
      const result = matchResultSchema.parse(
        (await table[3]!.http.get(`${API}/rooms/${roomId}/game/result`).expect(200)).body,
      );
      expect(result.placements.map((p) => p.placement)).toEqual([1, 2, 3, 4]);
      expect(result.placements.every((p) => p.coinDelta === 0)).toBe(true);
      // Once finished, every leftover hand is revealed to everyone, in the view and the result.
      const finalHands = (await storedState(roomId)).hands;
      expect(current.seats.map((s) => s.revealedCards)).toEqual(finalHands);
      for (const p of result.placements) {
        expect(p.remainingCards).toEqual(finalHands[p.seatIndex]);
        expect(p.remainingCards).toHaveLength(p.cardsRemaining);
      }
      expect(result.placements[3]!.remainingCards.length).toBeGreaterThan(0);
      // Leftover penalties (thúi heo …) and chops come from the final state.
      const final = await storedState(roomId);
      expect(result.reason).toBe('NORMAL');
      expect(result.chops).toHaveLength(final.chops.length);
      for (const p of result.placements) {
        expect(p.penaltyPoints).toBe(p.penalties.reduce((sum, item) => sum + item.points, 0));
        const twos = p.remainingCards.filter((card) => card.startsWith('2'));
        expect(p.penalties.filter((item) => item.kind.endsWith('_TWO'))).toHaveLength(twos.length);
        if (p.placement === 1) expect(p.penalties).toEqual([]);
      }
      // The match is over: nothing left to continue.
      for (const p of table) expect(await currentRoom(p)).toBeNull();
      const winner = result.placements[0]!.userId;
      const profiles = await ctx.prisma.userProfile.findMany({
        where: { userId: { in: table.map((p) => p.userId) } },
      });
      for (const profile of profiles) {
        expect(profile.matchesPlayed).toBe(1);
        expect(profile.matchesWon).toBe(profile.userId === winner ? 1 : 0);
      }
      const finishedRoom = await detail(table[2]!, roomId);
      expect(finishedRoom).toMatchObject({
        status: 'FINISHED',
        mySeat: expect.any(Number) as number,
      });
      expect(finishedRoom.matchId).toBe(current.matchId);
      expect(await ctx.prisma.roomPlayer.count({ where: { roomId } })).toBe(0);
      const late = await act(table[0]!, 'pass', { stateVersion: current.stateVersion }).expect(409);
      expect(errorCode(late.body)).toBe('MATCH_FINISHED');

      // The event log is gap-free and starts with the deal.
      const events = await ctx.prisma.matchEvent.findMany({
        where: { matchId: current.matchId },
        orderBy: { sequence: 'asc' },
      });
      expect(events[0]!.type).toBe('DEALT');
      expect(events.map((e) => e.sequence)).toEqual(events.map((_, i) => i));
      expect(events.at(-1)!.type).toBe('MATCH_FINISHED');

      // Every client was notified of every version, and no notification carried a card.
      await eventually(
        () =>
          [0, 1, 2, 3].every((player) =>
            received.some(
              (r) =>
                r.player === player &&
                r.event === 'game:updated' &&
                (r.payload as { stateVersion: number }).stateVersion === current.stateVersion,
            ),
          ),
        'final game:updated on every socket',
      );
      expect(JSON.stringify(received).match(CARD_PATTERN)).toBeNull();
      expect(received.some((r) => r.event === 'user:updated')).toBe(true);
    } finally {
      sockets.forEach((socket) => socket.close());
    }
  });
});

describe('turn deadlines', () => {
  it('are enforced by a sweep that any instance can run, once', async () => {
    const table = await players(4);
    const roomId = await readyRoom(table);
    await table[0]!.http.post(`${API}/rooms/${roomId}/start`).expect(200);
    const match = await ctx.prisma.match.findFirstOrThrow({ where: { roomId } });
    const game = ctx.app.get(GameService);
    const later = new Date(Date.now() + 60_000);

    // Seen from a minute later, the turn is overdue: one timeout, and only one.
    expect(await game.sweepDeadlines(later)).toBeGreaterThanOrEqual(1);
    const after = await ctx.prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(after.stateVersion).toBe(match.stateVersion + 1);
    const timeouts = await ctx.prisma.matchEvent.count({
      where: { matchId: match.id, type: 'TURN_TIMEOUT' },
    });
    expect(timeouts).toBe(1);
    // The next turn has a fresh deadline, so an immediate second sweep changes nothing.
    await game.sweepDeadlines();
    expect(
      (await ctx.prisma.match.findUniqueOrThrow({ where: { id: match.id } })).stateVersion,
    ).toBe(after.stateVersion);
  });

  it('applies the timeout action once the deadline has passed', async () => {
    const table = await players(4);
    const roomId = await readyRoom(table);
    await table[0]!.http.post(`${API}/rooms/${roomId}/start`).expect(200);
    const match = await ctx.prisma.match.findFirstOrThrow({ where: { roomId } });
    const game = ctx.app.get(GameService);

    // Not yet due, or decided on another version: nothing happens.
    expect(await game.expireTurn(match.id, match.stateVersion)).toBe(false);
    const later = new Date(Date.now() + 60_000);
    expect(await game.expireTurn(match.id, match.stateVersion + 1, later)).toBe(false);

    const before = await storedState(roomId);
    expect(await game.expireTurn(match.id, match.stateVersion, later)).toBe(true);
    const after = await storedState(roomId);
    expect(after.version).toBe(before.version + 1);
    // Leading with 3♠ by timeout satisfies the opening rule.
    expect(after.table?.combination.cards).toEqual(['3S']);
    expect(
      await ctx.prisma.matchEvent.count({ where: { matchId: match.id, type: 'TURN_TIMEOUT' } }),
    ).toBe(1);
  });
});

describe('instant wins', () => {
  it('finishes the match at the start and records the result', async () => {
    const table = await players(4);
    // Seat 2 gets all four 2s; the others keep ordinary hands.
    const hands = dealer.deal(4);
    const twos: CardId[] = ['2S', '2C', '2D', '2H'];
    for (const seat of [0, 1, 3]) {
      for (const two of twos.filter((card) => hands[seat]!.includes(card))) {
        const swap = hands[2]!.find((card) => !twos.includes(card))!;
        hands[seat] = hands[seat]!.map((card) => (card === two ? swap : card));
        hands[2] = hands[2]!.map((card) => (card === swap ? two : card));
      }
    }
    expect(hands.map((hand) => detectInstantWin(hand, DEFAULT_GAME_RULES.instantWins))).toEqual([
      null,
      null,
      'FOUR_TWOS',
      null,
    ]);
    dealer.planned.push(hands);

    const roomId = await readyRoom(table);
    await table[0]!.http.post(`${API}/rooms/${roomId}/start`).expect(200);
    expect((await detail(table[0]!, roomId)).status).toBe('FINISHED');
    const result = matchResultSchema.parse(
      (await table[1]!.http.get(`${API}/rooms/${roomId}/game/result`).expect(200)).body,
    );
    expect(result.placements.map((p) => p.seatIndex)).toEqual([2, 3, 0, 1]);
    expect(result).toMatchObject({ reason: 'INSTANT_WIN', instantWinKind: 'FOUR_TWOS', chops: [] });
    expect(result.placements.every((p) => p.penaltyPoints === 0)).toBe(true);
    const game = await view(table[2]!, roomId);
    expect(game).toMatchObject({ status: 'FINISHED', turnSeat: null, canPass: false });
    const events = await ctx.prisma.matchEvent.findMany({
      where: { matchId: result.matchId },
      orderBy: { sequence: 'asc' },
    });
    expect(events.map((e) => e.type)).toEqual(['DEALT', 'MATCH_FINISHED']);
  });
});

describe('rule variants', () => {
  it(
    'lets the previous winner lead the rematch (starter: PREVIOUS_WINNER)',
    { timeout: 120_000 },
    async () => {
      await withRules({ ...DEFAULT_GAME_RULES, starter: 'PREVIOUS_WINNER' }, async () => {
        const pair = await players(2);
        const [host, guest] = pair as [Player, Player];
        const roomId = await createRoom(host);
        await guest.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);
        for (const p of pair)
          await p.http.put(`${API}/rooms/${roomId}/ready`).send({ ready: true }).expect(200);
        await host.http.post(`${API}/rooms/${roomId}/start`).expect(200);
        // No previous match: the lowest dealt card opens, as usual.
        if ((await view(host, roomId)).status === 'PLAYING') {
          const opening = await Promise.all(pair.map((p) => view(p, roomId)));
          expect(opening.filter((v) => v.openingCard !== null)).toHaveLength(1);
        }
        await playToEnd(pair, roomId);
        const result = matchResultSchema.parse(
          (await host.http.get(`${API}/rooms/${roomId}/game/result`).expect(200)).body,
        );
        const winner = pair.findIndex((p) => p.userId === result.placements[0]!.userId);

        // The guest asks first, so the guest hosts the new room and sits in seat 0.
        const next = await guest.http.post(`${API}/rooms/${roomId}/rematch`).expect(200);
        const nextId = (next.body as { roomId: string }).roomId;
        await host.http.post(`${API}/rooms/${roomId}/rematch`).expect(200);
        for (const p of pair)
          await p.http.put(`${API}/rooms/${nextId}/ready`).send({ ready: true }).expect(200);
        await guest.http.post(`${API}/rooms/${nextId}/start`).expect(200);
        const views = await Promise.all(pair.map((p) => view(p, nextId)));
        if (views[0]!.status !== 'PLAYING') return; // an instant win decided the rematch
        expect(views[winner]!.turnSeat).toBe(views[winner]!.mySeat);
        expect(views.every((v) => v.openingCard === null)).toBe(true);
      });
    },
  );

  it('accepts a chop out of turn (bombs.outOfTurn), and only a chop', async () => {
    const rules: GameRules = {
      ...DEFAULT_GAME_RULES,
      instantWins: [],
      bombs: { ...DEFAULT_GAME_RULES.bombs, outOfTurn: true },
    };
    await withRules(rules, async () => {
      const table = await players(4);
      dealer.planned.push(plannedDeal([['3S'], ['2H'], [], ['7S', '7C', '7D', '7H']]));
      const roomId = await readyRoom(table);
      await table[0]!.http.post(`${API}/rooms/${roomId}/start`).expect(200);
      const play = async (seat: number, cards: CardId[], status = 200) => {
        const { stateVersion } = await view(table[seat]!, roomId);
        return table[seat]!.http.post(`${API}/rooms/${roomId}/game/play`)
          .send({ actionId: randomUUID(), stateVersion, cards })
          .expect(status);
      };
      await play(0, ['3S']);
      await play(1, ['2H']);
      // Seat 2's turn. A normal beat out of turn is refused; seat 3's four 7s chop the 2.
      const refused = await play(0, [(await view(table[0]!, roomId)).myHand.at(-1)!], 409);
      expect(errorCode(refused.body)).toBe('NOT_YOUR_TURN');
      const chopped = playerGameViewSchema.parse((await play(3, ['7S', '7C', '7D', '7H'])).body);
      expect(chopped).toMatchObject({ turnSeat: 0, currentTrick: { seatIndex: 3 } });
      expect((await storedState(roomId)).chops).toMatchObject([{ seat: 3, choppedSeat: 1 }]);
      const event = await ctx.prisma.matchEvent.findFirstOrThrow({
        where: { match: { roomId }, type: 'PLAY', actorUserId: table[3]!.userId },
      });
      expect(event.payload).toMatchObject({ outOfTurn: true, choppedSeat: 1 });
    });
  });
});

describe('realtime connections', () => {
  it('refuses connections without a session or from a foreign origin', async () => {
    const [player] = await players(1);
    await expect(connect(null)).rejects.toThrow();
    await expect(connect(player!, 'https://evil.example')).rejects.toThrow();
    const socket = await connect(player!, 'http://localhost:3000');
    socket.close();
  });

  it('marks a dropped player as disconnected and frees the seat after the grace period', async () => {
    const [host, guest] = await players(2);
    const roomId = await createRoom(host!);
    await guest!.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);
    const connected = async () => (await detail(host!, roomId)).seats[1]!.player?.connected;

    const socket = await connect(guest!);
    socket.close();
    await eventually(async () => (await connected()) === false, 'disconnected flag');

    const again = await connect(guest!);
    await eventually(async () => (await connected()) === true, 'reconnected flag');
    again.close();
    await eventually(async () => (await connected()) === false, 'disconnected flag');

    await ctx.app.get(RoomsService).sweep(new Date(Date.now() + 61_000));
    expect((await detail(host!, roomId)).seats[1]!.player).toBeNull();
  });
});

describe('quick match', () => {
  it('seats four searching players together and starts the match', async () => {
    const table = await players(4);
    const statuses = [];
    for (const p of table) {
      statuses.push(
        matchmakingStatusSchema.parse(
          (await p.http.post(`${API}/matchmaking`).send({ entryFee: 0 }).expect(201)).body,
        ),
      );
    }
    expect(statuses.slice(0, 3).map((s) => s.state)).toEqual([
      'SEARCHING',
      'SEARCHING',
      'SEARCHING',
    ]);
    expect(statuses[3]!.state).toBe('MATCHED');
    const roomId = statuses[3]!.roomId!;
    for (const p of table) {
      const status = matchmakingStatusSchema.parse(
        (await p.http.get(`${API}/matchmaking`).expect(200)).body,
      );
      expect(status).toEqual({ state: 'MATCHED', entryFee: 0, roomId });
      expect((await view(p, roomId)).myHand).toHaveLength(13);
    }
    expect((await detail(table[0]!, roomId)).status).toBe('IN_PROGRESS');
  });

  it('forms separate tables when many players search at once', { timeout: 60_000 }, async () => {
    const table = await players(8);
    await Promise.all(
      table.map((p) => p.http.post(`${API}/matchmaking`).send({ entryFee: 0 }).expect(201)),
    );
    // A request may return while another one is still seating its player (clients are told
    // through matchmaking:updated), so wait until every search has settled.
    const read = () =>
      Promise.all(
        table.map(async (p) =>
          matchmakingStatusSchema.parse((await p.http.get(`${API}/matchmaking`).expect(200)).body),
        ),
      );
    let statuses = await read();
    await eventually(async () => {
      statuses = await read();
      return statuses.every((s) => s.state === 'MATCHED');
    }, 'every player matched');
    const rooms = new Map<string, number>();
    for (const s of statuses) rooms.set(s.roomId!, (rooms.get(s.roomId!) ?? 0) + 1);
    expect([...rooms.values()]).toEqual([4, 4]);
    expect(await ctx.prisma.matchmakingEntry.count({ where: { roomId: null } })).toBe(0);
  });

  it('cancels a search, and rejects fees the preset does not offer', async () => {
    const [p] = await players(1);
    await p!.http.post(`${API}/matchmaking`).send({ entryFee: 0 }).expect(201);
    const cancelled = matchmakingStatusSchema.parse(
      (await p!.http.delete(`${API}/matchmaking`).expect(200)).body,
    );
    expect(cancelled.state).toBe('IDLE');
    const paid = await p!.http.post(`${API}/matchmaking`).send({ entryFee: 123 }).expect(400);
    expect(errorCode(paid.body)).toBe('VALIDATION_ERROR');
  });

  it('leaves the queue when the player joins a room instead', async () => {
    const [searcher, host] = await players(2);
    await searcher!.http.post(`${API}/matchmaking`).send({ entryFee: 0 }).expect(201);
    const roomId = await createRoom(host!);
    await searcher!.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);
    const status = matchmakingStatusSchema.parse(
      (await searcher!.http.get(`${API}/matchmaking`).expect(200)).body,
    );
    expect(status.state).toBe('IDLE');
  });
});
