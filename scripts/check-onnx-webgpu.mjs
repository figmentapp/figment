// Check whether an ONNX model runs entirely on the GPU in Figment.
//
// onnxruntime-web's WebGPU execution provider hands every op it has no
// kernel for to the CPU provider, silently. ORT then inserts Memcpy nodes
// around that op, so on every frame the activations are copied GPU→CPU,
// computed on the CPU, and copied back. Which ops those are depends on the
// exact onnxruntime-web build Figment ships, so the only reliable check is
// to create a session in the real app: this script starts a Vite dev
// server, opens Figment in headless Chromium (SwiftShader, the same setup
// as the Playwright E2E tests), creates a WebGPU session for each model
// with the session log at its most verbose, and reports what ORT did.
//
//   node scripts/check-onnx-webgpu.mjs output/generator_epoch_14.onnx [more.onnx ...]
//
// Per model, one of:
//   OK      every node runs on the WebGPU provider;
//   OK      some nodes run on the CPU but no Memcpy was inserted: these are
//           shape computations on tiny int64 tensors that never touch the
//           GPU (ORT puts them on the CPU on purpose);
//   FAIL    ORT inserted Memcpy nodes: activations cross the bus every
//           frame. The ops named are the ones to rewrite in the model.
// Exit status is 1 when any model fails or cannot be loaded (unsupported
// opset, external data file, ...). The ONNX Image Model node also requires
// 4D NCHW float input and output with static height and width.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stubPath = path.join(root, 'tests/e2e/desktop-stub.js');
const MODEL_ROUTE = '/__check-onnx/';

// ORT session log lines, in the order they appear during session creation:
// js_execution_provider.cc (INFO) for every op the WebGPU provider declines,
// transformer_memcpy.cc (INFO) for every copy node it has to insert, and
// session_state.cc (VERBOSE) for the final placement.
const KERNEL_MISS = /webgpu kernel not found in registries for Op type: (\w+) node name: (\S+)/;
const MEMCPY_ADDED = /Add (MemcpyToHost|MemcpyFromHost) (?:after|before) (\S+) for/;
const ALL_ON_WEBGPU = /All nodes placed on \[JsExecutionProvider\]\. Number of nodes: (\d+)/;
const PLACED_ON = /Node\(s\) placed on \[(\w+)\]\. Number of nodes: (\d+)/;

async function main() {
  const models = process.argv.slice(2).map((p) => path.resolve(p));
  if (!models.length) {
    console.log('Usage: node scripts/check-onnx-webgpu.mjs <model.onnx> [more.onnx ...]');
    process.exit(2);
  }
  for (const model of models) {
    if (!fs.existsSync(model)) {
      console.error(`No such file: ${model}`);
      process.exit(2);
    }
  }

  // Serve the models from wherever they are under MODEL_ROUTE so the page
  // can fetch them like any asset, whatever their size.
  const serveModels = {
    name: 'figment-serve-onnx-models',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(MODEL_ROUTE)) return next();
        const file = models[Number(req.url.slice(MODEL_ROUTE.length))];
        if (file === undefined) return next();
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', fs.statSync(file).size);
        fs.createReadStream(file).pipe(res);
      });
    },
  };
  const server = await createServer({ root, server: { port: 0 }, logLevel: 'silent', plugins: [serveModels] });
  await server.listen();
  const origin = `http://localhost:${server.httpServer.address().port}`;

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  let failed = false;
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const logs = [];
    page.on('console', (msg) => logs.push(msg.text()));
    page.on('pageerror', (err) => console.error('[page]', err.message));
    await page.addInitScript({ path: stubPath });
    await page.goto(`${origin}/`);
    await page.waitForFunction(() => window.figment?.getDevice() && window.ort, null, { timeout: 60_000 });

    for (const [index, model] of models.entries()) {
      process.stdout.write(`${path.basename(model)} ... `);
      const before = logs.length;
      const result = await page.evaluate(createSession, `${MODEL_ROUTE}${index}`);
      if (result.error) {
        failed = true;
        console.log(`FAILED to load\n  ${result.error}`);
        continue;
      }
      const report = analyze(logs.slice(before));
      if (report.failed) failed = true;
      console.log(report.lines.join('\n'));
      console.log(`  input ${result.input}, output ${result.output}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  process.exit(failed ? 1 : 0);
}

export function analyze(logs) {
  const match = (re) => logs.map((l) => l.match(re)).filter(Boolean);
  const allOnWebGpu = match(ALL_ON_WEBGPU)[0];
  const placements = Object.fromEntries(match(PLACED_ON).map(([, ep, count]) => [ep, Number(count)]));
  const memcpys = match(MEMCPY_ADDED).map(([, kind, tensor]) => `${kind} ${tensor}`);
  const misses = [...new Set(match(KERNEL_MISS).map(([, op, name]) => `${op} (${name})`))];
  const cpuNodes = placements.CPUExecutionProvider ?? 0;
  const gpuNodes = placements.JsExecutionProvider ?? 0;

  if (allOnWebGpu) {
    return { failed: false, lines: [`OK, all ${allOnWebGpu[1]} nodes on WebGPU`] };
  }
  const lines = [];
  // No Memcpy means the CPU nodes only touch tensors that live on the CPU
  // anyway (shape computations). A graph entirely on the CPU is never fine.
  const benign = memcpys.length === 0 && gpuNodes > 0;
  lines.push(
    benign
      ? `OK, ${gpuNodes} nodes on WebGPU, ${cpuNodes} shape-only nodes on the CPU (no GPU↔CPU copies)`
      : `FAIL, ${gpuNodes} nodes on WebGPU, ${cpuNodes} on the CPU, ${memcpys.length} GPU↔CPU copies per run`,
  );
  if (misses.length) lines.push(`  ops without a WebGPU kernel: ${misses.join(', ')}`);
  for (const copy of memcpys) lines.push(`  copy: ${copy}`);
  return { failed: !benign, lines };
}

// Runs in the page. Creates and releases a WebGPU session for the model at
// `url` with the session log at its most verbose, the way
// tests/e2e/onnx-webgpu-placement.spec.js does for the shipped models.
async function createSession(url) {
  const describe = (meta) => `${meta.name} ${meta.type}[${meta.shape.join('×')}]`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    window.ort.env.webgpu.adapter = window.figment.getAdapter();
    window.ort.env.webgpu.device = window.figment.getDevice();
    const session = await window.figment.withOrt(() =>
      window.ort.InferenceSession.create(bytes, {
        executionProviders: ['webgpu'],
        logSeverityLevel: 0,
        logVerbosityLevel: 1,
      }),
    );
    const result = {
      input: session.inputMetadata.map(describe).join(', '),
      output: session.outputMetadata.map(describe).join(', '),
    };
    await window.figment.withOrt(() => session.release());
    return result;
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
