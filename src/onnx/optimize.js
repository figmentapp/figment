// Optimized copies of ONNX models, cached next to the original.
//
// `optimizeModel` converts a model with src/onnx/convert.js for the GPU at
// hand (float16 only when the device has shader-f16), checks the result
// against the original on the same input, and writes two files beside the
// source: `<name>.figment-optimized.onnx` and a `.json` sidecar with the
// cache key and the report. `loadOptimizedModel` returns the cached copy
// when the sidecar's key still matches: the source file's size and a hash
// of its head and tail, the converter version, and the float16 choice. A
// retrained model or a different GPU therefore never picks up a stale copy.

import { convertModel, CONVERTER_VERSION } from './convert.js';

// The structural rewrites (constant folding, ConvTranspose) must reproduce
// the original to float32 rounding: a correct rewrite scores 90 dB and
// more, a subtly wrong one has scored 48 dB on real frames. Float16 on top
// only needs to be free of overflow and garbage; random inputs drive a GAN
// into odd regimes, where a valid conversion has scored 39 dB.
export const EXACT_FLOOR_DB = 60;
export const PSNR_FLOOR_DB = 30;
const SAMPLE_BYTES = 4 * 1024 * 1024;

export function optimizedPathsFor(modelPath) {
  const base = modelPath.replace(/\.onnx$/i, '');
  return { model: `${base}.figment-optimized.onnx`, sidecar: `${base}.figment-optimized.json` };
}

