import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, snap } from './helpers';

test('history lists matches and shows a match with its public timeline', async ({
  page,
}, testInfo) => {
  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'Lịch sử ván đấu' })).toBeVisible();
  await page.getByRole('link', { name: /Hạng 1\/4 · Bàn vui vẻ/ }).click();
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toBeVisible();
  await expect(page.getByText('Bạn đánh bài lẻ: 3 bích')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await snap(page, testInfo, 'history-detail');

  // Report an opponent from the match.
  await page
    .getByRole('button', { name: /^Báo cáo / })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: /^Báo cáo / });
  await dialog.getByLabel('Lý do').selectOption('CHEATING');
  await dialog.getByRole('button', { name: 'Gửi báo cáo' }).click();
  await expect(page.getByText('Đã gửi báo cáo. Quản trị viên sẽ xem xét.')).toBeVisible();
});

test('leaderboard switches between boards', async ({ page }) => {
  await page.goto('/leaderboard');
  const table = page.getByRole('table', { name: 'Thắng trong tuần' });
  await expect(table.getByRole('row')).toHaveCount(8);
  await page.getByRole('tab', { name: 'Tỉ lệ thắng' }).click();
  await expect(page.getByText(/Cần ít nhất 10 ván/)).toBeVisible();
  await expect(page.getByRole('table', { name: 'Tỉ lệ thắng' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('notifications page opens a result in the history', async ({ page }) => {
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Thông báo', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: /Kết quả ván đấu/ }).click();
  await expect(page).toHaveURL(/\/history\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Kết quả' })).toBeVisible();
});
