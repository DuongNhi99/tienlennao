/* eslint-disable no-console -- CLI script */
/**
 * Load test: plays many complete four-player matches at once against a running API, the way
 * browsers do (REST commands, one Socket.IO connection per player, every player refetching
 * its view after each move), and reports latency percentiles and errors.
 *
 *   LOAD_API_URL=http://localhost:4300/api/v1 LOAD_MATCHES=25 pnpm load-test
 *
 * Run it against a dedicated instance and a throwaway database (see docs/DEPLOYMENT.md,
 * "Load testing"): it registers 4 × LOAD_MATCHES accounts. The API must trust
 * X-Forwarded-For (TRUST_PROXY=1) so that each simulated player has its own IP for rate limits.
 */
import { randomUUID } from 'node:crypto';
import {
  canBeatCombination,
  type CardId,
  classifyCombination,
  DEFAULT_GAME_RULES,
  listCombinations,
  type PlayerGameView,
  playerGameViewSchema,
  SOCKET_IO_PATH,
} from '@tienlen/shared';
import { io, type Socket } from 'socket.io-client';

const API = (process.env.LOAD_API_URL ?? 'http://localhost:4300/api/v1').replace(/\/$/, '');
const MATCHES = Number(process.env.LOAD_MATCHES ?? 25);

type Kind = 'register' | 'room' | 'view' | 'action';
const latencies: Record<Kind, number[]> = { register: [], room: [], view: [], action: [] };
const errors = new Map<string, number>();
let socketEvents = 0;

class Player {
  private cookie = '';
  readonly ip = `10.${rand(250)}.${rand(250)}.${rand(250) + 1}`;
  socket: Socket | null = null;

  async request<T = unknown>(
    kind: Kind,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: T }> {
    const started = performance.now();
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': this.ip,
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    latencies[kind].push(performance.now() - started);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0]!;
    const text = await res.text();
    if (res.status >= 400) {
      const key = `${method} ${path.replace(/[0-9a-f-]{36}/g, ':id')} → ${res.status}`;
      errors.set(key, (errors.get(key) ?? 0) + 1);
    }
    return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
  }

  connect(): Promise<void> {
    const socket = io(new URL(API).origin, {
      path: SOCKET_IO_PATH,
      transports: ['websocket'],
      extraHeaders: { cookie: this.cookie },
      reconnection: false,
    });
    socket.onAny(() => socketEvents++);
    this.socket = socket;
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
  }

  async view(roomId: string): Promise<PlayerGameView> {
    const res = await this.request('view', 'GET', `/rooms/${roomId}/game`);
    return playerGameViewSchema.parse(res.body);
  }
}

function rand(max: number): number {
  return Math.floor(Math.random() * max);
}

function choosePlay(view: PlayerGameView): CardId[] | null {
  const rules = DEFAULT_GAME_RULES;
  const target = view.currentTrick && classifyCombination(view.currentTrick.cards, rules);
  const option = listCombinations(view.myHand, rules).find(
    (c) =>
      (view.stateVersion > 0 || !view.myHand.includes('3S') || c.cards.includes('3S')) &&
      (!target || canBeatCombination(c, target, rules)),
  );
  return option?.cards ?? null;
}

async function playMatch(index: number): Promise<boolean> {
  const table = [new Player(), new Player(), new Player(), new Player()];
  for (const [i, p] of table.entries()) {
    const res = await p.request('register', 'POST', '/auth/register', {
      displayName: `Tải ${index}-${i}`,
      email: `load-${randomUUID().slice(0, 12)}@example.com`,
      password: 'matkhau123',
      acceptTerms: true,
    });
    if (res.status !== 201) return false;
  }
  await Promise.all(table.map((p) => p.connect()));

  const created = await table[0]!.request<{ roomId: string }>('room', 'POST', '/rooms', {
    visibility: 'PUBLIC',
    entryFee: 0,
    turnTimerSeconds: 30,
    requestId: randomUUID(),
  });
  const { roomId } = created.body;
  for (const p of table.slice(1)) await p.request('room', 'POST', `/rooms/${roomId}/join`, {});
  for (const p of table) await p.request('room', 'PUT', `/rooms/${roomId}/ready`, { ready: true });
  await table[0]!.request('room', 'POST', `/rooms/${roomId}/start`);

  let views = await Promise.all(table.map((p) => p.view(roomId)));
  for (let step = 0; step < 600 && views[0]!.status === 'PLAYING'; step++) {
    const actor = views.find((v) => v.turnSeat === v.mySeat);
    if (actor) {
      const player = table[views.indexOf(actor)]!;
      const cards = choosePlay(actor);
      const action = { actionId: randomUUID(), stateVersion: actor.stateVersion };
      await player.request(
        'action',
        'POST',
        `/rooms/${roomId}/game/${cards ? 'play' : 'pass'}`,
        cards ? { ...action, cards } : action,
      );
    }
    // Browsers refetch their own view on every game:updated notification.
    views = await Promise.all(table.map((p) => p.view(roomId)));
  }
  table.forEach((p) => p.socket?.close());
  return views[0]!.status === 'FINISHED';
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

async function main(): Promise<void> {
  console.log(`Load test: ${MATCHES} concurrent matches (${MATCHES * 4} players) against ${API}`);
  const started = performance.now();
  const results = await Promise.allSettled(Array.from({ length: MATCHES }, (_, i) => playMatch(i)));
  const seconds = (performance.now() - started) / 1000;
  const finished = results.filter((r) => r.status === 'fulfilled' && r.value).length;
  const failed = results.filter((r) => r.status === 'rejected');

  const rows = (Object.keys(latencies) as Kind[]).map((kind) => {
    const v = latencies[kind];
    return {
      requests: kind,
      count: v.length,
      p50: Math.round(percentile(v, 50)),
      p95: Math.round(percentile(v, 95)),
      p99: Math.round(percentile(v, 99)),
      max: Math.round(Math.max(0, ...v)),
    };
  });
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  console.log(`\nMatches finished: ${finished}/${MATCHES} in ${seconds.toFixed(1)} s`);
  console.log(`HTTP requests: ${total} (${(total / seconds).toFixed(0)}/s), latency in ms:`);
  console.table(rows);
  console.log(`Socket.IO notifications received: ${socketEvents}`);
  console.log(`HTTP errors: ${errors.size ? '' : 'none'}`);
  for (const [key, count] of errors) console.log(`  ${count} × ${key}`);
  for (const f of failed) console.log('Match crashed:', f.reason);
  process.exitCode = finished === MATCHES && errors.size === 0 ? 0 : 1;
}

void main();
