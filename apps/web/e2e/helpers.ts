import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/** The page body must never scroll horizontally. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}

/** Full-screen layouts (the game table) must fit the viewport exactly, with no page scroll. */
export async function expectNoVerticalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  expect(overflow, 'vertical overflow in px').toBeLessThanOrEqual(0);
}

/** The element is fully inside the visible viewport (not hidden behind an edge or safe area). */
export async function expectInViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, 'element has a bounding box').not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 0.5);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 0.5);
}

/** Tap on touch projects, click elsewhere. */
export async function press(locator: Locator, testInfo: TestInfo) {
  if (testInfo.project.use.hasTouch) await locator.tap();
  else await locator.click();
}

/** Saves a screenshot when E2E_SCREENSHOT_DIR is set (used for manual visual review). */
export async function snap(page: Page, testInfo: TestInfo, name: string) {
  const dir = process.env.E2E_SCREENSHOT_DIR;
  if (!dir) return;
  await page.screenshot({ path: `${dir}/${testInfo.project.name}-${name}.png`, fullPage: false });
}
