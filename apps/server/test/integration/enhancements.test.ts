import { randomUUID } from 'node:crypto';
import {
  achievementItemSchema,
  apiErrorSchema,
  canBeatCombination,
  type CardId,
  classifyCombination,
  createdInvitationSchema,
  DEFAULT_GAME_RULES,
  type GameRules,
  invitationListSchema,
  invitationSchema,
  leaderboardSchema,
  listCombinations,
  matchHistoryDetailSchema,
  matchResultSchema,
  type PlayerGameView,
  playerGameViewSchema,
  playerStatisticsSchema,
  publicProfileSchema,
  roomDetailSchema,
  RULE_VARIANTS,
  seriesDetailSchema,
  spectatorGameViewSchema,
  timelineEventSchema,
  userSearchResultSchema,
} from '@tienlen/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Dealer } from '../../src/game/dealer';
import { RoomsService } from '../../src/rooms/rooms.service';
import { createTestApp, registerUser, type TestContext } from './helpers';
import { TestDealer } from './play-helpers';

const dealer = new TestDealer();
let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp((builder) => builder.overrideProvider(Dealer).useValue(dealer));
  // The test database starts empty (as in CI): store the achievements this suite checks.
  for (const [code, rewardAmount] of [
    ['FIRST_MATCH', 200],
    ['FIRST_WIN', 500],
  ] as const) {
    await ctx.prisma.achievement.upsert({
      where: { code },
      update: { rewardAmount, isActive: true },
      create: { code, name: code, description: code, rewardAmount },
    });
  }
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

async function view(player: Player, roomId: string): Promise<PlayerGameView> {
  return playerGameViewSchema.parse(
    (await player.http.get(`${API}/rooms/${roomId}/game`).expect(200)).body,
  );
}

/** Joins everyone after the host, readies all and starts. */
async function startRoom(table: Player[], roomId: string): Promise<void> {
  for (const p of table.slice(1)) {
    await p.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);
  }
  for (const p of table) {
    await p.http.put(`${API}/rooms/${roomId}/ready`).send({ ready: true }).expect(200);
  }
  await table[0]!.http.post(`${API}/rooms/${roomId}/start`).expect(200);
}

/** A legal move from the mover's own view, under the match's own rules. */
function choose(v: PlayerGameView): CardId[] | null {
  const rules: GameRules = v.rules ?? DEFAULT_GAME_RULES;
  const target = v.currentTrick && classifyCombination(v.currentTrick.cards, rules);
  const option = listCombinations(v.myHand, rules).find(
    (c) =>
      (v.openingCard === null || c.cards.includes(v.openingCard)) &&
      (!target || canBeatCombination(c, target, rules)),
  );
  return option?.cards ?? null;
}

/** Plays the room's match to the end. `onStep` sees the state before every move. */
async function playToEnd(
  table: Player[],
  roomId: string,
  onStep?: (step: number) => Promise<void>,
): Promise<void> {
  const seats = await Promise.all(table.map(async (p) => (await view(p, roomId)).mySeat));
  for (let step = 0; step < 600; step++) {
    const any = await view(table[0]!, roomId);
    if (any.status !== 'PLAYING') return;
    await onStep?.(step);
    const actor = table[seats.indexOf(any.turnSeat!)]!;
    const mine = await view(actor, roomId);
    const cards = choose(mine);
    const action = { actionId: randomUUID(), stateVersion: mine.stateVersion };
    await actor.http
      .post(`${API}/rooms/${roomId}/game/${cards ? 'play' : 'pass'}`)
      .send(cards ? { ...action, cards } : action)
      .expect(200);
  }
  throw new Error('The match did not end');
}

