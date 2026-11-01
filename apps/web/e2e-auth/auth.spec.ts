import { expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import { linkFromEmail } from './mail';

// One account is created and reused, so the tests run in order.
test.describe.configure({ mode: 'serial' });

const email = `e2e-${Date.now()}@example.com`;
const password = 'matkhau123';
const newPassword = 'matkhaumoi456';

async function login(page: Page, pass: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

test('guests are sent to login from signed-in pages', async ({ page }) => {
  await page.goto('/lobby');
  await expect(page).toHaveURL(/\/login\?next=%2Flobby$/);
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/);
});

test('register: signed in with the starting balance and a verification reminder', async ({
  page,
}) => {
  await page.goto('/register');
  await page.getByLabel('Tên hiển thị').fill('Người Thử');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Nhập lại mật khẩu').fill(password);
  await page.getByLabel(/Tôi đồng ý/).check();
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();

  // The first request to a cold API (Argon2, database connection) can take several seconds.
  await expect(page).toHaveURL(/\/lobby$/, { timeout: 30_000 });
  await expect(page.getByText('Xin chào, Người Thử!')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Ví xu: / })).toContainText('10.000');
  await expect(page.getByText(`Email ${email} chưa được xác minh.`)).toBeVisible();
  // Rewards and rankings arrive in later phases: an honest "coming soon", never mock data.
  await expect(page.getByText('Sắp ra mắt').first()).toBeVisible();
  await expect(page.getByText(/Bản xem trước giao diện/)).toHaveCount(0);

  // A signed-in user who opens the login page goes back to the lobby.
  await page.goto('/login');
  await expect(page).toHaveURL(/\/lobby$/);
});

test('the emailed link verifies the address', async ({ page }) => {
  const link = await linkFromEmail(email, /Subject: Xác minh email/);
  await page.goto(new URL(link).pathname + new URL(link).search);
  await expect(page.getByText('Email của bạn đã được xác minh. Cảm ơn bạn!')).toBeVisible();
  // Opening the same link again fails: tokens are single-use.
  await page.reload();
  // Next.js also renders an (empty) route-announcer alert, so match by text.
  await expect(
    page.getByRole('alert').filter({ hasText: 'không hợp lệ hoặc đã hết hạn' }),
  ).toBeVisible();
});

test('profile: rename, upload an avatar, and sign out', async ({ page }) => {
  await page.goto('/login');
  await login(page, password);
  await expect(page).toHaveURL(/\/lobby$/);
  await expect(page.getByText(/chưa được xác minh/)).toHaveCount(0);

  await page.goto('/profile');
  await page.getByLabel('Tên hiển thị').fill('  Tiến   Lên  ');
  await page.getByRole('button', { name: 'Lưu tên hiển thị' }).click();
  await expect(page.getByRole('heading', { name: 'Tiến Lên', level: 1 })).toBeVisible();

  const image = await sharp({
    create: { width: 300, height: 200, channels: 3, background: { r: 20, g: 120, b: 60 } },
  })
    .png()
    .toBuffer();
  await page
    .locator('#avatar-input')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: image });
  await expect(page.getByText('Đã cập nhật ảnh đại diện.')).toBeVisible();
  await expect(page.locator('main img').first()).toHaveAttribute('src', /\/avatars\/.+\.webp$/);

  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/lobby');
  await expect(page).toHaveURL(/\/login\?next=%2Flobby$/);
});

test('login: generic error for a wrong password, then back to the requested page', async ({
  page,
}) => {
  await page.goto('/login?next=%2Fprofile');
  await login(page, 'sai-mat-khau-1');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Email hoặc mật khẩu không đúng.' }),
  ).toBeVisible();
  await login(page, password);
  await expect(page).toHaveURL(/\/profile$/);
});

test('forgot password: reset by email, then only the new password works', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: /Gửi/ }).click();
  await expect(page.getByText(/Nếu email này đã đăng ký/)).toBeVisible();

  const link = await linkFromEmail(email, /Subject: Đặt lại mật khẩu/);
  await page.goto(new URL(link).pathname + new URL(link).search);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(newPassword);
  await page.getByLabel('Nhập lại mật khẩu mới').fill(newPassword);
  await page.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
  await expect(page.getByText(/Mật khẩu đã được đặt lại/)).toBeVisible();

  await page.goto('/login');
  await login(page, password);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Email hoặc mật khẩu không đúng.' }),
  ).toBeVisible();
  await login(page, newPassword);
  await expect(page).toHaveURL(/\/lobby$/);
});

test('an expired session sends the user to login with an explanation', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await login(page, newPassword);
  await expect(page).toHaveURL(/\/lobby$/);
  // Simulate a session revoked elsewhere (e.g. "sign out everywhere" on another device).
  const cookies = await context.cookies();
  await context.clearCookies();
  await context.addCookies(
    cookies.map((c) => (c.name === 'tl_session' ? { ...c, value: 'revoked-token' } : c)),
  );
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login\?expired=1&next=%2Fprofile$/);
  await expect(page.getByText('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')).toBeVisible();
});
