import { expect, test } from '@playwright/test';

// Runs in the desktop project only (see `testIgnore` in playwright.config.ts).

test('web app manifest is valid and its icons are served', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();

  const manifest = (await (await request.get(href!)).json()) as {
    name: string;
    short_name: string;
    display: string;
    start_url: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(manifest.name).toBe('Tiến Lên Online');
  expect(manifest.short_name).toBeTruthy();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/lobby');
  expect(manifest.icons.map((i) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);

  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.status(), icon.src).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  }
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await request.get(apple!)).status()).toBe(200);
});

test('service worker is versioned, never cached, and registers', async ({ page, request }) => {
  const response = await request.get('/sw.js');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('javascript');
  expect(response.headers()['cache-control']).toContain('no-cache');
  const body = await response.text();
  expect(body).not.toContain('__BUILD_ID__');

  await page.goto('/');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/$/);
});

test('offline navigation falls back to the offline page', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // now controlled by the service worker
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  await context.setOffline(true);
  await page.goto('/lobby');
  await expect(page.getByRole('heading', { name: 'Bạn đang ngoại tuyến' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thử kết nối lại' })).toBeVisible();
  // The offline page renders with its stylesheet (pre-cached at install).
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).not.toBe('rgba(0, 0, 0, 0)');
  await context.setOffline(false);
});