describe('room options and host controls', () => {
  it('plays the host’s rules with a seat limit, and refuses a third player', async () => {
    const [host, guest, extra] = await players(3);
    const casual = RULE_VARIANTS.CASUAL.rules;
    const roomId = await createRoom(host!, { maxPlayers: 2, rules: casual });
    const before = await detail(host!, roomId);
    expect(before.maxPlayers).toBe(2);
    expect(before.rules).toEqual(casual);

    await guest!.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);
    const full = await extra!.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(409);
    expect(errorCode(full.body)).toBe('ROOM_FULL');

    for (const p of [host!, guest!]) {
      await p.http.put(`${API}/rooms/${roomId}/ready`).send({ ready: true }).expect(200);
    }
    await host!.http.post(`${API}/rooms/${roomId}/start`).expect(200);
    const v = await view(guest!, roomId);
    expect(v.rules).toEqual(casual);
    const match = await ctx.prisma.match.findFirstOrThrow({ where: { roomId } });
    expect(match.ruleSnapshot).toEqual(casual);
  });

  it('lets only the host change settings, and never below the seated players', async () => {
    const [host, guest] = await players(2);
    const roomId = await createRoom(host!);
    await guest!.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);
    const settings = { entryFee: 0, turnTimerSeconds: 30 };

    const forbidden = await guest!.http
      .patch(`${API}/rooms/${roomId}/settings`)
      .send({ ...settings, rules: RULE_VARIANTS.COMPETITIVE.rules })
      .expect(403);
    expect(errorCode(forbidden.body)).toBe('FORBIDDEN');

    const changed = await host!.http
      .patch(`${API}/rooms/${roomId}/settings`)
      .send({ ...settings, maxPlayers: 2, rules: RULE_VARIANTS.COMPETITIVE.rules })
      .expect(200);
    expect(roomDetailSchema.parse(changed.body).rules).toEqual(RULE_VARIANTS.COMPETITIVE.rules);

    const invalid = await host!.http
      .patch(`${API}/rooms/${roomId}/settings`)
      .send({ ...settings, rules: { ...DEFAULT_GAME_RULES, opening: 'ANYTHING' } })
      .expect(400);
    expect(errorCode(invalid.body)).toBe('VALIDATION_ERROR');
  });

  it('removes a member for good, and closes the room for everyone', async () => {
    const [host, guest, other] = await players(3);
    const roomId = await createRoom(host!);
    await guest!.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);
    await other!.http
      .post(`${API}/rooms/${roomId}/remove-member`)
      .send({ userId: host!.userId })
      .expect(403);

    const after = await host!.http
      .post(`${API}/rooms/${roomId}/remove-member`)
      .send({ userId: guest!.userId })
      .expect(200);
    expect(roomDetailSchema.parse(after.body).playerCount).toBe(1);
    const back = await guest!.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(403);
    expect(errorCode(back.body)).toBe('FORBIDDEN');

    await other!.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);
    await other!.http.post(`${API}/rooms/${roomId}/close`).expect(403);
    await host!.http.post(`${API}/rooms/${roomId}/close`).expect(204);
    const room = await ctx.prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(room.status).toBe('CANCELLED');
    expect(await ctx.prisma.roomPlayer.count({ where: { roomId } })).toBe(0);
  });
});

