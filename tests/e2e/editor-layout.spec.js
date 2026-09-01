import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Regression test: long unwrapped lines in the CodeMirror editor must not
// widen the editor pane. CodeMirror 6 renders code with white-space: pre,
// so the longest rendered line becomes the pane's min-content width; the
// main grid's editor track must be capped (minmax(0, 1fr)) or the layout
// shifts as wide lines scroll into view.
test('code editor pane keeps its width when scrolling wide code', async ({ page }) => {
  await page.addInitScript({ path: path.join(__dirname, 'desktop-stub.js') });
  await page.goto('/');

  // Wait for the GPU to initialize and the main layout to appear.
  await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });

  // Create a fresh project, then open the Detect Pose code tab. Its source has
  // long lines. We open the tab directly instead of instantiating the node so
  // the test doesn't depend on MediaPipe loading in a headless browser.
  await page.waitForFunction(() => window.app?.getState().network);
  await page.evaluate(async () => {
    await window.app.getState().newProject();
    window.app.getState().newCodeTab({ type: 'ml.detectPose' });
  });

  const editorPane = page.locator('.editor');
  const scroller = page.locator('.cm-scroller');
  await expect(scroller).toBeVisible();
  await expect(page.locator('.cm-line').first()).toBeVisible();

  const main = page.locator('main');
  const widthBefore = (await editorPane.boundingBox()).width;

  // The pane must not already overflow the window right after opening the tab.
  const overflowBefore = await main.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflowBefore).toBeLessThanOrEqual(1);

  // Scroll through the whole document so every (wide) line gets rendered,
  // then all the way right. CodeMirror renders lines lazily, so the layout
  // jump only happens once a wide line enters the viewport.
  await scroller.evaluate(async (el) => {
    const step = el.clientHeight / 2;
    for (let y = 0; y <= el.scrollHeight; y += step) {
      el.scrollTop = y;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    el.scrollLeft = el.scrollWidth;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  // Give CodeMirror's measure cycle time to settle.
  await page.waitForTimeout(250);

  const widthAfter = (await editorPane.boundingBox()).width;
  const overflowAfter = await main.evaluate((el) => el.scrollWidth - el.clientWidth);

  expect(overflowAfter).toBeLessThanOrEqual(1);
  expect(Math.abs(widthAfter - widthBefore)).toBeLessThanOrEqual(1);
});
