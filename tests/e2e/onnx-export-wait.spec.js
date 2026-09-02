import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// assets/test/swap-rb-64.onnx is a 1x1 convolution that swaps the red and
// blue channels of a 64x64 image. Its output is unmistakably "the inference
// of this input": neither the input itself nor a stale frame.
const MODEL = 'test/swap-rb-64.onnx';
const FRAME_COLORS = [
  [200, 50, 20],
  [20, 120, 240],
];

// Live, the ONNX Image Model node shows its last result and runs inference in
// the background. During an export every frame must show the inference of its
// own input, so the node waits for it. This drives the same export loop as
// File > Render and --render, with an input that changes every frame.
test('exported frames show the inference of their own input', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript({ path: path.join(__dirname, 'desktop-stub.js') });
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => window.app?.getState().network && window.figment?.getGPUStatus() === 'ready');

  const pixels = await page.evaluate(
    async ({ model, colors }) => {
      // The stub maps asset paths under assets/; the dev server serves that folder at the root.
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
      network.setPortValue(constant, 'width', 64);
      network.setPortValue(constant, 'height', 64);
      network.setPortValue(constant, 'color', [...colors[0], 1.0]);
      network.setPortValue(onnx, 'model', model);
      network.connect(port(constant, 'out'), port(onnx, 'in'));
      network.connect(port(onnx, 'out'), port(out, 'in'));

      const results = [];
      await store.renderSequence(colors.length, 30, async (frame) => {
        const image = port(out, 'in').value;
        if (!image) throw new Error(`frame ${frame}: the Out node has no image`);
        const { data } = await image.readPixels();
        results.push([data[0], data[1], data[2]]);
        // Next frame gets a new input; the next export frame must show its inference.
        if (frame < colors.length) network.setPortValue(constant, 'color', [...colors[frame], 1.0]);
        return true;
      });
      const errors = network.nodes.filter((n) => n.error).map((n) => `${n.name}: ${n.error}`);
      if (errors.length) throw new Error(errors.join('\n'));
      return results;
    },
    { model: MODEL, colors: FRAME_COLORS },
  );

  // The model swaps red and blue; the node's 8-bit round trip may be off by one.
  for (const [i, [r, g, b]] of FRAME_COLORS.entries()) {
    const [pr, pg, pb] = pixels[i];
    expect(Math.abs(pr - b), `frame ${i + 1} red`).toBeLessThanOrEqual(1);
    expect(Math.abs(pg - g), `frame ${i + 1} green`).toBeLessThanOrEqual(1);
    expect(Math.abs(pb - r), `frame ${i + 1} blue`).toBeLessThanOrEqual(1);
  }
});
