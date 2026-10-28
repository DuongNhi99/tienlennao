import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, snap } from './helpers';

test('landing page presents the product and its calls to action', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tiến Lên Miền Nam');
  await expect(page.getByRole('link', { name: 'Chơi ngay' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cách chơi cơ bản' })).toBeVisible();
  await expect(page.getByText('không có giá trị quy đổi thành tiền')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await snap(page, testInfo, 'landing');
});

test('registration validates on the client with Vietnamese messages', async ({
  page,
}, testInfo) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByText('Tên hiển thị phải có ít nhất 3 ký tự.')).toBeVisible();
  await expect(page.getByText('Vui lòng nhập email.')).toBeVisible();
  await expect(page.getByText(/Bạn cần đồng ý với Điều khoản/)).toBeVisible();
  // The first invalid field receives focus.
  await expect(page.getByLabel('Tên hiển thị')).toBeFocused();

  await page.getByLabel('Tên hiển thị').fill('Người chơi');
  await page.getByLabel('Email').fill('nguoichoi@example.com');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('matkhau123');
  await page.getByLabel('Nhập lại mật khẩu').fill('matkhau999');
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByText('Mật khẩu xác nhận không khớp.')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await snap(page, testInfo, 'register-errors');
});

test('login form validates and offers password recovery', async ({ page }) => {
  await page.goto('/login?next=https://evil.example');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByText('Vui lòng nhập email.')).toBeVisible();
  await expect(page.getByText('Vui lòng nhập mật khẩu.')).toBeVisible();
  await page.getByRole('link', { name: 'Quên mật khẩu?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole('heading', { name: 'Quên mật khẩu' })).toBeVisible();
});

test('reset-password without a token explains the problem', async ({ page }) => {
  await page.goto('/reset-password');
  // Next.js renders its own (empty) route-announcer alert, so match ours by text.
  await expect(
    page.getByRole('alert').filter({ hasText: 'không hợp lệ hoặc đã hết hạn' }),
  ).toBeVisible();
});

test('unknown pages show a friendly 404', async ({ page }) => {
  const response = await page.goto('/khong-ton-tai');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
});
