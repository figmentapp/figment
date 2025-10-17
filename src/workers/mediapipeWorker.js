// Worker for MediaPipe Tasks off-main-thread inference.
// Supports: face, hands, pose, segmentPose (segmentation mask)
// Messages:
// - { type: 'init', task: 'face'|'hands'|'pose'|'segmentPose', options: { basePath, taskOptions } }
// - { type: 'frame', width, height, buffer }
// - { type: 'frameBitmap', bitmap, width, height }
// - { type: 'setOptions', options }

import { FilesetResolver, FaceLandmarker, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

// The mediapipe library uses `importScripts` internally which is not supported in modules.
// Here's a little shim for this:
if (typeof self.importScripts !== 'function') {
  self.importScripts = function (...urls) {
    for (const url of urls) {
      const abs = new URL(url, self.location.href).toString();
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
}

let _taskKind = null;
let _landmarker = null;
let _vision = null;
let _visionBase = null;
let _ready = false;

async function ensureTask(kind, options) {
  debugger;
  const taskOptions = options?.taskOptions ?? {};
  if (_ready && _taskKind === kind && _landmarker) {
    if (options) {
      try {
        // Some tasks support setOptions to update things like numFaces, confidences, etc.
        await _landmarker.setOptions(taskOptions);
      } catch (_) {
        // Fallback to recreate if setOptions unsupported or failed.
      }
    }
    return;
  }

  // Clean up any previous instance
  if (_landmarker) {
    try {
      await _landmarker.close();
    } catch (_) {}
  }
  _landmarker = null;
  _ready = false;

  const mediapipeRoot = `${self.location.origin}/mediapipe/wasm`;
  console.log('MEDIA PIPE ROOT', mediapipeRoot);

  if (!_vision) {
    _vision = await FilesetResolver.forVisionTasks(mediapipeRoot);
  }

  // const common = options?.taskOptions ? JSON.parse(JSON.stringify(options.taskOptions)) : {};
  // If a model path is provided, load it now and pass as buffer to avoid path issues.
  // if (common.baseOptions && common.baseOptions.modelAssetPath) {
  //   try {
  //     const modelUrl = new URL(common.baseOptions.modelAssetPath, modelBasePath).href;
  //     const bytes = await loadBinary(modelUrl);
  //     delete common.baseOptions.modelAssetPath;
  //     common.baseOptions.modelAssetBuffer = bytes;
  //   } catch (e) {
  //     // Surface a clearer initialization error to the main thread
  //     throw new Error(`Failed to load model asset: ${e.message}`);
  //   }
  // }
  _taskKind = kind;

  if (kind === 'face') {
    _landmarker = await FaceLandmarker.createFromOptions(_vision, taskOptions);
  } else if (kind === 'hands') {
    _landmarker = await HandLandmarker.createFromOptions(_vision, taskOptions);
  } else if (kind === 'pose') {
    _landmarker = await HandLandmarker.createFromOptions(_vision, taskOptions);
  } else if (kind === 'segmentPose') {
    _landmarker = await PoseLandmarker.createFromOptions(_vision, taskOptions);
  } else {
    throw new Error(`Unsupported task kind: ${kind}`);
  }

  _ready = true;
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
      self.postMessage({ type: 'result', id, result }, result.mask ? [result.mask] : undefined);
      return;
    }
    if (msg.type === 'frameBitmap') {
      if (!_ready || !_landmarker) return;
      const { id, width, height, bitmap } = msg;
      const raw = _landmarker.detect(bitmap);
      try {
        if (bitmap && bitmap.close) bitmap.close();
      } catch (_) {}
      const result = sanitizeResult(_taskKind, raw, width, height);
      self.postMessage({ type: 'result', id, result }, result.mask ? [result.mask] : undefined);
      return;
    }
  } catch (err) {
    console.error(err);
    self.postMessage({ type: 'error', error: String(err && err.message ? err.message : err) });
  }
};