describe('spectator mode', () => {
  it(
    'shows spectators the public table only, never a hand, until the round ends',
    { timeout: 120_000 },
    async () => {
      const table = await players(2);
      const [watcher, outsider] = await players(2);
      const roomId = await createRoom(table[0]!, { maxPlayers: 2 });

      // Not allowed until the host says so.
      const refused = await watcher!.http
        .post(`${API}/rooms/${roomId}/spectate`)
        .send({})
        .expect(403);
      expect(errorCode(refused.body)).toBe('SPECTATORS_NOT_ALLOWED');
      await table[0]!.http
        .patch(`${API}/rooms/${roomId}/settings`)
        .send({ entryFee: 0, turnTimerSeconds: 30, allowSpectators: true })
        .expect(200);
      await watcher!.http.post(`${API}/rooms/${roomId}/spectate`).send({}).expect(200);
      expect((await detail(table[0]!, roomId)).spectatorCount).toBe(1);
      expect((await detail(watcher!, roomId)).isSpectator).toBe(true);

      await startRoom(table, roomId);

      // A spectator cannot act, nor change anything.
      const v0 = await view(table[0]!, roomId);
      const act = { actionId: randomUUID(), stateVersion: v0.stateVersion };
      await watcher!.http.post(`${API}/rooms/${roomId}/game/pass`).send(act).expect(403);
      await watcher!.http
        .post(`${API}/rooms/${roomId}/game/play`)
        .send({ ...act, cards: v0.myHand.slice(0, 1) })
        .expect(403);
      await watcher!.http.get(`${API}/rooms/${roomId}/game`).expect(403);
      await outsider!.http.get(`${API}/rooms/${roomId}/game/spectate`).expect(403);
      await outsider!.http.get(`${API}/rooms/${roomId}/game/events`).expect(403);

      const scan = async () => {
        const res = await watcher!.http.get(`${API}/rooms/${roomId}/game/spectate`).expect(200);
        const spectated = spectatorGameViewSchema.parse(res.body);
        const text = JSON.stringify(res.body);
        expect(text).not.toContain('myHand');
        // The only cards a spectator may see while the round is played are on the table.
        const named = new Set(text.match(CARD_PATTERN)?.map((c) => c.slice(1, -1)) ?? []);
        const onTable = new Set(spectated.currentTrick?.cards ?? []);
        expect([...named].filter((card) => !onTable.has(card as CardId))).toEqual([]);
        expect(spectated.seats.every((s) => s.revealedCards === null)).toBe(true);
        const events = (await watcher!.http.get(`${API}/rooms/${roomId}/game/events`).expect(200))
          .body as unknown[];
        expect(events.map((e) => timelineEventSchema.parse(e).type)).not.toContain('DEALT');
      };
      await playToEnd(table, roomId, async (step) => {
        if (step % 5 === 0) await scan();
      });

      // After the round: revealed hands and the result, as for the players.
      const final = spectatorGameViewSchema.parse(
        (await watcher!.http.get(`${API}/rooms/${roomId}/game/spectate`).expect(200)).body,
      );
      expect(final.status).toBe('FINISHED');
      expect(final.seats.every((s) => s.revealedCards !== null)).toBe(true);
      const result = matchResultSchema.parse(
        (await watcher!.http.get(`${API}/rooms/${roomId}/game/result`).expect(200)).body,
      );
      expect(result.placements).toHaveLength(2);
      await outsider!.http.get(`${API}/rooms/${roomId}/game/result`).expect(403);

      // Leaving never touches the match.
      await watcher!.http.post(`${API}/rooms/${roomId}/spectate/leave`).expect(204);
      await watcher!.http.get(`${API}/rooms/${roomId}/game/spectate`).expect(403);
    },
  );

  it('asks spectators for the room password and keeps removed users out', async () => {
    const [host, watcher, removed] = await players(3);
    const roomId = await createRoom(host!, {
      visibility: 'PRIVATE',
      password: 'bimat123',
      allowSpectators: true,
    });
    const wrong = await watcher!.http
      .post(`${API}/rooms/${roomId}/spectate`)
      .send({ password: 'sai-roi' })
      .expect(403);
    expect(errorCode(wrong.body)).toBe('INVALID_ROOM_PASSWORD');
    const code = (await detail(host!, roomId)).code;
    await watcher!.http
      .post(`${API}/rooms/spectate-by-code`)
      .send({ code, password: 'bimat123' })
      .expect(200);
    // A private room is visible to its spectators.
    expect((await detail(watcher!, roomId)).isSpectator).toBe(true);

    await removed!.http
      .post(`${API}/rooms/${roomId}/spectate`)
      .send({ password: 'bimat123' })
      .expect(200);
    await host!.http
      .post(`${API}/rooms/${roomId}/remove-member`)
      .send({ userId: removed!.userId })
      .expect(200);
    await removed!.http
      .post(`${API}/rooms/${roomId}/spectate`)
      .send({ password: 'bimat123' })
      .expect(403);
  });
});

