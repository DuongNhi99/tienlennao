import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('daily reward is credited once and shows in the wallet history', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Tên hiển thị').fill('Người Ví');
  await page.getByLabel('Email').fill(`wallet-${randomUUID().slice(0, 8)}@example.com`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('matkhau123');
  await page.getByLabel('Nhập lại mật khẩu').fill('matkhau123');
  await page.getByLabel(/Tôi đồng ý/).check();
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page).toHaveURL(/\/lobby$/, { timeout: 30_000 });

  await page.getByRole('button', { name: 'Nhận 100 xu' }).click();
  await expect(page.getByText('Bạn đã nhận 100 xu!')).toBeVisible();
  await expect(page.getByText(/Đã nhận hôm nay/)).toBeVisible();
  const balance = page.getByRole('link', { name: /^Ví xu: / });
  await expect(balance).toContainText('10.100');

  await balance.click();
  await expect(page.getByRole('heading', { name: 'Ví xu' })).toBeVisible();
  const entries = page.getByRole('list', { name: 'Giao dịch' }).getByRole('listitem');
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(0)).toContainText('Thưởng hằng ngày');
  await expect(entries.nth(0)).toContainText('+100 xu');
  await expect(entries.nth(1)).toContainText('Quà chào mừng');

  // After a reload the reward is still claimed: the server, not the page, remembers it.
  await page.goto('/lobby');
  await expect(page.getByText(/Đã nhận hôm nay/)).toBeVisible();
});
