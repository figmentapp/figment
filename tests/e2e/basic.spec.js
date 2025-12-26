import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root directory
const projectRoot = path.resolve(__dirname, '../..');

// Helper to launch the Electron app
async function launchApp() {
  const app = await electron.launch({
    args: ['.'],
    cwd: projectRoot,
    env: {
      ...process.env,
      // Use production mode to load from built files instead of dev server
      NODE_ENV: 'production',
    },
  });
  const window = await app.firstWindow();
  // Wait for the app to fully load
  await window.waitForLoadState('domcontentloaded');
  // Wait for the store and test utilities to be available
  await window.waitForFunction(() => window.__figmentTestUtils !== undefined, { timeout: 30000 });
  // Give a bit of time for the network to initialize
  await window.waitForTimeout(1000);
  return { app, window };
}

// Helper to launch app and immediately load a test fixture
async function launchAppWithFixture(fixtureName) {
  const { app, window } = await launchApp();
  const fixturePath = path.resolve(__dirname, `fixtures/${fixtureName}`);

  // Load the fixture immediately to avoid issues with default network
  await window.evaluate(async (filePath) => {
    await window.app.getState().openFile(filePath);
  }, fixturePath);

  // Wait for render to complete
  await window.evaluate(async () => {
    await window.__figmentTestUtils.waitForRender(3);
  });

  return { app, window };
}

