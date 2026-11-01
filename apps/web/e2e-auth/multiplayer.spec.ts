import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, type Page, request, test } from '@playwright/test';
import {
  canBeatCombination,
  type CardId,
  classifyCombination,
  DEFAULT_GAME_RULES,
  listCombinations,
  type PlayerGameView,
  playerGameViewSchema,
} from '@tienlen/shared';
import { API_URL } from './env';

/**
 * One browser player against three bots that use the API directly. The browser learns about
 * the bots only through server push (Socket.IO), so this covers REST, realtime notifications
 * and the authoritative engine end to end.
 */

const password = 'matkhau123';

async function registerBot(index: number): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: `${API_URL}/` });
  const res = await api.post('auth/register', {
    data: {
      displayName: `Máy ${index}`,
      email: `bot-${index}-${randomUUID().slice(0, 8)}@example.com`,
      password,
      acceptTerms: true,
    },
  });
  expect(res.status()).toBe(201);
  return api;
}

/** A legal move computed from the bot's own view only. */
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

/** Plays every bot turn until the match ends. */
async function runBots(bots: APIRequestContext[], roomId: string): Promise<void> {
  for (;;) {
    for (const bot of bots) {
      const view = playerGameViewSchema.parse(await (await bot.get(`rooms/${roomId}/game`)).json());
      if (view.status !== 'PLAYING') return;
      if (view.turnSeat !== view.mySeat) continue;
      const cards = choosePlay(view);
      const action = { actionId: randomUUID(), stateVersion: view.stateVersion };
      const res = cards
        ? await bot.post(`rooms/${roomId}/game/play`, { data: { ...action, cards } })
        : await bot.post(`rooms/${roomId}/game/pass`, { data: action });
      // 409 STALE_STATE only if the view changed meanwhile; the next round retries.
      expect([200, 409]).toContain(res.status());
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

async function registerInBrowser(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Tên hiển thị').fill('Người Chơi');
  await page.getByLabel('Email').fill(`player-${randomUUID().slice(0, 8)}@example.com`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Nhập lại mật khẩu').fill(password);
  await page.getByLabel(/Tôi đồng ý/).check();
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page).toHaveURL(/\/lobby$/, { timeout: 30_000 });
}

test('a browser player plays a full match against three API clients', async ({ page }) => {
  test.setTimeout(240_000);
  const bots = await Promise.all([1, 2, 3].map(registerBot));

  await registerInBrowser(page);
  await page.getByRole('button', { name: 'Tạo phòng' }).first().click();
  await page
    .getByRole('dialog', { name: 'Tạo phòng mới' })
    .getByRole('button', { name: 'Tạo phòng' })
    .click();
  await expect(page).toHaveURL(/\/room\/[0-9a-f-]{36}$/);
  const roomId = page.url().split('/').at(-1)!;

  for (const bot of bots) {
    expect((await bot.post(`rooms/${roomId}/join`, { data: {} })).status()).toBe(200);
    expect((await bot.put(`rooms/${roomId}/ready`, { data: { ready: true } })).status()).toBe(200);
  }
  // The bots' seats arrive through server push, without a reload.
  const seats = page.getByRole('list', { name: 'Chỗ ngồi' });
  await expect(seats.getByText('Máy 3')).toBeVisible();
  await page.getByRole('button', { name: 'Sẵn sàng', exact: true }).click();
  const start = page.getByRole('button', { name: 'Bắt đầu' });
  await expect(start).toBeEnabled();
  await start.click();

  const hand = page.getByRole('list', { name: /Bài của bạn/ });
  await expect(hand.getByRole('button')).toHaveCount(13);
  const botsDone = runBots(bots, roomId);

  const result = page.getByRole('dialog', { name: 'Kết quả ván đấu' });
  const myTurn = page.getByText('Lượt của bạn');
  const passButton = page.getByRole('button', { name: 'Bỏ lượt' });
  const playButton = page.getByRole('button', { name: /^Đánh/ });
  const action = () =>
    page.waitForResponse(
      (r) => /\/game\/(play|pass)$/.test(r.url()) && r.request().method() === 'POST',
    );

  for (let step = 0; !(await result.isVisible()); step++) {
    expect(step).toBeLessThan(2_000);
    if (await myTurn.isVisible()) {
      if (await passButton.isEnabled()) {
        await Promise.all([action(), passButton.click()]);
      } else {
        // Leading: play the weakest card (3♠ when opening; the hand is sorted by rank).
        await hand.getByRole('button').first().click();
        await expect(playButton).toBeEnabled();
        await Promise.all([action(), playButton.click()]);
      }
    }
    await page.waitForTimeout(100);
  }

  await botsDone;
  await expect(result.getByRole('listitem')).toHaveCount(4);
  await Promise.all(bots.map((bot) => bot.dispose()));
});
