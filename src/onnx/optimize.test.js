import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ort from 'onnxruntime-web';
import {
  EXACT_FLOOR_DB,
  optimizedPathsFor,
  fingerprint,
  cacheKey,
  psnr,
  compareModels,
  optimizeModel,
  loadOptimizedModel,
  PSNR_FLOOR_DB,
} from './optimize.js';
import { CONVERTER_VERSION } from './convert.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => new Uint8Array(fs.readFileSync(path.join(here, 'fixtures', name)));

// ORT's CPU provider stands in for the app's WebGPU sessions.
const session = {
  createSession: (bytes) => ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] }),
  release: (s) => s.release(),
  run: async (s, name, data, dims) => {
    const result = await s.run({ [name]: new ort.Tensor('float32', data, dims) });
    return Float32Array.from(result[s.outputNames[0]].data);
  },
};

// An in-memory stand-in for the preload bridge.
function fakeDesktop() {
  const files = new Map();
  return {
    files,
    readProjectFile: async (p) => {
      if (!files.has(p)) throw new Error(`ENOENT ${p}`);
      return files.get(p);
    },
    writeProjectFile: async (p, data) => void files.set(p, data),
    saveBufferToFile: async (buffer, p) => void files.set(p, new Uint8Array(buffer)),
    pathToFileURL: (p) => `file://${p}`,
  };
}

describe('optimized model cache', () => {
  it('names the files next to the model', () => {
    expect(optimizedPathsFor('/models/generator_epoch_089.onnx')).toEqual({
      model: '/models/generator_epoch_089.figment-optimized.onnx',
      sidecar: '/models/generator_epoch_089.figment-optimized.json',
    });
  });

  it('fingerprints by size and content', async () => {
    const a = fixture('unet-mini.onnx');
    const b = new Uint8Array(a);
    b[b.length - 100] ^= 1;
    expect(await fingerprint(a)).toBe(await fingerprint(a));
    expect(await fingerprint(a)).not.toBe(await fingerprint(b));
    expect(await fingerprint(a).then((f) => f.startsWith(`${a.length}-`))).toBe(true);
    expect(cacheKey({ fingerprint: 'x', fp16: true })).toBe(`x/v${CONVERTER_VERSION}/fp16`);
  });

  it('measures PSNR over the reference range', () => {
    const a = Float32Array.from([0, 0.5, 1]);
    expect(psnr(a, a)).toBe(Infinity);
    expect(psnr(a, Float32Array.from([0.01, 0.5, 1]))).toBeCloseTo(44.77, 1);
    expect(psnr(a, Float32Array.from([1, 0.5, 0]))).toBeLessThan(5);
  });

  it('converts, verifies against the original, writes the cache, and loads it back', async () => {
    const desktop = fakeDesktop();
    const sourceBytes = fixture('unet-mini.onnx');
    const modelPath = '/models/unet-mini.onnx';
    const progress = [];
    const result = await optimizeModel({ modelPath, sourceBytes, fp16: true, desktop, session, onProgress: (m) => progress.push(m) });
    expect(result.status).toBe('verified');
    expect(result.exactness).toBeGreaterThan(EXACT_FLOOR_DB);
    expect(result.psnr).toBeGreaterThan(PSNR_FLOOR_DB);
    expect(result.report.convTranspose.rewritten).toBe(2);
    expect(desktop.files.get('/models/unet-mini.figment-optimized.onnx').length).toBe(result.bytes.length);
    expect(JSON.parse(desktop.files.get('/models/unet-mini.figment-optimized.json')).status).toBe('verified');
    expect(progress.length).toBe(5);

    const fetchBytes = async (url) => desktop.files.get(url.replace('file://', ''));
    const cached = await loadOptimizedModel({ modelPath, sourceBytes, fp16: true, desktop, fetchBytes });
    expect(cached.bytes).toEqual(result.bytes);
    expect(cached.psnr).toBe(result.psnr);
    // A different GPU choice or a changed source misses the cache.
    expect(await loadOptimizedModel({ modelPath, sourceBytes, fp16: false, desktop, fetchBytes })).toBeNull();
    const changed = new Uint8Array(sourceBytes);
    changed[changed.length - 1] ^= 1;
    expect(await loadOptimizedModel({ modelPath, sourceBytes: changed, fp16: true, desktop, fetchBytes })).toBeNull();
  });

  it('rejects a conversion whose output drifts, and remembers the rejection', async () => {
    const desktop = fakeDesktop();
    const sourceBytes = fixture('unet-mini.onnx');
    const broken = {
      ...session,
      // Pretend the converted model returns something else.
      run: async (s, name, data, dims) => {
        const out = await session.run(s, name, data, dims);
        return s.__broken ? out.map((v) => -v) : out;
      },
      createSession: async (bytes) => {
        const s = await session.createSession(bytes);
        s.__broken = bytes !== sourceBytes;
        return s;
      },
    };
    const result = await optimizeModel({ modelPath: '/m/unet-mini.onnx', sourceBytes, fp16: true, desktop, session: broken });
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('rewrite');
    expect(result.bytes).toBeNull();
    expect(desktop.files.has('/m/unet-mini.figment-optimized.onnx')).toBe(false);
    expect(JSON.parse(desktop.files.get('/m/unet-mini.figment-optimized.json')).status).toBe('rejected');
  });

  it('records a conversion that changes nothing instead of writing a copy', async () => {
    const desktop = fakeDesktop();
    const sourceBytes = new Uint8Array(fs.readFileSync(path.join(here, '..', '..', 'assets', 'test', 'swap-rb-64.onnx')));
    const result = await optimizeModel({ modelPath: '/m/swap.onnx', sourceBytes, fp16: false, desktop, session });
    expect(result.status).toBe('unchanged');
    expect(result.bytes).toBe(sourceBytes);
    expect(desktop.files.has('/m/swap.figment-optimized.onnx')).toBe(false);
    const fetchBytes = async () => {
      throw new Error('no file');
    };
    const cached = await loadOptimizedModel({ modelPath: '/m/swap.onnx', sourceBytes, fp16: false, desktop, fetchBytes });
    expect(cached.status).toBe('unchanged');
    expect(cached.bytes).toBe(sourceBytes);
  });

  it('reports an already optimized model as unchanged', async () => {
    const desktop = fakeDesktop();
    const sourceBytes = fixture('unet-mini.onnx');
    const first = await optimizeModel({ modelPath: '/m/unet-mini.onnx', sourceBytes, fp16: true, desktop, session });
    const again = await optimizeModel({
      modelPath: '/m/unet-mini.figment-optimized.onnx',
      sourceBytes: first.bytes,
      fp16: true,
      desktop,
      session,
    });
    expect(again.status).toBe('unchanged');
    expect(again.bytes).toBe(first.bytes);
  });

  it('compares two models on the same synthetic input', async () => {
    const bytes = fixture('unet-mini.onnx');
    expect(await compareModels(bytes, bytes, session)).toBe(Infinity);
  });
});