test.describe('Figment E2E Tests', () => {
  let app;
  let window;

  test.beforeEach(async () => {
    ({ app, window } = await launchApp());
  });

  test.afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  test('app launches successfully', async () => {
    // Verify the main UI elements are present
    const editor = window.locator('[data-testid="editor"]');
    await expect(editor).toBeVisible();

    const networkTab = window.locator('[data-testid="editor-tab-network"]');
    await expect(networkTab).toBeVisible();

    const canvas = window.locator('[data-testid="network-editor-canvas"]');
    await expect(canvas).toBeVisible();
  });

  test('default network loads with nodes', async () => {
    // Use test utilities to check network state
    const networkState = await window.evaluate(() => {
      return window.__figmentTestUtils.getNetworkState();
    });

    // Default network has 6 nodes
    expect(networkState.nodeCount).toBeGreaterThan(0);
    expect(networkState.connectionCount).toBeGreaterThan(0);

    // Should have an Out node
    const outNode = networkState.nodes.find((n) => n.type === 'core.out');
    expect(outNode).toBeDefined();
  });

  test('can open node dialog with double click', async () => {
    const canvas = window.locator('[data-testid="network-editor-canvas"]');

    // Double-click on an empty area of the canvas
    await canvas.dblclick({ position: { x: 400, y: 400 } });

    // Node dialog should appear
    const nodeDialog = window.locator('[data-testid="node-dialog"]');
    await expect(nodeDialog).toBeVisible();

    // Search input should be focused
    const searchInput = window.locator('[data-testid="node-dialog-search"]');
    await expect(searchInput).toBeVisible();
  });

  test('can search for nodes in dialog', async () => {
    const canvas = window.locator('[data-testid="network-editor-canvas"]');
    await canvas.dblclick({ position: { x: 400, y: 400 } });

    const searchInput = window.locator('[data-testid="node-dialog-search"]');
    await searchInput.fill('constant');

    // Should find the Constant node type
    const constantNode = window.locator('[data-testid="node-type-item-image.constant"]');
    await expect(constantNode).toBeVisible();
  });

  test('can create a node via dialog', async () => {
    // Get initial node count
    const initialState = await window.evaluate(() => {
      return window.__figmentTestUtils.getNetworkState();
    });

    // Open dialog and create a Constant node
    const canvas = window.locator('[data-testid="network-editor-canvas"]');
    await canvas.dblclick({ position: { x: 400, y: 400 } });

    const searchInput = window.locator('[data-testid="node-dialog-search"]');
    await searchInput.fill('constant');

    // Click the create button
    const createBtn = window.locator('[data-testid="node-create-btn-image.constant"]');
    await createBtn.click();

    // Dialog should close
    const nodeDialog = window.locator('[data-testid="node-dialog"]');
    await expect(nodeDialog).not.toBeVisible();

    // Node count should increase
    const finalState = await window.evaluate(() => {
      return window.__figmentTestUtils.getNetworkState();
    });
    expect(finalState.nodeCount).toBe(initialState.nodeCount + 1);
  });

  test('output renders after frames', async () => {
    // Load a simple fixture to ensure we have valid output
    const fixturePath = path.resolve(__dirname, 'fixtures/simple-constant.fgmt');
    await window.evaluate(async (filePath) => {
      await window.app.getState().openFile(filePath);
    }, fixturePath);

    // Wait for a few render frames
    await window.evaluate(async () => {
      await window.__figmentTestUtils.waitForRender(5);
    });

    // Check that we can get output color
    const avgColor = await window.evaluate(() => {
      return window.__figmentTestUtils.getOutputAverageColor();
    });

    // Output should exist and have some values
    expect(avgColor).not.toBeNull();
    expect(avgColor.a).toBe(255); // Alpha should be fully opaque
  });

  test('can load a project file with correct output', async () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/simple-constant.fgmt');

    // Load the fixture via the store
    await window.evaluate(async (filePath) => {
      await window.app.getState().openFile(filePath);
    }, fixturePath);

    // Wait for render
    await window.evaluate(async () => {
      await window.__figmentTestUtils.waitForRender(3);
    });

    // Check network state - should have 2 nodes (Constant + Out)
    const networkState = await window.evaluate(() => {
      return window.__figmentTestUtils.getNetworkState();
    });
    expect(networkState.nodeCount).toBe(2);
    expect(networkState.connectionCount).toBe(1);

    // Verify the output color is red (the constant is set to red)
    const avgColor = await window.evaluate(() => {
      return window.__figmentTestUtils.getOutputAverageColor();
    });
    expect(avgColor.r).toBe(255);
    expect(avgColor.g).toBe(0);
    expect(avgColor.b).toBe(0);
  });

  test('invert effect produces correct output', async () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/constant-with-invert.fgmt');

    // Load the fixture with Constant -> Invert -> Out
    await window.evaluate(async (filePath) => {
      await window.app.getState().openFile(filePath);
    }, fixturePath);

    await window.evaluate(async () => {
      await window.__figmentTestUtils.waitForRender(3);
    });

    // Original color is [255, 128, 0] (orange)
    // Inverted should be [0, 127, 255] (cyan-ish)
    const avgColor = await window.evaluate(() => {
      return window.__figmentTestUtils.getOutputAverageColor();
    });

    // Allow some tolerance for rounding
    expect(avgColor.r).toBeLessThan(10);
    expect(avgColor.g).toBeGreaterThan(120);
    expect(avgColor.g).toBeLessThan(140);
    expect(avgColor.b).toBe(255);
  });
});

test.describe('Visual Regression Tests', () => {
  let app;
  let window;

  test.beforeEach(async () => {
    ({ app, window } = await launchApp());
  });

  test.afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  test('network editor screenshot with simple fixture', async () => {
    // Load a simple fixture for consistent screenshots
    const fixturePath = path.resolve(__dirname, 'fixtures/simple-constant.fgmt');
    await window.evaluate(async (filePath) => {
      await window.app.getState().openFile(filePath);
    }, fixturePath);

    // Wait for render to complete
    await window.evaluate(async () => {
      await window.__figmentTestUtils.waitForRender(3);
    });

    // Give time for UI to stabilize
    await window.waitForTimeout(500);

    const editor = window.locator('[data-testid="editor"]');
    await expect(editor).toHaveScreenshot('network-editor-simple.png', {
      maxDiffPixels: 100,
    });
  });
});
