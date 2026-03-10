// Worker for MediaPipe Tasks off-main-thread inference.
// Supports: face, hands, pose, segmentPose (segmentation mask)
// Messages:
// - { type: 'init', task: 'face'|'hands'|'pose'|'segmentPose', options: { taskFile, taskOptions } }
// - { type: 'frame', width, height, buffer }
// - { type: 'setOptions', options }

import { FilesetResolver, FaceLandmarker, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

const LANDMARKER_FACTORIES = {
  face: FaceLandmarker,
  hands: HandLandmarker,
  pose: PoseLandmarker,
  segmentPose: PoseLandmarker,
};

function mediapipeRoot() {
  // Dev: http(s) -> use origin + /mediapipe/
  // Prod/Electron: file:///.../build/assets/worker.js -> /build/mediapipe/
  const href = String((self.location && self.location.href) || import.meta.url || '');
  const iBuild = href.lastIndexOf('/build/');
  if (iBuild !== -1) return href.slice(0, iBuild + '/build/'.length) + 'mediapipe/';

  // If we see /assets/, back up to its parent and swap to /mediapipe/
  const iAssets = href.lastIndexOf('/assets/');
  if (iAssets !== -1) return href.slice(0, iAssets) + '/mediapipe/';

  // Fallback for dev servers (http://localhost:3000)
  try {
    const u = new URL(href);
    if (u.protocol === 'http:' || u.protocol === 'https:') return `${u.origin}/mediapipe/`;
  } catch {}
  // Last resort: relative
  return 'mediapipe/';
}

function mediapipeResolve(path) {
  if (!path) return mediapipeRoot();
  const s = String(path);

  // If caller passed an absolute URL, try to peel to ".../mediapipe/<tail>"
  const m = s.match(/mediapipe\/(.+)$/);
  const tail = (m ? m[1] : s)
    .replace(/^(\.?\/)+/, '') // drop leading ./ or /
    .replace(/^assets\//, '') // strip accidental "assets/"
    .replace(/^mediapipe\//, ''); // and "mediapipe/"

  // Join on our computed root (which already ends with /)
  return mediapipeRoot() + tail.replace(/^\/+/, '');
}

self.importScripts = function (...urls) {
  for (const url of urls) {
    const abs = mediapipeResolve(url);
    const req = new XMLHttpRequest();
    req.open('GET', abs, false); // async = false
    try {
      req.send();
    } catch (err) {
      throw new Error(`importScripts shim: network error for ${abs}: ${err.message || err}`);
    }
    const ok = req.status === 0 || (req.status >= 200 && req.status < 300);
    if (!ok) throw new Error(`importScripts shim: ${abs} -> HTTP ${req.status}`);
    (0, eval)(`${req.responseText}\n//# sourceURL=${abs}`);
  }
};

let _taskKind = null;
let _landmarker = null;
let _vision = null;
let _visionBase = null;
let _ready = false;

async function ensureTask(kind, options = {}) {
  const taskFile = options.taskFile;
  const taskOptions = options.taskOptions ?? {};

  if (_ready && _taskKind === kind && _landmarker) {
    if (Object.keys(taskOptions).length > 0) {
      try {
        await _landmarker.setOptions(taskOptions);
        return;
      } catch (_) {
        // Fall through to recreate with new options.
      }
    } else {
      return;
    }
  }

  // Clean up any previous instance
  if (_landmarker) {
    try {
      await _landmarker.close();
    } catch (_) {}
  }
  _landmarker = null;
  _ready = false;

  const mpRoot = mediapipeRoot();

  if (!_vision || _visionBase !== mpRoot) {
    _vision = await FilesetResolver.forVisionTasks(mpRoot);
    _visionBase = mpRoot;
  }

  const factory = LANDMARKER_FACTORIES[kind];
  if (!factory) throw new Error(`Unsupported task kind: ${kind}`);

  const baseOptions = { ...(taskOptions.baseOptions || {}) };
  const initialModelPath = taskFile ?? baseOptions.modelAssetPath;
  if (initialModelPath) {
    baseOptions.modelAssetPath = mediapipeResolve(initialModelPath);
  }

  const requestedDelegate = baseOptions.delegate;
  const delegates = requestedDelegate ? [requestedDelegate] : ['GPU', 'CPU'];

  const optionsSansBase = { ...taskOptions };
  delete optionsSansBase.baseOptions;

  let lastError = null;
  for (const delegate of delegates) {
    const opts = {
      ...optionsSansBase,
      baseOptions: { ...baseOptions, delegate },
    };
    try {
      _landmarker = await factory.createFromOptions(_vision, opts);
      _taskKind = kind;
      _ready = true;
      return;
    } catch (err) {
      lastError = err;
      if (requestedDelegate) break;
    }
  }

  throw lastError || new Error(`Failed to initialize MediaPipe task: ${kind}`);
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
      // Close all masks to free WASM memory
      for (const mask of raw.segmentationMasks) {
        try {
          mask.close();
        } catch (_) {}
      }
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
      await ensureTask(_taskKind, { taskOptions: msg.options });
      self.postMessage({ type: 'optionsUpdated' });
      return;
    }
    if (msg.type === 'frame') {
      if (!_ready || !_landmarker) return;
      const { id, width, height, buffer } = msg;
      const data = new Uint8ClampedArray(buffer);
      const imageData = new ImageData(data, width, height);
      // All nodes here use runningMode: 'IMAGE'. Use .detect(image).
      const raw = _landmarker.detect(imageData);
      const result = sanitizeResult(_taskKind, raw, width, height);
      const transfer = [];
      if (result.mask) transfer.push(result.mask);
      if (buffer) transfer.push(buffer);
      self.postMessage({ type: 'result', id, result, buffer }, transfer);
      return;
    }
  } catch (err) {
    console.error(err);
    self.postMessage({ type: 'error', error: String(err && err.message ? err.message : err) });
  }
};
