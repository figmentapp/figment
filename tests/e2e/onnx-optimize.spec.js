import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// With `optimize` on, the ONNX Image Model node converts the model for this
// GPU on load, checks the conversion against the original, and writes the
// result next to the model. assets/test/swap-rb-up-32.onnx is a stride-2
// ConvTranspose that doubles the size and swaps red and blue; the conversion
// rewrites it (SwiftShader has no shader-f16, so float16 stays off), and the
// output must still be the swapped, doubled input.
test('the optimize option converts the model on load and caches it next to the file', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript({ path: path.join(__dirname, 'desktop-stub.js') });
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => window.app?.getState().network && window.figment?.getGPUStatus() === 'ready');

  const result = await page.evaluate(async () => {
    window.desktop.pathToFileURL = (filePath) => './' + filePath.replace(/^.*\/test\//, 'test/');
    const store = window.app.getState();
    await store.newProject();
    store.stop();
    const network = window.app.getState().network;
    network.deleteNodes([...network.nodes]);
    const port = (node, name) => [...node.inPorts, ...node.outPorts].find((p) => p.name === name);

    const constant = network.createNode('image.constant', 0, 0);
    const onnx = network.createNode('ml.onnxImageModel', 0, 100);
    const out = network.createNode('core.out', 0, 200);
    network.setPortValue(constant, 'width', 32);
    network.setPortValue(constant, 'height', 32);
    network.setPortValue(constant, 'color', [200, 50, 20, 1.0]);
    network.setPortValue(onnx, 'model', 'test/swap-rb-up-32.onnx');
    network.setPortValue(onnx, 'optimize', true);
    network.connect(port(constant, 'out'), port(onnx, 'in'));
    network.connect(port(onnx, 'out'), port(out, 'in'));

    let pixel;
    await store.renderSequence(1, 30, async () => {
      const image = port(out, 'in').value;
      const { data } = await image.readPixels();
      pixel = [data[0], data[1], data[2], image.width, image.height];
      return true;
    });
    const errors = network.nodes.filter((n) => n.error).map((n) => `${n.name}: ${n.error}`);
    const files = [...window.__stubFiles.keys()];
    const sidecar = files.find((f) => f.endsWith('.figment-optimized.json'));
    return { pixel, errors, files, sidecar: sidecar ? JSON.parse(window.__stubFiles.get(sidecar)) : null };
  });

  expect(result.errors).toEqual([]);
  expect(result.files.some((f) => f.endsWith('/test/swap-rb-up-32.figment-optimized.onnx'))).toBe(true);
  expect(result.sidecar.status).toBe('verified');
  // null means identical outputs (JSON has no Infinity)
  if (result.sidecar.exactness !== null) expect(result.sidecar.exactness).toBeGreaterThan(60);
  expect(result.sidecar.report.convTranspose.rewritten).toBe(1);
  expect(result.sidecar.report.after.ops.ConvTranspose).toBeUndefined();
  const [r, g, b, width, height] = result.pixel;
  expect([width, height]).toEqual([64, 64]);
  expect(Math.abs(r - 20)).toBeLessThanOrEqual(1);
  expect(Math.abs(g - 50)).toBeLessThanOrEqual(1);
  expect(Math.abs(b - 200)).toBeLessThanOrEqual(1);
});