describe('invitations', () => {
  it('seats a directly invited player in a private room, once', async () => {
    const [host, friend, stranger] = await players(3);
    const roomId = await createRoom(host!, { visibility: 'PRIVATE', password: 'bimat123' });

    // Only seated players invite.
    await stranger!.http
      .post(`${API}/rooms/${roomId}/invitations`)
      .send({ inviteeId: friend!.userId })
      .expect(403);

    const sent = createdInvitationSchema.parse(
      (
        await host!.http
          .post(`${API}/rooms/${roomId}/invitations`)
          .send({ inviteeId: friend!.userId })
          .expect(201)
      ).body,
    );
    expect(sent).toMatchObject({ kind: 'DIRECT', status: 'PENDING', link: null });
    // Asking again does not duplicate it.
    const again = createdInvitationSchema.parse(
      (
        await host!.http
          .post(`${API}/rooms/${roomId}/invitations`)
          .send({ inviteeId: friend!.userId })
          .expect(201)
      ).body,
    );
    expect(again.id).toBe(sent.id);

    const inbox = invitationListSchema.parse(
      (await friend!.http.get(`${API}/invitations`).expect(200)).body,
    );
    expect(inbox.items.map((i) => i.id)).toEqual([sent.id]);
    expect(
      await ctx.prisma.notification.count({
        where: { userId: friend!.userId, type: 'ROOM_INVITATION' },
      }),
    ).toBe(1);

    // Someone else cannot use it; the invitee can, without the password, exactly once.
    await stranger!.http.post(`${API}/invitations/${sent.id}/accept`).expect(404);
    await friend!.http.post(`${API}/invitations/${sent.id}/accept`).expect(200);
    expect((await detail(friend!, roomId)).mySeat).not.toBeNull();
    const twice = await friend!.http.post(`${API}/invitations/${sent.id}/reject`).expect(409);
    expect(errorCode(twice.body)).toBe('INVITATION_UNAVAILABLE');
    const accepted = invitationListSchema.parse(
      (await friend!.http.get(`${API}/invitations`).expect(200)).body,
    );
    expect(accepted.items[0]!.status).toBe('ACCEPTED');
  });

  it('shares a reusable link until it is cancelled or expires', async () => {
    const [host, a, b, c] = await players(4);
    const roomId = await createRoom(host!, { visibility: 'PRIVATE', password: 'bimat123' });
    const created = createdInvitationSchema.parse(
      (await host!.http.post(`${API}/rooms/${roomId}/invitations`).send({}).expect(201)).body,
    );
    expect(created.kind).toBe('LINK');
    const token = created.link!.replace('/invite/', '');
    // Only the hash is stored.
    const row = await ctx.prisma.roomInvitation.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.tokenHash).not.toContain(token);

    const preview = invitationSchema.parse(
      (await a!.http.get(`${API}/invitations/link/${token}`).expect(200)).body,
    );
    expect(preview.room.id).toBe(roomId);
    await a!.http.post(`${API}/invitations/link/${token}/accept`).expect(200);
    await b!.http.post(`${API}/invitations/link/${token}/accept`).expect(200);
    expect(
      (await ctx.prisma.roomInvitation.findUniqueOrThrow({ where: { id: created.id } })).useCount,
    ).toBe(2);

    await host!.http.post(`${API}/invitations/${created.id}/cancel`).expect(200);
    const cancelled = await c!.http.post(`${API}/invitations/link/${token}/accept`).expect(409);
    expect(errorCode(cancelled.body)).toBe('INVITATION_UNAVAILABLE');
    await c!.http.get(`${API}/invitations/link/${'x'.repeat(43)}`).expect(404);

    // An expired link reads as EXPIRED and cannot be used.
    const second = createdInvitationSchema.parse(
      (await host!.http.post(`${API}/rooms/${roomId}/invitations`).send({}).expect(201)).body,
    );
    await ctx.prisma.roomInvitation.update({
      where: { id: second.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const secondToken = second.link!.replace('/invite/', '');
    expect(
      invitationSchema.parse(
        (await c!.http.get(`${API}/invitations/link/${secondToken}`).expect(200)).body,
      ).status,
    ).toBe('EXPIRED');
    await c!.http.post(`${API}/invitations/link/${secondToken}/accept`).expect(409);
  });

  it('cancels pending invitations when the room starts', async () => {
    const [host, guest, invitee] = await players(3);
    const roomId = await createRoom(host!);
    const sent = createdInvitationSchema.parse(
      (
        await host!.http
          .post(`${API}/rooms/${roomId}/invitations`)
          .send({ inviteeId: invitee!.userId })
          .expect(201)
      ).body,
    );
    await startRoom([host!, guest!], roomId);
    const row = await ctx.prisma.roomInvitation.findUniqueOrThrow({ where: { id: sent.id } });
    expect(row.status).toBe('CANCELLED');
    await invitee!.http.post(`${API}/invitations/${sent.id}/accept`).expect(409);
  });

  it('finds players by name for invitations', async () => {
    const [me, other] = await players(2);
    const found = userSearchResultSchema.parse(
      (
        await me!.http
          .get(`${API}/users/search?q=${encodeURIComponent(other!.displayName)}`)
          .expect(200)
      ).body,
    );
    expect(found.map((p) => p.userId)).toContain(other!.userId);
    expect(found.map((p) => p.userId)).not.toContain(me!.userId);
    await me!.http.get(`${API}/users/search?q=a`).expect(400);
  });
});

describe('multi-round series', () => {
  it(
    'keeps the rules, adds round scores and finishes after the target rounds',
    { timeout: 180_000 },
    async () => {
      const table = await players(2);
      const rules = RULE_VARIANTS.COMPETITIVE.rules;
      const firstRoom = await createRoom(table[0]!, {
        maxPlayers: 2,
        rules,
        series: { endCondition: 'ROUNDS', targetRounds: 2 },
      });
      const round1 = await detail(table[0]!, firstRoom);
      expect(round1.roundNumber).toBe(1);
      expect(round1.series).toMatchObject({ status: 'IN_PROGRESS', roundsPlayed: 0 });
      await startRoom(table, firstRoom);
      await playToEnd(table, firstRoom);

      const afterFirst = await detail(table[1]!, firstRoom);
      expect(afterFirst.series).toMatchObject({ status: 'IN_PROGRESS', roundsPlayed: 1 });
      const seriesId = afterFirst.series!.id;

      // "Next round": same series, round 2, same rules, which can no longer change.
      const next = (await table[1]!.http.post(`${API}/rooms/${firstRoom}/rematch`).expect(200))
        .body as { roomId: string };
      await table[0]!.http.post(`${API}/rooms/${firstRoom}/rematch`).expect(200);
      const round2 = await detail(table[1]!, next.roomId);
      expect(round2).toMatchObject({ roundNumber: 2 });
      expect(round2.series!.id).toBe(seriesId);
      expect(round2.rules).toEqual(rules);
      const locked = await table[1]!.http
        .patch(`${API}/rooms/${next.roomId}/settings`)
        .send({ entryFee: 0, turnTimerSeconds: 30, rules: DEFAULT_GAME_RULES })
        .expect(400);
      expect(errorCode(locked.body)).toBe('VALIDATION_ERROR');

      for (const p of table) {
        await p.http.put(`${API}/rooms/${next.roomId}/ready`).send({ ready: true }).expect(200);
      }
      await table[1]!.http.post(`${API}/rooms/${next.roomId}/start`).expect(200);
      await playToEnd(table, next.roomId);

      const series = seriesDetailSchema.parse(
        (await table[0]!.http.get(`${API}/series/${seriesId}`).expect(200)).body,
      );
      expect(series.status).toBe('FINISHED');
      expect(series.rounds.map((r) => r.roundNumber)).toEqual([1, 2]);
      expect(series.rules).toEqual(rules);
      // Standings are exactly the sum of the settled round scores.
      for (const standing of series.standings) {
        const total = series.rounds
          .flatMap((r) => r.results)
          .filter((r) => r.userId === standing.userId)
          .reduce((sum, r) => sum + (r.roundScore ?? 0), 0);
        expect(standing.totalScore).toBe(total);
      }
      expect(series.winnerId).toBe(series.standings[0]!.userId);
      const matches = await ctx.prisma.match.findMany({ where: { seriesId } });
      expect(matches).toHaveLength(2);
      // JSONB reorders keys, so compare structurally.
      for (const m of matches) expect(m.ruleSnapshot).toEqual(rules);

      // Outsiders cannot read it; after a finished series, "play again" starts a new one.
      const [outsider] = await players(1);
      await outsider!.http.get(`${API}/series/${seriesId}`).expect(404);
      const again = (await table[0]!.http.post(`${API}/rooms/${next.roomId}/rematch`).expect(200))
        .body as { roomId: string };
      const fresh = await detail(table[0]!, again.roomId);
      expect(fresh.roundNumber).toBe(1);
      expect(fresh.series!.id).not.toBe(seriesId);
    },
  );

  it('ends a manual series only by its host, between rounds', async () => {
    const [host, guest] = await players(2);
    const roomId = await createRoom(host!, { series: { endCondition: 'MANUAL' } });
    const seriesId = (await detail(host!, roomId)).series!.id;
    await guest!.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(200);
    await guest!.http.post(`${API}/series/${seriesId}/finish`).expect(403);
    const finished = seriesDetailSchema.parse(
      (await host!.http.post(`${API}/series/${seriesId}/finish`).expect(200)).body,
    );
    expect(finished.status).toBe('FINISHED');
    // The open room plays on as an ordinary room.
    expect((await detail(host!, roomId)).series).toBeNull();
  });
});

describe('statistics, leaderboards, achievements and the event log', () => {
  it(
    'derives statistics from settled rounds and keeps the event log append-only',
    { timeout: 120_000 },
    async () => {
      const table = await players(2);
      const roomId = await createRoom(table[0]!, { maxPlayers: 2 });
      await startRoom(table, roomId);
      const rooms = ctx.app.get(RoomsService);
      const match = await ctx.prisma.match.findFirstOrThrow({ where: { roomId } });

      // Presence changes during play are logged once per change, without touching the state.
      const version = (await view(table[1]!, roomId)).stateVersion;
      await rooms.setConnected(table[1]!.userId, false);
      await rooms.setConnected(table[1]!.userId, false);
      await rooms.setConnected(table[1]!.userId, true);
      const presence = await ctx.prisma.matchEvent.findMany({
        where: { matchId: match.id, type: { in: ['PLAYER_DISCONNECTED', 'PLAYER_RECONNECTED'] } },
        orderBy: { sequence: 'asc' },
      });
      expect(presence.map((e) => e.type)).toEqual(['PLAYER_DISCONNECTED', 'PLAYER_RECONNECTED']);
      expect((await view(table[1]!, roomId)).stateVersion).toBe(version);

      await playToEnd(table, roomId);

      const events = await ctx.prisma.matchEvent.findMany({
        where: { matchId: match.id },
        orderBy: { sequence: 'asc' },
      });
      expect(events.every((e) => e.stateVersion !== null)).toBe(true);
      // Versions never go back.
      expect(events.map((e) => e.stateVersion!)).toEqual(
        [...events.map((e) => e.stateVersion!)].sort((a, b) => a - b),
      );
      await expect(
        ctx.prisma
          .$executeRaw`UPDATE match_events SET payload = '{}' WHERE "matchId" = ${match.id}::uuid`,
      ).rejects.toThrow();
      await expect(
        ctx.prisma.$executeRaw`DELETE FROM match_events WHERE "matchId" = ${match.id}::uuid`,
      ).rejects.toThrow();

      // Settled per-round statistics agree with the result.
      const result = matchResultSchema.parse(
        (await table[0]!.http.get(`${API}/rooms/${roomId}/game/result`).expect(200)).body,
      );
      const rows = await ctx.prisma.matchPlayer.findMany({ where: { matchId: match.id } });
      for (const p of result.placements) {
        const row = rows.find((r) => r.userId === p.userId)!;
        expect(row.roundScore).toBe(p.roundScore);
        expect(row.penaltyPoints).toBe(p.penaltyPoints);
        expect(row.cardsPlayed).toBe(13 - p.cardsRemaining);
      }
      const penalties = await ctx.prisma.matchPenalty.findMany({ where: { matchId: match.id } });
      expect(penalties.reduce((sum, item) => sum + item.points, 0)).toBe(
        result.placements.reduce((sum, p) => sum + p.penaltyPoints, 0),
      );

      const winner = result.placements.find((p) => p.placement === 1)!;
      const player = table.find((t) => t.userId === winner.userId)!;
      const stats = playerStatisticsSchema.parse(
        (await player.http.get(`${API}/users/me/statistics`).expect(200)).body,
      );
      expect(stats).toMatchObject({ roundsPlayed: 1, roundsWon: 1, winRate: 100, averagePlace: 1 });
      expect(stats.placements[0]).toEqual({ place: 1, count: 1 });
      expect(stats.streaks).toMatchObject({ currentWin: 1, bestWin: 1 });
      expect(stats.recent[0]!.matchId).toBe(match.id);
      expect(stats.weekly.at(-1)!.played).toBe(1);

      const achievements = (await player.http.get(`${API}/users/me/achievements`).expect(200))
        .body as unknown[];
      const unlocked = achievements
        .map((a) => achievementItemSchema.parse(a))
        .filter((a) => a.unlockedAt)
        .map((a) => a.code);
      expect(unlocked).toEqual(expect.arrayContaining(['FIRST_MATCH', 'FIRST_WIN']));

      // Leaderboards: points and best streak, today; search keeps the global rank.
      const board = leaderboardSchema.parse(
        (
          await player.http
            .get(
              `${API}/leaderboard?metric=points&period=today&search=${encodeURIComponent(winner.displayName)}`,
            )
            .expect(200)
        ).body,
      );
      expect(board.entries.map((e) => e.userId)).toContain(winner.userId);
      expect(board.search).toBe(winner.displayName);
      const streaks = leaderboardSchema.parse(
        (await player.http.get(`${API}/leaderboard?metric=bestStreak&period=all`).expect(200)).body,
      );
      expect(streaks.me).toMatchObject({ userId: winner.userId });
      expect(streaks.me!.bestStreak).toBeGreaterThanOrEqual(1);

      // History carries the round score.
      const history = matchHistoryDetailSchema.parse(
        (await player.http.get(`${API}/history/${match.id}`).expect(200)).body,
      );
      expect(history.players.find((p) => p.userId === winner.userId)!.roundScore).toBe(
        winner.roundScore,
      );
    },
  );

  it('hides a private profile’s statistics from others but not from its owner', async () => {
    const [owner, viewer] = await players(2);
    const open = publicProfileSchema.parse(
      (await viewer!.http.get(`${API}/users/${owner!.userId}/profile`).expect(200)).body,
    );
    expect(open.statistics).not.toBeNull();
    await owner!.http
      .patch(`${API}/users/me/privacy`)
      .send({ profileVisibility: 'PRIVATE' })
      .expect(200);
    const hidden = publicProfileSchema.parse(
      (await viewer!.http.get(`${API}/users/${owner!.userId}/profile`).expect(200)).body,
    );
    expect(hidden).toMatchObject({ visibility: 'PRIVATE', statistics: null, achievements: null });
    const mine = publicProfileSchema.parse(
      (await owner!.http.get(`${API}/users/${owner!.userId}/profile`).expect(200)).body,
    );
    expect(mine.statistics).not.toBeNull();
    expect(mine.isMe).toBe(true);
  });
});
