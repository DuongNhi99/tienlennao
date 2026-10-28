import { expect, test } from '@playwright/test';
import {
  expectInViewport,
  expectNoHorizontalOverflow,
  expectNoVerticalOverflow,
  press,
  snap,
} from './helpers';

test('join a room, ready up, and play cards at the table', async ({ page }, testInfo) => {
  await page.goto('/lobby');
  await page.getByRole('button', { name: 'Vào Tập luyện' }).click();
  await expect(page.getByRole('heading', { name: 'Tập luyện' })).toBeVisible();
  await page.getByRole('button', { name: 'Sẵn sàng', exact: true }).click();

  // The (bot) host starts once all four players are ready.
  const hand = page.getByRole('list', { name: /Bài của bạn: 13 lá/ });
  await expect(hand).toBeVisible({ timeout: 15_000 });
  const cards = hand.getByRole('button');
  await expect(cards).toHaveCount(13);
  await expectNoHorizontalOverflow(page);
  await expectNoVerticalOverflow(page);

  // Multi-select with touch (or mouse), then deselect.
  await press(cards.nth(0), testInfo);
  await press(cards.nth(1), testInfo);
  await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await press(cards.nth(1), testInfo);
  await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'false');

  // Essential controls stay on screen, above the device safe area.
  const playButton = page.getByRole('button', { name: /^Đánh/ });
  await expectInViewport(page, playButton);
  await expectInViewport(page, page.getByRole('button', { name: 'Bỏ lượt' }));
  await expectInViewport(page, cards.nth(12));
  await snap(page, testInfo, 'game-table');

  // Wait for our turn (bots act after a short delay), then play one card.
  await expect(page.getByText('Lượt của bạn')).toBeVisible({ timeout: 20_000 });
  const handNow = page.getByRole('list', { name: /Bài của bạn/ });
  const before = await handNow.getByRole('button').count();
  // The selection survives the bots' moves: card 0 is still selected from the demo above.
  await expect(handNow.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(playButton).toHaveText('Đánh (1)');
  await expect(playButton).toBeEnabled();
  await playButton.click();
  await expect(
    page.getByRole('list', { name: new RegExp(`Bài của bạn: ${before - 1} lá`) }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Bài trên bàn' })).toContainText(
    /vừa đánh|Vòng mới/,
  );
});

test('sorting changes the hand order without changing its contents', async ({ page }, testInfo) => {
  await page.goto('/lobby');
  await page.getByRole('button', { name: 'Vào Tập luyện' }).click();
  await page.getByRole('button', { name: 'Sẵn sàng', exact: true }).click();
  const cards = page.getByRole('list', { name: /Bài của bạn/ }).getByRole('button');
  await expect(cards).toHaveCount(13, { timeout: 15_000 });
  const byRank = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  await press(page.getByRole('button', { name: /Xếp bài theo chất/ }), testInfo);
  const bySuit = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect([...bySuit].sort()).toEqual([...byRank].sort());
});
