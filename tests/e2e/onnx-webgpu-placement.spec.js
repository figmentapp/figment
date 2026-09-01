import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ONNX_DIR = path.join(__dirname, '..', '..', 'assets', 'mediapipe', 'onnx');

// A 4-element PRelu model: onnxruntime-web's WebGPU provider has no PRelu
// kernel, so creating a session for it must log the kernel miss. It proves
// the session log reaches the console before the shipped models are held
// to its absence.
const PRELU_MODEL_B64 =
  'CAg6UgoUCgF4CgVzbG9wZRIBeSIFUFJlbHUSBXByZWx1KhEIARABQgVzbG9wZUoEAACAPloPCgF4EgoKCAgBEgQKAggEYg8KAXkSCgoICAESBAoCCARCBAoAEBE=';

// Logged by js_execution_provider.cc (INFO) for every op the WebGPU
// provider declines, and by session_state.cc (VERBOSE) once every node has
// been assigned. Both need the session's own log level (not env.logLevel).
const KERNEL_MISS = /webgpu kernel not found in registries for Op type: (\w+)/;
const ALL_ON_WEBGPU = /All nodes placed on \[JsExecutionProvider\]/;

async function createSession(page, source) {
  const before = page.logs.length;
  await page.evaluate(async (source) => {
    const bytes = typeof source === 'string' ? await (await fetch(source)).bytes() : Uint8Array.from(source);
    window.ort.env.webgpu.adapter = window.figment.getAdapter();
    window.ort.env.webgpu.device = window.figment.getDevice();
    const session = await window.figment.withOrt(() =>
      window.ort.InferenceSession.create(bytes, {
        executionProviders: ['webgpu'],
        logSeverityLevel: 0,
        logVerbosityLevel: 1,
      }),
    );
    await window.figment.withOrt(() => session.release());
  }, source);
  const logs = page.logs.slice(before);
  return {
    misses: logs.map((l) => l.match(KERNEL_MISS)?.[1]).filter(Boolean),
    allOnWebGpu: logs.some((l) => ALL_ON_WEBGPU.test(l)),
  };
}

// Every shipped ONNX model must run entirely on the WebGPU provider: an op
// without a WebGPU kernel silently falls back to the CPU provider with a
// GPU->CPU->GPU round trip per node. scripts/convert-mediapipe-to-onnx.py
// checks op types statically; this is the runtime check, against the
// onnxruntime-web build the app actually ships.
test('shipped ONNX models place every node on the WebGPU provider', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript({ path: path.join(__dirname, 'desktop-stub.js') });
  page.logs = [];
  page.on('console', (msg) => page.logs.push(msg.text()));

  await page.goto('/');
  await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => window.figment?.getDevice() && window.ort);

  const control = await createSession(page, Array.from(Buffer.from(PRELU_MODEL_B64, 'base64')));
  expect(control.misses, 'positive control: PRelu has no WebGPU kernel').toEqual(['PRelu']);
  expect(control.allOnWebGpu).toBe(false);

  const models = fs.readdirSync(ONNX_DIR).filter((f) => f.endsWith('.onnx'));
  expect(models.length).toBeGreaterThan(0);
  for (const model of models) {
    const result = await createSession(page, `./mediapipe/onnx/${model}`);
    expect(result.misses, `${model}: ops without a WebGPU kernel`).toEqual([]);
    expect(result.allOnWebGpu, `${model}: all nodes on the WebGPU provider`).toBe(true);
  }
});
