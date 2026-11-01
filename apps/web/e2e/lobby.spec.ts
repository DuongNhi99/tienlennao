import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, snap } from './helpers';

test('lobby shows preview banner, balance, rooms, rewards, and leaderboard', async ({
  page,
}, testInfo) => {
  await page.goto('/lobby');
  await expect(page.getByText(/Bản xem trước giao diện/)).toBeVisible();
  await expect(page.getByText('Xin chào, Minh Anh!')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chơi nhanh' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Phòng công khai' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bàn vui vẻ' })).toBeVisible();
  await expect(page.getByRole('table', { name: /Top 5/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await snap(page, testInfo, 'lobby');
});

test('room filters are applied', async ({ page }) => {
  await page.goto('/lobby');
  await expect(page.getByRole('heading', { name: 'Giải trí cuối tuần' })).toBeVisible();
  await page.getByLabel('Chỉ phòng còn chỗ').check();
  await expect(page.getByRole('heading', { name: 'Giải trí cuối tuần' })).toBeHidden();
  await page.getByLabel('Mức cược').selectOption('0');
  await expect(page.getByRole('heading', { name: 'Cao thủ phố cổ' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Bàn vui vẻ' })).toBeVisible();
});

test('daily reward can be claimed once and updates the balance', async ({ page }) => {
  await page.goto('/lobby');
  const claim = page.getByRole('button', { name: /^Nhận .* xu$/ });
  await claim.click();
  await expect(page.getByText(/Bạn đã nhận 300 xu/)).toBeVisible();
  await expect(page.getByText(/Đã nhận hôm nay/)).toBeVisible();
  await expect(page.getByRole('link', { name: /^Ví xu: / })).toContainText('12.800');

  // The wallet lists the claim first (client-side navigation keeps the preview state).
  await page.getByRole('link', { name: /^Ví xu: / }).click();
  await expect(page.getByRole('heading', { name: 'Ví xu' })).toBeVisible();
  await expect(page.getByText('12.800 xu').first()).toBeVisible();
  const first = page.getByRole('list', { name: 'Giao dịch' }).getByRole('listitem').first();
  await expect(first).toContainText('Thưởng hằng ngày');
  await expect(first).toContainText('+300 xu');
});

test('create a private room, then leave it', async ({ page }, testInfo) => {
  await page.goto('/lobby');
  await page.getByRole('button', { name: 'Tạo phòng' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tạo phòng mới' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Tên phòng (không bắt buộc)').fill('Phòng thử nghiệm');
  await dialog.getByText('Riêng tư', { exact: true }).click();
  await dialog.getByLabel('Mật khẩu phòng (không bắt buộc)').fill('ab');
  await dialog.getByRole('button', { name: 'Tạo phòng' }).click();
  await expect(dialog.getByText('Mật khẩu phòng phải có ít nhất 4 ký tự.')).toBeVisible();
  await dialog.getByLabel('Mật khẩu phòng (không bắt buộc)').fill('abcd');
  await dialog.getByRole('button', { name: 'Tạo phòng' }).click();

  await expect(page).toHaveURL(/\/room\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Phòng thử nghiệm' })).toBeVisible();
  await expect(page.getByText(/đang chờ người chơi/)).toHaveCount(3);
  await expect(page.getByText('Cần đủ 4 người (hiện có 1).')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bắt đầu' })).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  await snap(page, testInfo, 'waiting-room');

  await page.getByRole('button', { name: 'Rời phòng' }).click();
  await page
    .getByRole('dialog', { name: 'Rời phòng?' })
    .getByRole('button', { name: 'Rời phòng' })
    .click();
  await expect(page).toHaveURL(/\/lobby$/);
});

test('joining by code reports unknown rooms', async ({ page }) => {
  await page.goto('/lobby');
  await page.getByLabel('Mã phòng').fill('zzzzzz');
  await page.getByRole('button', { name: 'Vào phòng', exact: true }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: 'Không tìm thấy phòng.' })).toBeVisible();
});

test('notification drawer opens and marks everything read', async ({ page }) => {
  await page.goto('/lobby');
  await page.getByRole('button', { name: /Thông báo, 1 chưa đọc/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Thông báo' });
  await expect(drawer.getByText('Phần thưởng hằng ngày')).toBeVisible();
  await drawer.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }).click();
  await expect(drawer.getByText('Mới', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('button', { name: 'Thông báo', exact: true })).toBeVisible();
});

test('placeholder screens are navigable from the navigation', async ({ page }) => {
  await page.goto('/lobby');
  await page
    .getByRole('navigation', { name: 'Điều hướng chính' })
    .filter({ visible: true })
    .getByRole('link', { name: 'Hồ sơ' })
    .click();
  await expect(page.getByRole('heading', { name: 'Minh Anh' })).toBeVisible();
  await expect(page.getByText('Tỉ lệ thắng', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
