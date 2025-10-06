// Worker for MediaPipe Tasks off-main-thread inference.
// Supports: face, hands, pose, segmentPose (segmentation mask)
// Messages:
// - { type: 'init', task: 'face'|'hands'|'pose'|'segmentPose', options: { basePath, taskOptions } }
// - { type: 'frame', width, height, buffer }
// - { type: 'frameBitmap', bitmap, width, height }
// - { type: 'setOptions', options }

// Note: @mediapipe/tasks-vision may attempt to call importScripts inside workers to load
// wasm helpers. Module workers don’t allow importScripts, so we override it with a
// synchronous XHR + eval shim before dynamically importing the library.
try {
  const original = self.importScripts;
  self.importScripts = function (...urls) {
    for (const u of urls) {
      const abs = new URL(u, self.location.href).href;
      const xhr = new XMLHttpRequest();
      xhr.open('GET', abs, false);
      xhr.responseType = 'text';
      xhr.send(null);
      const code = xhr.responseText || '';
      (0, eval)(code + `\n//# sourceURL=${abs}`);
    }
  };
} catch (_) {
  // Ignore if redefining fails; many engines allow overriding on WorkerGlobalScope.
}

let mediapipe = null;

let taskKind = null;
let landmarker = null;
let vision = null;
let visionBase = null;
let ready = false;

async function loadBinary(url) {
  try {
    // Prefer fetch when available and allowed.
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    return new Uint8Array(ab);
  } catch (err) {
    // Fallback to XHR (works for file:// in Electron)
    return await new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = () => {
          if (xhr.status === 200 || (xhr.status === 0 && xhr.response)) {
            resolve(new Uint8Array(xhr.response));
          } else {
            reject(new Error(`XHR ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error('XHR error'));
        xhr.send();
      } catch (e) {
        reject(e);
      }
    });
  }
}

async function ensureTask(kind, options) {
  if (ready && taskKind === kind && landmarker) {
    if (options) {
      try {
        // Some tasks support setOptions to update things like numFaces, confidences, etc.
        await landmarker.setOptions(options.taskOptions ?? {});
      } catch (_) {
        // Fallback to recreate if setOptions unsupported or failed.
      }
    }
    return;
  }

  // Clean up any previous instance
  if (landmarker) {
    try { await landmarker.close(); } catch (_) {}
  }
  landmarker = null;
  ready = false;

  const basePath = options?.basePath || './mediapipe';
  if (!mediapipe) {
    // Ensure importScripts polyfill is present before importing the module.
    mediapipe = await import('@mediapipe/tasks-vision');
  }
  if (!vision || visionBase !== basePath) {
    vision = await mediapipe.FilesetResolver.forVisionTasks(basePath);
    visionBase = basePath;
  }

  const common = options?.taskOptions ? JSON.parse(JSON.stringify(options.taskOptions)) : {};
  // If a model path is provided, load it now and pass as buffer to avoid path issues.
  if (common.baseOptions && common.baseOptions.modelAssetPath) {
    try {
      const modelUrl = new URL(common.baseOptions.modelAssetPath, basePath).href;
      const bytes = await loadBinary(modelUrl);
      delete common.baseOptions.modelAssetPath;
      common.baseOptions.modelAssetBuffer = bytes;
    } catch (e) {
      // Surface a clearer initialization error to the main thread
      throw new Error(`Failed to load model asset: ${e.message}`);
    }
  }
  taskKind = kind;

  async function tryCreate(factory) {
    try {
      return await factory(common);
    } catch (e) {
      // Retry with CPU delegate if GPU fails.
      try {
        if (common.baseOptions) common.baseOptions.delegate = 'CPU';
        return await factory(common);
      } catch (e2) {
        throw e2;
      }
    }
  }

  if (kind === 'face') {
    landmarker = await tryCreate((opts) => mediapipe.FaceLandmarker.createFromOptions(vision, opts));
  } else if (kind === 'hands') {
    landmarker = await tryCreate((opts) => mediapipe.HandLandmarker.createFromOptions(vision, opts));
  } else if (kind === 'pose') {
    landmarker = await tryCreate((opts) => mediapipe.PoseLandmarker.createFromOptions(vision, opts));
  } else if (kind === 'segmentPose') {
    landmarker = await tryCreate((opts) => mediapipe.PoseLandmarker.createFromOptions(vision, opts));
  } else {
    throw new Error(`Unsupported task kind: ${kind}`);
  }

  ready = true;
}

function sanitizeResult(kind, raw, width, height) {
  if (!raw) return { kind, ok: false };
  if (kind === 'face') {
    return {
      kind,
      ok: true,
      faceLandmarks: raw.faceLandmarks || [],
    };
  } else if (kind === 'hands') {
    return {
      kind,
      ok: true,
      landmarks: raw.landmarks || [],
      worldLandmarks: raw.worldLandmarks || [],
      handednesses: raw.handednesses || [],
    };
  } else if (kind === 'pose') {
    return {
      kind,
      ok: true,
      landmarks: raw.landmarks || [],
    };
  } else if (kind === 'segmentPose') {
    // Extract a compact Uint8Array mask (single-channel) if available.
    let maskBuffer = null;
    if (raw.segmentationMasks && raw.segmentationMasks.length > 0) {
      try {
        const u8 = raw.segmentationMasks[0].getAsUint8Array();
        maskBuffer = u8.buffer.slice(0); // copy to detach from wasm memory
      } catch (_) {}
    }
    return {
      kind,
      ok: true,
      landmarks: raw.landmarks || [],
      mask: maskBuffer,
      width,
      height,
    };
  }
  return { kind, ok: false };
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      await ensureTask(msg.task, msg.options);
      self.postMessage({ type: 'ready', task: msg.task });
      return;
    }
    if (msg.type === 'setOptions') {
      await ensureTask(taskKind, { taskOptions: msg.options });
      self.postMessage({ type: 'optionsUpdated' });
      return;
    }
    if (msg.type === 'frame') {
      if (!ready || !landmarker) return;
      const { id, width, height, buffer } = msg;
      const data = new Uint8ClampedArray(buffer);
      const imageData = new ImageData(data, width, height);
      // All nodes here use runningMode: 'IMAGE'. Use .detect(image).
      const raw = landmarker.detect(imageData);
      const result = sanitizeResult(taskKind, raw, width, height);
      self.postMessage({ type: 'result', id, result }, result.mask ? [result.mask] : undefined);
      return;
    }
    if (msg.type === 'frameBitmap') {
      if (!ready || !landmarker) return;
      const { id, width, height, bitmap } = msg;
      const raw = landmarker.detect(bitmap);
      try { if (bitmap && bitmap.close) bitmap.close(); } catch (_) {}
      const result = sanitizeResult(taskKind, raw, width, height);
      self.postMessage({ type: 'result', id, result }, result.mask ? [result.mask] : undefined);
      return;
    }
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err && err.message ? err.message : err) });
  }
};