// Size plus a hash of the first and last 4 MB: weights change everywhere
// between epochs, and hashing 400 MB on every load is not worth it.
export async function fingerprint(bytes) {
  const head = bytes.subarray(0, Math.min(SAMPLE_BYTES, bytes.length));
  const tail = bytes.subarray(Math.max(0, bytes.length - SAMPLE_BYTES));
  const sample = new Uint8Array(head.length + tail.length);
  sample.set(head);
  sample.set(tail, head.length);
  const digest = await crypto.subtle.digest('SHA-256', sample);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${bytes.length}-${hex.slice(0, 16)}`;
}

export function cacheKey({ fingerprint, fp16 }) {
  return `${fingerprint}/v${CONVERTER_VERSION}/${fp16 ? 'fp16' : 'fp32'}`;
}

// Peak signal-to-noise ratio between two float arrays, in dB over the
// reference's value range. Identical arrays give Infinity.
export function psnr(reference, candidate) {
  if (reference.length !== candidate.length) return 0;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let i = 0; i < reference.length; i++) {
    const r = reference[i];
    if (r < min) min = r;
    if (r > max) max = r;
    const d = r - candidate[i];
    sum += d * d;
  }
  const mse = sum / reference.length;
  if (mse === 0) return Infinity;
  const range = max - min || 1;
  return 10 * Math.log10((range * range) / mse);
}

// Runs both models once on the same input and returns the PSNR of the
// converted output against the original. `createSession` and `run` are
// injected so this works in the app (WebGPU) and in tests (wasm).
export async function compareModels(sourceBytes, convertedBytes, { createSession, release, run }) {
  const original = await createSession(sourceBytes);
  try {
    const converted = await createSession(convertedBytes);
    try {
      const inputName = original.inputNames[0];
      const shape = original.inputMetadata[0].shape.map((d) => (typeof d === 'number' ? d : 1));
      const count = shape.reduce((a, b) => a * b, 1);
      let seed = 12345;
      const input = Float32Array.from({ length: count }, () => {
        seed = (seed * 1103515245 + 12345) % 2 ** 31;
        return (seed / 2 ** 31) * 2 - 1;
      });
      const a = await run(original, inputName, input, shape);
      const b = await run(converted, inputName, input, shape);
      return psnr(a, b);
    } finally {
      await release(converted);
    }
  } finally {
    await release(original);
  }
}

async function readSidecar(desktop, path) {
  try {
    return JSON.parse(await desktop.readProjectFile(path));
  } catch {
    return null;
  }
}

// The cached optimized model for `modelPath`, or null when there is none
// or its key no longer matches.
export async function loadOptimizedModel({ modelPath, sourceBytes, fp16, desktop, fetchBytes }) {
  const paths = optimizedPathsFor(modelPath);
  const sidecar = await readSidecar(desktop, paths.sidecar);
  if (!sidecar) return null;
  const key = cacheKey({ fingerprint: await fingerprint(sourceBytes), fp16 });
  if (sidecar.key !== key) return null;
  if (sidecar.status === 'unchanged') return { bytes: sourceBytes, report: sidecar.report, status: 'unchanged', paths };
  if (sidecar.status !== 'verified') return null;
  try {
    const bytes = await fetchBytes(desktop.pathToFileURL(paths.model));
    return {
      bytes,
      report: sidecar.report,
      exactness: sidecar.exactness ?? Infinity,
      psnr: sidecar.psnr ?? Infinity,
      status: 'verified',
      paths,
    };
  } catch {
    return null;
  }
}

// Convert, verify, and cache. Returns the result whether or not it was
// kept; `status` is 'verified', 'rejected' or 'unchanged'. A rejected or
// unchanged conversion leaves only a sidecar, so the next load does not
// repeat the work.
export async function optimizeModel({ modelPath, sourceBytes, fp16, desktop, session, onProgress = () => {} }) {
  const paths = optimizedPathsFor(modelPath);
  const key = cacheKey({ fingerprint: await fingerprint(sourceBytes), fp16 });
  const finish = async (fields) => {
    const sidecar = { key, fp16, source: modelPath.split('/').pop(), created: new Date().toISOString(), ...fields };
    // JSON has no Infinity: identical outputs are stored as null.
    for (const name of ['exactness', 'psnr']) if (name in sidecar) sidecar[name] = Number.isFinite(sidecar[name]) ? sidecar[name] : null;
    await desktop.writeProjectFile(paths.sidecar, JSON.stringify(sidecar, null, 2));
  };

  onProgress('Rewriting model…');
  const structural = convertModel(sourceBytes, { fp16: false });
  const rewrote = structural.report.convTranspose?.rewritten > 0 || structural.report.fold?.nodesFolded > 0;
  if (!rewrote && !fp16) {
    // Nothing to gain on this GPU; remember that so the next load skips the work.
    await finish({ status: 'unchanged', report: structural.report });
    return { bytes: sourceBytes, report: structural.report, status: 'unchanged', exactness: Infinity, psnr: Infinity, paths };
  }
  let exactness = Infinity;
  if (rewrote) {
    onProgress('Checking the rewritten model against the original…');
    exactness = await compareModels(sourceBytes, structural.bytes, session);
    if (!(exactness >= EXACT_FLOOR_DB)) {
      await finish({ status: 'rejected', reason: 'rewrite', exactness, report: structural.report });
      return { bytes: null, report: structural.report, status: 'rejected', reason: 'rewrite', exactness, psnr: NaN, paths };
    }
  }
  let final = structural;
  let quality = Infinity;
  if (fp16) {
    onProgress('Converting to float16…');
    final = convertModel(sourceBytes, { fp16: true });
    onProgress('Checking the float16 model against the original…');
    quality = await compareModels(sourceBytes, final.bytes, session);
    if (!(quality >= PSNR_FLOOR_DB)) {
      await finish({ status: 'rejected', reason: 'fp16', exactness, psnr: quality, report: final.report });
      return { bytes: null, report: final.report, status: 'rejected', reason: 'fp16', exactness, psnr: quality, paths };
    }
  }
  onProgress('Writing optimized model…');
  const bytes = final.bytes;
  await desktop.saveBufferToFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), paths.model);
  await finish({ status: 'verified', exactness, psnr: quality, report: final.report });
  return { bytes, report: final.report, status: 'verified', exactness, psnr: quality, paths };
}
