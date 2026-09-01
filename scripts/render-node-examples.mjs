// Render the example images for the node reference (docs/public/img/nodes).
//
// Each image shows the source photo on the left and the output of one node on
// the right, the layout the hand-made examples use. The app runs in headless
// Chromium on SwiftShader, the same setup as the Playwright E2E tests, with a
// Vite dev server started from this script.
//
//   node scripts/render-node-examples.mjs            render the images that do not exist yet
//   node scripts/render-node-examples.mjs --all      render every image in the list
//   node scripts/render-node-examples.mjs ascii wrap render only the named images
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs/public/img/nodes');
const stubPath = path.join(root, 'tests/e2e/desktop-stub.js');
const sourceImage = 'scripts/node-examples/source.jpg';

// Layout of the composite: two panels with a white frame, 1024x512 in total.
const PANEL = 492;
const FRAME = 10;
const WIDTH = 1024;
const HEIGHT = 512;

// name: the image file (docs/public/img/nodes/<name>.jpg)
// type: the node type to render
// params: port values that make the default output meaningful
// frames: render passes before the capture, for nodes that evolve over time
const EXAMPLES = [
  { name: 'ascii', type: 'image.ascii' },
  { name: 'bleach-bypass', type: 'image.bleachBypass' },
  { name: 'center-around-gray', type: 'image.centerAroundGray' },
  { name: 'chromatic', type: 'image.chromatic' },
  { name: 'colorify', type: 'image.colorify' },
  { name: 'freichen', type: 'image.freiChen' },
  { name: 'gaussian-blur', type: 'image.gaussianBlur', params: { factor: 2 } },
  { name: 'heatmap', type: 'image.heatmap' },
  { name: 'kaleidoscope', type: 'image.kaleidoscope' },
  { name: 'noise', type: 'image.noise' },
  { name: 'screen-distortion', type: 'image.screendistortion' },
  { name: 'solarize', type: 'image.solarize', params: { threshold: 0.5 } },
  { name: 'technicolor', type: 'image.technicolor' },
  { name: 'wrap', type: 'image.wrap' },
  {
    name: 'projection-quad',
    type: 'image.projectionQuad',
    params: {
      outputWidth: PANEL,
      outputHeight: PANEL,
      topLeft: { x: 60, y: 90 },
      topRight: { x: 440, y: 20 },
      bottomRight: { x: 440, y: 470 },
      bottomLeft: { x: 60, y: 400 },
    },
  },
];

function selectExamples(argv) {
  const all = argv.includes('--all');
  const names = argv.filter((a) => !a.startsWith('--'));
  if (names.length) {
    const unknown = names.filter((n) => !EXAMPLES.some((e) => e.name === n));
    if (unknown.length) throw new Error(`Unknown example(s): ${unknown.join(', ')}`);
    return EXAMPLES.filter((e) => names.includes(e.name));
  }
  if (all) return EXAMPLES;
  return EXAMPLES.filter((e) => !fs.existsSync(path.join(outDir, `${e.name}.jpg`)));
}

// Runs inside the page. Builds source -> resize -> node, renders, and returns
// the composite as a JPEG data URL.
async function renderExample({ type, params, frames, sourceUrl, layout }) {
  const store = window.app.getState();
  await store.newProject();
  store.stop(); // stop the animation loop; this script drives the render passes
  const network = window.app.getState().network;
  network.deleteNodes([...network.nodes]);

  const port = (node, name) => [...node.inPorts, ...node.outPorts].find((p) => p.name === name);
  const source = network.createNode('image.fetchImage', 0, 0);
  const resize = network.createNode('image.resize', 0, 100);
  const subject = network.createNode(type, 0, 200);
  if (!subject) throw new Error(`Unknown node type ${type}`);
  network.setPortValue(source, 'url', sourceUrl);
  network.connect(port(source, 'out'), port(resize, 'in'));
  const input = subject.inPorts.find((p) => p.name === 'in') || subject.inPorts.find((p) => p.type === 'image');
  if (input) network.connect(port(resize, 'out'), input);
  for (const [name, value] of Object.entries(params || {})) {
    if (!port(subject, name)) throw new Error(`${type} has no port '${name}'`);
    network.setPortValue(subject, name, value);
  }
  network.markNodeDirty(source);

  for (let i = 0; i < (frames || 1); i++) {
    network.markNodeDirty(subject);
    await network.render();
  }
  const errors = network.nodes.filter((n) => n.error).map((n) => `${n.name}: ${n.error}`);
  if (errors.length) throw new Error(errors.join('\n'));

  const output = subject.outPorts.find((p) => p.type === 'image')?.value;
  if (!output) throw new Error(`${type} produced no image`);
  const left = await port(resize, 'out').value.readPixels();
  const right = await output.readPixels();

  const canvas = new OffscreenCanvas(layout.width, layout.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, layout.width, layout.height);
  const paint = async (imageData, x) => {
    const bitmap = await createImageBitmap(imageData);
    ctx.drawImage(bitmap, x, layout.frame, layout.panel, layout.panel);
    bitmap.close();
  };
  await paint(left, layout.frame);
  await paint(right, layout.width / 2 + layout.frame);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.split(',')[1];
}

async function main() {
  const examples = selectExamples(process.argv.slice(2));
  if (!examples.length) {
    console.log('Nothing to render. Pass --all to regenerate every image.');
    return;
  }

  // Silent: Vite forwards every console.error from the page, and the default
  // project's Load Movie node reports one in a browser without the desktop bridge.
  const server = await createServer({ root, server: { port: 0 }, logLevel: 'silent' });
  await server.listen();
  const address = server.httpServer.address();
  const origin = `http://localhost:${address.port}`;

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    page.on('pageerror', (err) => console.error('[page]', err.message));
    page.on('console', (msg) => {
      if (/GPU device lost/.test(msg.text())) console.error('[page]', msg.text());
    });
    await page.addInitScript({ path: stubPath });
    await page.goto(`${origin}/`);
    // The store exposes its network before the GPU is ready; wait for both.
    await page.waitForFunction(() => window.app?.getState().network && window.figment?.getGPUStatus() === 'ready', null, {
      timeout: 60_000,
    });

    for (const example of examples) {
      process.stdout.write(`${example.name} ... `);
      const base64 = await page.evaluate(renderExample, {
        type: example.type,
        params: example.params,
        frames: example.frames,
        sourceUrl: `${origin}/${sourceImage}`,
        layout: { width: WIDTH, height: HEIGHT, panel: PANEL, frame: FRAME },
      });
      fs.writeFileSync(path.join(outDir, `${example.name}.jpg`), Buffer.from(base64, 'base64'));
      console.log('done');
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
