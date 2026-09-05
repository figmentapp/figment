import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The network editor prevents default on mousedown, so clicking a node never
// blurs the expression input in the params panel. The draft must still land
// on the node that was being edited, and never on the node clicked next.
const NETWORK_HEADER_HEIGHT = 33;
const NODE_WIDTH = 100;
const NODE_HEIGHT = 56;

async function setupTwoConstantNodes(page) {
  await page.addInitScript({ path: path.join(__dirname, 'desktop-stub.js') });
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => window.app?.getState().network);
  return page.evaluate(async () => {
    const s = window.app.getState();
    await s.newProject();
    const { network } = window.app.getState();
    network.deleteNodes(network.nodes.slice());
    const a = network.createNode('image.constant', 20, 100);
    const b = network.createNode('image.constant', 300, 100);
    s.togglePortExpression(a, 'width');
    s.togglePortExpression(b, 'width');
    s.selectNode(a);
    return { a: { id: a.id, x: a.x, y: a.y }, b: { id: b.id, x: b.x, y: b.y } };
  });
}

function widthExpressions(page) {
  return page.evaluate(() =>
    window.app
      .getState()
      .network.nodes.map((n) => [n.id, n.inPorts.find((p) => p.name === 'width')._value.expression]),
  );
}

test('expression draft commits to the edited node when another node is clicked', async ({ page }) => {
  const { a, b } = await setupTwoConstantNodes(page);

  const field = page.locator('.params span', { hasText: '1024' }).first();
  await field.click();
  const input = page.locator('.params input[type="text"]');
  await expect(input).toBeFocused();
  await input.fill('512 + 1');

  await page.mouse.click(b.x + NODE_WIDTH / 2, b.y + NODE_HEIGHT / 2 + NETWORK_HEADER_HEIGHT);
  await expect(page.locator('.params__header')).toContainText('Constant');
  // Blur whatever still has focus; the draft must not leak into node B.
  await page.keyboard.press('Tab');

  expect(await widthExpressions(page)).toEqual([
    [a.id, '512 + 1'],
    [b.id, '1024'],
  ]);
});

test('Escape discards the expression draft', async ({ page }) => {
  const { a, b } = await setupTwoConstantNodes(page);

  await page.locator('.params span', { hasText: '1024' }).first().click();
  const input = page.locator('.params input[type="text"]');
  await input.fill('512 + 1');
  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0);

  expect(await widthExpressions(page)).toEqual([
    [a.id, '1024'],
    [b.id, '1024'],
  ]);
});

test('an expression draft for a deleted node is dropped', async ({ page }) => {
  const { a, b } = await setupTwoConstantNodes(page);

  await page.locator('.params span', { hasText: '1024' }).first().click();
  const input = page.locator('.params input[type="text"]');
  await input.fill('512 + 1');

  const undoDepthBefore = await page.evaluate(() => window.app.getState().undoStack.length);
  // Delete the selected node from outside the params panel while the draft is open.
  await page.evaluate(() => window.app.getState().deleteSelection());
  await expect(input).toHaveCount(0);
  await page.keyboard.press('Tab');

  const state = await page.evaluate(() => ({
    ids: window.app.getState().network.nodes.map((n) => n.id),
    undoDepth: window.app.getState().undoStack.length,
  }));
  expect(state.ids).toEqual([b.id]);
  // Deleting pushed one snapshot; the dropped draft must not push another.
  expect(state.undoDepth).toBe(undoDepthBefore + 1);
  expect(await widthExpressions(page)).toEqual([[b.id, '1024']]);
});
