import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { e2eDatabaseUrl } from './env';

/** Promotes an account with the server's CLI (there is deliberately no API for it). */
function makeAdmin(email: string) {
  execFileSync('pnpm', ['exec', 'tsx', 'prisma/set-role.ts', email, 'ADMIN'], {
    cwd: path.resolve(process.cwd(), '../server'),
    env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() },
    shell: process.platform === 'win32',
    stdio: 'pipe',
  });
}

async function register(page: Page, displayName: string): Promise<string> {
  const email = `admin-e2e-${randomUUID().slice(0, 8)}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Tên hiển thị').fill(displayName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('matkhau123');
  await page.getByLabel('Nhập lại mật khẩu').fill('matkhau123');
  await page.getByLabel(/Tôi đồng ý/).check();
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page).toHaveURL(/\/lobby$/, { timeout: 30_000 });
  return email;
}

test('players cannot see the admin area; admins can adjust coins with an audited reason', async ({
  browser,
}) => {
  // A player: /admin does not exist for them.
  const playerPage = await (await browser.newContext()).newPage();
  const playerEmail = await register(playerPage, 'Người Chơi Thường');
  const notFound = await playerPage.goto('/admin');
  expect(notFound?.status()).toBe(404);
  await expect(playerPage.getByRole('link', { name: 'Quản trị' })).toHaveCount(0);

  // An admin finds that player and credits 250 coins with a reason.
  const adminPage = await (await browser.newContext()).newPage();
  const adminEmail = await register(adminPage, 'Quản Trị Viên');
  makeAdmin(adminEmail);
  await adminPage.goto('/admin');
  await expect(adminPage.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();

  await adminPage.getByRole('link', { name: 'Người dùng' }).click();
  await adminPage.getByLabel(/Tìm theo tên hiển thị/).fill(playerEmail);
  await adminPage.getByRole('button', { name: 'Tìm' }).click();
  await adminPage.getByRole('link', { name: /Người Chơi Thường/ }).click();
  await adminPage.getByRole('button', { name: 'Điều chỉnh xu' }).click();
  const dialog = adminPage.getByRole('dialog', { name: 'Điều chỉnh xu' });
  await dialog.getByLabel(/Số xu/).fill('250');
  await dialog.getByLabel(/Lý do/).fill('Bồi thường lỗi kết nối');
  await dialog.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(adminPage.getByText('Số dư mới: 10.250 xu.')).toBeVisible();

  // The change is in the audit log, and the player sees it in their wallet and notifications.
  await adminPage.getByRole('link', { name: 'Nhật ký' }).click();
  await expect(adminPage.getByRole('cell', { name: 'COINS_ADJUSTED' }).first()).toBeVisible();
  await expect(adminPage.getByRole('cell', { name: 'Bồi thường lỗi kết nối' })).toBeVisible();

  await playerPage.goto('/wallet');
  await expect(playerPage.getByText('10.250 xu').first()).toBeVisible();
  await playerPage.goto('/notifications');
  await expect(playerPage.getByText('Số xu đã được điều chỉnh')).toBeVisible();
});
