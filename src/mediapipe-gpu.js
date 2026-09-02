// GPU-resident MediaPipe pipelines (pose, hands, face, selfie segmentation).
//
// MediaPipe's own web runtime (tasks-vision) runs its models through WebGL
// and only accepts CPU-side images, which forces a full-frame GPU→CPU
// readback on input and a CPU upload for the mask on output. This module
// reimplements the task graphs natively on Figment's WebGPU device
// instead. The two-stage landmarker graphs:
//
//   frame texture ──letterbox──▶ NxN ──pack──▶ NHWC buffer
//        │                                      │ ONNX detector (WebGPU EP)
//        │                     anchors decode + weighted NMS (small readback)
//        │                                      ▼ up to 4 ROIs
//        └──rotated ROI crop──▶ MxM ──pack──▶ NHWC buffer   (per instance)
//                                               │ ONNX landmark model (WebGPU EP)
//                    landmarks (~1 KB readback) ◀┤
//                                               ▼ pose only: segmentation mask
//                    frame-size mask ◀──warp── 256×256 mask textures (stay on GPU)
//
// and the single-stage image segmenter graph:
//
//   frame texture ──resize──▶ NxN ──pack──▶ NHWC buffer ──ONNX segmenter──▶ NxN mask
//                                                    frame-size mask ◀──resize──┘
//
// The models are the exact TFLite networks extracted from the .task files,
// converted to ONNX with scripts/convert-mediapipe-to-onnx.py and executed
// by onnxruntime-web's WebGPU execution provider on Figment's own
// GPUDevice, so image data never leaves the GPU. The pre/post-processing
// mirrors MediaPipe's task graphs (mediapipe/tasks/cc/vision/*): SSD anchor
// generation and decoding, weighted non-max suppression, detection→ROI
// rects, ImageToTensor letterbox/crop, landmark/world-landmark projection,
// and segmentation mask warping. Input value ranges come from each model's
// embedded TFLite metadata (mean/std), thresholds and ROI parameters from
// the corresponding *_graph.cc files.

import { getAdapter, getDevice, createRenderPipeline, createComputePipeline, drawFullscreen, dispatch, RenderTarget } from './figment';

export const MAX_INSTANCES = 4;

// onnxruntime-web's wasm module is asyncified: while one session.run() is
// suspended, no other call (run, create, release) may enter the module — a
// second run throws "Session already started", a create hangs. Every ORT
// call in Figment's own nodes goes through this gate; project custom nodes
// that talk to ORT directly should use `figment.withOrt` as well.
let ortQueue = Promise.resolve();
export function withOrt(fn) {
  const call = ortQueue.then(fn);
  ortQueue = settled(call);
  return call;
}

// Resolves when `promise` has settled, whatever its outcome.
function settled(promise) {
  return promise ? promise.catch(() => {}) : Promise.resolve();
}

// Fetch the model outside the gate (plain I/O that other nodes need not wait
// for) and build the session inside it.
export async function createOrtSession(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch model ${url}: ${response.status} ${response.statusText}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return withOrt(() => window.ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'] }));
}

// Point onnxruntime-web at Figment's device. A different device (after a
// device loss) makes ORT rebind its WebGPU backend on the next session
// creation, so assign only when it actually changed.
function bindOrtDevice(ort, device) {
  if (ort.env.webgpu.device === device) return;
  ort.env.webgpu.powerPreference = 'high-performance';
  ort.env.webgpu.adapter = getAdapter();
  ort.env.webgpu.device = device;
}

// The conversion script renames each model's outputs to semantic names
// (scripts/convert-mediapipe-to-onnx.py) so the runtime never has to guess
// which Identity_N tensor is which; just verify they are present.
function requireOutputs(modelName, session, names) {
  for (const name of names) {
    if (!session.outputNames.includes(name)) {
      throw new Error(
        `${modelName} model is missing output "${name}" (has: ${session.outputNames.join(', ')}). ` +
          'Regenerate the models with scripts/convert-mediapipe-to-onnx.py --all.',
      );
    }
  }
}

const NMS_IOU_THRESHOLD = 0.3; // min_suppression_threshold in all three detector graphs
const TRACKING_OVERLAP_THRESHOLD = 0.5; // AssociationNormRect min_similarity_threshold

// ─── SSD anchors (SsdAnchorsCalculator) ─────────────────────────────────────
//
// All three detectors use aspect_ratios [1.0], interpolated_scale_aspect_ratio
// 1.0 and fixed_anchor_size, so every anchor has w = h = 1, the configured
// scales cancel out, and an anchor is fully described by its center. Layers
// sharing a stride collapse into one feature-map loop with 2 anchors per
// layer per cell.

export function generateSsdAnchors({ inputSize, strides }) {
  const numLayers = strides.length;
  const anchors = [];

  let layerId = 0;
  while (layerId < numLayers) {
    let anchorCount = 0;
    let lastSameStride = layerId;
    while (lastSameStride < numLayers && strides[lastSameStride] === strides[layerId]) {
      anchorCount += 2; // aspect 1.0 + interpolated scale anchor
      lastSameStride++;
    }
    const featureMapSize = Math.ceil(inputSize / strides[layerId]);
    for (let y = 0; y < featureMapSize; y++) {
      for (let x = 0; x < featureMapSize; x++) {
        for (let a = 0; a < anchorCount; a++) {
          anchors.push((x + 0.5) / featureMapSize, (y + 0.5) / featureMapSize);
        }
      }
    }
    layerId = lastSameStride;
  }
  return new Float32Array(anchors);
}

// ─── Geometry helpers ───────────────────────────────────────────────────────

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

export function normalizeRadians(angle) {
  return angle - 2 * Math.PI * Math.floor((angle + Math.PI) / (2 * Math.PI));
}

function rotationFromPoints(p0, p1, targetAngle, frameWidth, frameHeight) {
  const dx = (p1.x - p0.x) * frameWidth;
  const dy = (p1.y - p0.y) * frameHeight;
  return normalizeRadians(targetAngle - Math.atan2(-dy, dx));
}

// AlignmentPointsRectsCalculator: square rect centered on `center`, sized by
// twice the distance to `alignment` (used by the pose graphs).
export function roiFromAlignmentPoints(center, alignment, frameWidth, frameHeight, scale, targetAngle = Math.PI / 2) {
  const cx = center.x * frameWidth;
  const cy = center.y * frameHeight;
  const dx = (alignment.x - center.x) * frameWidth;
  const dy = (alignment.y - center.y) * frameHeight;
  const boxSize = Math.hypot(dx, dy) * 2;
  const rotation = normalizeRadians(targetAngle - Math.atan2(-dy, dx));
  return { cx, cy, size: boxSize * scale, rotation };
}

// DetectionsToRectsCalculator + RectTransformationCalculator: rect from the
// detection bounding box, rotated by two keypoints, shifted along the rotated
// axes, scaled, and squared to the long side (hands and face).
export function roiFromDetectionBox(det, frameWidth, frameHeight, { rotStartKp, rotEndKp, targetAngle, scale, shiftY = 0 }) {
  const [x0, y0, x1, y1] = det.box;
  let w = (x1 - x0) * frameWidth;
  let h = (y1 - y0) * frameHeight;
  let cx = ((x0 + x1) / 2) * frameWidth;
  let cy = ((y0 + y1) / 2) * frameHeight;
  const rotation = rotationFromPoints(det.keypoints[rotStartKp], det.keypoints[rotEndKp], targetAngle, frameWidth, frameHeight);
  if (shiftY !== 0) {
    cx += -Math.sin(rotation) * shiftY * h;
    cy += Math.cos(rotation) * shiftY * h;
  }
  w *= scale;
  h *= scale;
  const size = Math.max(w, h); // square_long
  return { cx, cy, size, rotation };
}

// How much two ROIs cover the same subject: their intersection over the
// smaller of the two, ignoring rotation. MediaPipe associates rects by IoU,
// but the two ROI estimates for one person — the detector's keypoints and
// the landmark model's auxiliary points — differ most in size, on close-ups
// and bodies partly out of frame, and two concentric squares at a 2:1 size
// ratio have an IoU of only 0.25. Nested boxes score 1 here.
export function roiOverlap(a, b) {
  const ax0 = a.cx - a.size / 2;
  const ay0 = a.cy - a.size / 2;
  const bx0 = b.cx - b.size / 2;
  const by0 = b.cy - b.size / 2;
  const w = Math.min(ax0 + a.size, bx0 + b.size) - Math.max(ax0, bx0);
  const h = Math.min(ay0 + a.size, by0 + b.size) - Math.max(ay0, by0);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.size * a.size, b.size * b.size);
}

// ─── Detection decoding (TensorsToDetectionsCalculator + weighted NMS) ──────
//
// Returns up to maxResults detections sorted by score, each with a bounding
// box and keypoints in frame-normalized coordinates (letterbox removed).

export function decodeDetections(rawBoxes, rawScores, opts) {
  const { anchors, inputSize, numCoords, numKeypoints, scoreThreshold, maxResults, contentScale } = opts;
  const numAnchors = rawScores.length;
  const candidates = [];
  // Compare raw logits against the threshold's logit so the sigmoid only
  // runs for the handful of anchors that pass (~2000 skipped per frame).
  const logitThreshold = Math.log(scoreThreshold / (1 - scoreThreshold));
  for (let i = 0; i < numAnchors; i++) {
    if (rawScores[i] < logitThreshold) continue;
    const score = sigmoid(Math.max(-100, Math.min(100, rawScores[i])));
    const o = i * numCoords;
    const ax = anchors[i * 2];
    const ay = anchors[i * 2 + 1];
    const cx = rawBoxes[o] / inputSize + ax;
    const cy = rawBoxes[o + 1] / inputSize + ay;
    const w = rawBoxes[o + 2] / inputSize;
    const h = rawBoxes[o + 3] / inputSize;
    const values = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    for (let k = 0; k < numKeypoints; k++) {
      values.push(rawBoxes[o + 4 + k * 2] / inputSize + ax, rawBoxes[o + 5 + k * 2] / inputSize + ay);
    }
    candidates.push({ score, values });
  }
  candidates.sort((a, b) => b.score - a.score);

  // Weighted NMS: blend all candidates overlapping the current best,
  // weighted by score, then continue with the non-overlapping remainder.
  const [sx, sy] = contentScale;
  const unpadX = (x) => (x - (1 - sx) / 2) / sx;
  const unpadY = (y) => (y - (1 - sy) / 2) / sy;
  const detections = [];
  let remaining = candidates;
  while (remaining.length > 0 && detections.length < maxResults) {
    const best = remaining[0];
    // `best` seeds its own cluster, so every iteration consumes at least one
    // candidate and totalWeight > 0, even for a zero-area box (IoU 0 with itself).
    const overlapping = [best];
    const rest = [];
    for (const c of remaining) {
      if (c === best) continue;
      if (boxIou(best.values, c.values) >= NMS_IOU_THRESHOLD) overlapping.push(c);
      else rest.push(c);
    }
    const blended = new Float64Array(best.values.length);
    let totalWeight = 0;
    for (const c of overlapping) {
      for (let k = 0; k < blended.length; k++) blended[k] += c.values[k] * c.score;
      totalWeight += c.score;
    }
    for (let k = 0; k < blended.length; k++) blended[k] /= totalWeight;

    const keypoints = [];
    for (let k = 0; k < numKeypoints; k++) {
      keypoints.push({ x: unpadX(blended[4 + k * 2]), y: unpadY(blended[5 + k * 2]) });
    }
    detections.push({
      score: best.score,
      box: [unpadX(blended[0]), unpadY(blended[1]), unpadX(blended[2]), unpadY(blended[3])],
      keypoints,
    });
    remaining = rest;
  }
  return detections;
}

function boxIou(a, b) {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[2], b[2]);
  const y1 = Math.min(a[3], b[3]);
  if (x1 <= x0 || y1 <= y0) return 0;
  const inter = (x1 - x0) * (y1 - y0);
  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / (areaA + areaB - inter);
}

// ─── WGSL ───────────────────────────────────────────────────────────────────

// Letterbox the frame into a square target, preserving aspect ratio
// (ImageToTensorCalculator with keep_aspect_ratio, BORDER_ZERO).
const LETTERBOX_WGSL = `
struct Uniforms {
  u_content_scale: vec2f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;

@fragment fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let src_uv = (in.uv - 0.5) / u.u_content_scale + 0.5;
  let color = textureSample(u_source, defaultSampler, clamp(src_uv, vec2f(0.0), vec2f(1.0)));
  let inside = all(src_uv >= vec2f(0.0)) && all(src_uv <= vec2f(1.0));
  return select(vec4f(0.0, 0.0, 0.0, 1.0), color, inside);
}
`;

// Sample a rotated square ROI (frame pixels) into the landmark input target.
const CROP_WGSL = `
struct Uniforms {
  u_center: vec2f,
  u_frame_size: vec2f,
  u_rot: vec2f, // cos, sin
  u_size: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;

@fragment fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let d = (in.uv - 0.5) * u.u_size;
  let p = u.u_center + vec2f(d.x * u.u_rot.x - d.y * u.u_rot.y, d.x * u.u_rot.y + d.y * u.u_rot.x);
  let src_uv = p / u.u_frame_size;
  let color = textureSample(u_source, defaultSampler, clamp(src_uv, vec2f(0.0), vec2f(1.0)));
  let inside = all(src_uv >= vec2f(0.0)) && all(src_uv <= vec2f(1.0));
  return select(vec4f(0.0, 0.0, 0.0, 1.0), color, inside);
}
`;

// Pack an rgba8 texture into an NHWC float32 tensor buffer, mapping [0,1]
// through scale/offset (detector models want [-1,1] or [0,1] depending on
// their TFLite metadata; all landmark models want [0,1]).
const PACK_WGSL = `
struct Uniforms {
  u_size: u32,
  u_scale: f32,
  u_offset: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var u_texture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> u_out: array<f32>;

@compute @workgroup_size(16, 16)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.u_size || gid.y >= u.u_size) { return; }
  let c = textureLoad(u_texture, vec2i(gid.xy), 0);
  let idx = (gid.y * u.u_size + gid.x) * 3u;
  u_out[idx] = c.r * u.u_scale + u.u_offset;
  u_out[idx + 1u] = c.g * u.u_scale + u.u_offset;
  u_out[idx + 2u] = c.b * u.u_scale + u.u_offset;
}
`;

// Convert the raw mask logits buffer (ONNX output, ROI space) to a texture,
// applying sigmoid (TensorsToSegmentationCalculator activation).
const MASK_TO_TEXTURE_WGSL = `
struct Uniforms {
  u_size: u32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read_write> u_mask: array<f32>;
@group(0) @binding(2) var u_out: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(16, 16)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.u_size || gid.y >= u.u_size) { return; }
  let logit = u_mask[gid.y * u.u_size + gid.x];
  let v = 1.0 / (1.0 + exp(-logit));
  textureStore(u_out, vec2i(gid.xy), vec4f(v, v, v, 1.0));
}
`;

// Warp up to 4 ROI-space masks back to frame space and union them
// (pixel-wise max), the inverse of the per-instance crops. Each column of
// u_rois holds one ROI as (cx, cy, size, rotation) in frame pixels.
const MASK_WARP_WGSL = `
struct Uniforms {
  u_rois: mat4x4f,
  u_frame_size: vec2f,
  u_count: i32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_mask0: texture_2d<f32>;
@group(0) @binding(3) var u_mask1: texture_2d<f32>;
@group(0) @binding(4) var u_mask2: texture_2d<f32>;
@group(0) @binding(5) var u_mask3: texture_2d<f32>;

fn sample_roi(roi: vec4f, mask: texture_2d<f32>, p: vec2f) -> f32 {
  let c = cos(roi.w);
  let s = sin(roi.w);
  let d = p - roi.xy;
  let local = vec2f(d.x * c + d.y * s, -d.x * s + d.y * c) / roi.z + 0.5;
  let v = textureSample(mask, defaultSampler, clamp(local, vec2f(0.0), vec2f(1.0))).r;
  let inside = all(local >= vec2f(0.0)) && all(local <= vec2f(1.0));
  return select(0.0, v, inside);
}

@fragment fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let p = in.uv * u.u_frame_size;
  var v = sample_roi(u.u_rois[0], u_mask0, p);
  if (u.u_count > 1) { v = max(v, sample_roi(u.u_rois[1], u_mask1, p)); }
  if (u.u_count > 2) { v = max(v, sample_roi(u.u_rois[2], u_mask2, p)); }
  if (u.u_count > 3) { v = max(v, sample_roi(u.u_rois[3], u_mask3, p)); }
  return vec4f(v, v, v, 1.0);
}
`;

// ─── Shared two-stage pipeline ──────────────────────────────────────────────
//
// Subclasses configure the detector (input size/range, anchors, coords) and
// implement _roiFromDetection / _decodeInstance.

class TwoStageGpuPipeline {
  constructor({ maxInstances = 1, confidence = 0.5 } = {}) {
    this.maxInstances = maxInstances;
    this.confidence = confidence;
    this._device = null;
    this._trackedRois = [];
    this._frameWidth = 0;
    this._frameHeight = 0;
    this._initPromise = null;
    this._processing = null;
    this._destroyed = false;
    // Subclasses set: _name, _detectorUrl, _detectSize, _detectRange
    // {scale, offset}, _anchorSpec {inputSize, strides}, _numCoords,
    // _numKeypoints, _landmarkSize, _landmarkOutputNames, _tracks.
  }

  // Clamped here (not just in the constructor) because nodes assign it live
  // when the user drags the count input; pose mask slots are sized to
  // MAX_INSTANCES, so values beyond it must never get through.
  get maxInstances() {
    return this._maxInstances;
  }
  set maxInstances(n) {
    this._maxInstances = Math.max(1, Math.min(MAX_INSTANCES, Math.floor(n)));
  }

  // Video mode keeps ROIs across frames and skips the detector while enough
  // instances are tracked; still mode detects afresh on every frame. Hands
  // yield no next-frame ROI (nextRoi is null), so they detect every frame
  // whatever this flag says.
  get tracking() {
    return this._tracks;
  }
  set tracking(on) {
    this._tracks = Boolean(on);
  }

  // The detector's min_detection_confidence. Nodes update `confidence` live.
  get _detectorScoreThreshold() {
    return this.confidence;
  }

  // A failed init stays failed: the node reports the error on every render,
  // and restarting the node creates a fresh pipeline.
  init() {
    if (!this._initPromise) this._initPromise = this._init();
    return this._initPromise;
  }

  async _init() {
    try {
      await this._allocate();
    } catch (err) {
      this._release();
      throw err;
    }
  }

  async _allocate() {
    const ort = window.ort;
    if (!ort) throw new Error('onnxruntime-web (window.ort) is not available');
    this._device = getDevice();
    bindOrtDevice(ort, this._device);

    this._anchors = generateSsdAnchors(this._anchorSpec);
    this._detectorSession = await createOrtSession(this._detectorUrl);
    this._requireOutputs(this._detectorSession, ['boxes', 'scores']);
    this._landmarkSession = await this._createLandmarkSession(this.model);

    this._detectTarget = new RenderTarget({ label: `${this._name}-detect-input` });
    this._detectTarget.setSize(this._detectSize, this._detectSize);
    this._cropTarget = new RenderTarget({ label: `${this._name}-crop-input` });
    this._cropTarget.setSize(this._landmarkSize, this._landmarkSize);

    this._detectInputBuffer = this._device.createBuffer({
      size: this._detectSize * this._detectSize * 3 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: `${this._name}-detect-tensor`,
    });
    this._landmarkInputBuffer = this._device.createBuffer({
      size: this._landmarkSize * this._landmarkSize * 3 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: `${this._name}-landmark-tensor`,
    });
    this._detectInputTensor = ort.Tensor.fromGpuBuffer(this._detectInputBuffer, {
      dataType: 'float32',
      dims: [1, this._detectSize, this._detectSize, 3],
    });
    this._landmarkInputTensor = ort.Tensor.fromGpuBuffer(this._landmarkInputBuffer, {
      dataType: 'float32',
      dims: [1, this._landmarkSize, this._landmarkSize, 3],
    });

    this._letterboxPipeline = createRenderPipeline({
      wgsl: LETTERBOX_WGSL,
      uniforms: { u_content_scale: 'vec2f' },
      textures: ['u_source'],
      label: `${this._name}-letterbox`,
    });
    this._cropPipeline = createRenderPipeline({
      wgsl: CROP_WGSL,
      uniforms: { u_center: 'vec2f', u_frame_size: 'vec2f', u_rot: 'vec2f', u_size: 'f32' },
      textures: ['u_source'],
      label: `${this._name}-crop`,
    });
    this._packPipeline = createComputePipeline({
      wgsl: PACK_WGSL,
      uniforms: { u_size: 'u32', u_scale: 'f32', u_offset: 'f32' },
      textures: ['u_texture'],
      storage: [{ name: 'u_out', type: 'buffer' }],
      label: `${this._name}-pack`,
    });

    await this._initExtras();
  }

  // Subclass hooks (with defaults).
  async _initExtras() {}
  _landmarkFetches() {
    const fetches = {};
    for (const name of this._landmarkOutputNames) fetches[name] = null;
    return fetches;
  }
  _finalize(_results, _rois) {}

  async _createLandmarkSession(model) {
    const session = await createOrtSession(this._landmarkUrl(model));
    try {
      this._requireOutputs(session, this._landmarkOutputNames);
    } catch (err) {
      void withOrt(() => session.release());
      throw err;
    }
    return session;
  }

  _requireOutputs(session, names) {
    requireOutputs(this._name, session, names);
  }

  process(source) {
    this._processing = this._process(source).finally(() => {
      this._processing = null;
    });
    return this._processing;
  }

  async _process(source) {
    if (this._destroyed) return [];
    await this.init();
    if (this._destroyed) return [];
    const width = source.width;
    const height = source.height;
    if (width !== this._frameWidth || height !== this._frameHeight) {
      this._frameWidth = width;
      this._frameHeight = height;
      this._trackedRois = [];
      this._onResize(width, height);
    }

    // Reuse tracked ROIs; top up from the detector when instances are
    // missing (mirrors MediaPipe's VIDEO-mode ROI tracking + association).
    let rois = this._tracks ? this._trackedRois.slice(0, this.maxInstances) : [];
    const hadTracks = rois.length > 0;
    if (rois.length < this.maxInstances) {
      rois = this._mergeDetections(rois, await this._detect(source));
      if (this._destroyed) return [];
    }

    let { results, resultRois, nextRois } = await this._runInstances(source, rois);
    if (this._destroyed) return [];

    // Tracking can go stale on a scene cut: fall back to a fresh detection
    // in the same frame instead of reporting a spurious miss.
    if (results.length === 0 && hadTracks) {
      this._trackedRois = [];
      const freshRois = this._mergeDetections([], await this._detect(source));
      if (this._destroyed) return [];
      ({ results, resultRois, nextRois } = await this._runInstances(source, freshRois));
      if (this._destroyed) return [];
    }

    this._trackedRois = this._tracks ? nextRois : [];
    this._finalize(results, resultRois);
    // Wait for the queued GPU work (mask warp etc.) to drain before letting
    // the caller submit the next frame — without this the queue can grow
    // unboundedly and starve the compositor (see onnxImageModel.js).
    await this._device.queue.onSubmittedWorkDone();
    return results;
  }

  _onResize(_width, _height) {}

  _mergeDetections(rois, detections) {
    const merged = rois.slice();
    for (const det of detections) {
      if (merged.length >= this.maxInstances) break;
      const roi = this._roiFromDetection(det);
      if (!merged.some((r) => roiOverlap(r, roi) > TRACKING_OVERLAP_THRESHOLD)) merged.push(roi);
    }
    return merged;
  }

  async _runInstances(source, rois) {
    const results = [];
    const resultRois = [];
    const nextRois = [];
    for (const roi of rois) {
      if (this._destroyed) break;
      const decoded = await this._runInstance(source, roi, results.length);
      if (!decoded) continue;
      results.push(decoded.result);
      resultRois.push(roi);
      if (decoded.nextRoi) nextRois.push(decoded.nextRoi);
    }
    return { results, resultRois, nextRois };
  }

  async _detect(source) {
    performance.mark(`${this._name}-detect-start`);
    const width = this._frameWidth;
    const height = this._frameHeight;
    const fit = Math.min(this._detectSize / width, this._detectSize / height);
    const contentScale = [(width * fit) / this._detectSize, (height * fit) / this._detectSize];

    drawFullscreen(this._letterboxPipeline, { u_content_scale: contentScale }, { u_source: source }, this._detectTarget);
    dispatch(
      this._packPipeline,
      { u_size: this._detectSize, u_scale: this._detectRange.scale, u_offset: this._detectRange.offset },
      { u_texture: this._detectTarget, u_out: this._detectInputBuffer },
      [Math.ceil(this._detectSize / 16), Math.ceil(this._detectSize / 16), 1],
    );

    const feeds = { [this._detectorSession.inputNames[0]]: this._detectInputTensor };
    const outputs = await withOrt(() => this._detectorSession.run(feeds));
    const detections = decodeDetections(outputs['boxes'].data, outputs['scores'].data, {
      anchors: this._anchors,
      inputSize: this._detectSize,
      numCoords: this._numCoords,
      numKeypoints: this._numKeypoints,
      scoreThreshold: this._detectorScoreThreshold,
      maxResults: this.maxInstances,
      contentScale,
    });
    performance.mark(`${this._name}-detect-end`);
    try {
      performance.measure(`mediapipe-gpu:${this._name}:detect`, `${this._name}-detect-start`, `${this._name}-detect-end`);
    } catch (_) {}
    return detections;
  }

  _roiUniforms(roi) {
    return {
      u_center: [roi.cx, roi.cy],
      u_frame_size: [this._frameWidth, this._frameHeight],
      u_rot: [Math.cos(roi.rotation), Math.sin(roi.rotation)],
      u_size: roi.size,
    };
  }

  async _runInstance(source, roi, slot) {
    performance.mark(`${this._name}-landmarks-start`);
    drawFullscreen(this._cropPipeline, this._roiUniforms(roi), { u_source: source }, this._cropTarget);
    dispatch(
      this._packPipeline,
      { u_size: this._landmarkSize, u_scale: 1.0, u_offset: 0.0 },
      { u_texture: this._cropTarget, u_out: this._landmarkInputBuffer },
      [Math.ceil(this._landmarkSize / 16), Math.ceil(this._landmarkSize / 16), 1],
    );
    const feeds = { [this._landmarkSession.inputNames[0]]: this._landmarkInputTensor };
    const outputs = await withOrt(() => this._landmarkSession.run(feeds, this._landmarkFetches()));
    const decoded = this._decodeInstance(outputs, roi, slot);
    performance.mark(`${this._name}-landmarks-end`);
    try {
      performance.measure(`mediapipe-gpu:${this._name}:landmarks`, `${this._name}-landmarks-start`, `${this._name}-landmarks-end`);
    } catch (_) {}
    return decoded;
  }

  // LandmarkProjectionCalculator: ROI space → frame-normalized coordinates.
  // zDivisor: extra z normalization applied by TensorsToLandmarksCalculator
  // (hands use normalize_z 0.4; pose and face use 1).
  _projectLandmarks(raw, count, stride, roi, { zDivisor = 1, withVisibility = false } = {}) {
    const width = this._frameWidth;
    const height = this._frameHeight;
    const cos = Math.cos(roi.rotation);
    const sin = Math.sin(roi.rotation);
    const out = [];
    for (let i = 0; i < count; i++) {
      const o = i * stride;
      const nx = raw[o] / this._landmarkSize - 0.5;
      const ny = raw[o + 1] / this._landmarkSize - 0.5;
      const px = roi.cx + (nx * cos - ny * sin) * roi.size;
      const py = roi.cy + (nx * sin + ny * cos) * roi.size;
      const lm = {
        x: px / width,
        y: py / height,
        z: (raw[o + 2] / this._landmarkSize / zDivisor) * (roi.size / width),
      };
      if (withVisibility) {
        lm.visibility = sigmoid(raw[o + 3]);
        lm.presence = sigmoid(raw[o + 4]);
      }
      out.push(lm);
    }
    return out;
  }

  // WorldLandmarkProjectionCalculator: world landmarks are in meters but
  // oriented to the ROI; rotate x/y back to frame orientation.
  _projectWorldLandmarks(raw, count, roi) {
    const cos = Math.cos(roi.rotation);
    const sin = Math.sin(roi.rotation);
    const out = [];
    for (let i = 0; i < count; i++) {
      const wx = raw[i * 3];
      const wy = raw[i * 3 + 1];
      out.push({ x: wx * cos - wy * sin, y: wx * sin + wy * cos, z: raw[i * 3 + 2] });
    }
    return out;
  }

  // Drop the tracked ROIs so the next frame starts from a fresh detection.
  resetTracking() {
    this._trackedRois = [];
  }

  destroy() {
    this._destroyed = true;
    this._trackedRois = [];
    // Never free resources under a pending init or an in-flight frame.
    void settled(this._initPromise)
      .then(() => settled(this._processing))
      .then(() => this._release());
  }

  _release() {
    for (const session of [this._detectorSession, this._landmarkSession]) {
      if (session) void withOrt(() => session.release());
    }
    this._detectorSession = null;
    this._landmarkSession = null;
    this._detectTarget?.destroy();
    this._cropTarget?.destroy();
    this._detectInputBuffer?.destroy();
    this._landmarkInputBuffer?.destroy();
    this._detectTarget = null;
    this._cropTarget = null;
    this._detectInputBuffer = null;
    this._landmarkInputBuffer = null;
    this._destroyExtras();
  }

  _destroyExtras() {}
}

// ─── Pose ───────────────────────────────────────────────────────────────────
//
// pose_detector: 224×224, range [-1,1], 2254 anchors (strides 8,16,32,32,32),
// 12 coords (box + 4 keypoints). pose_landmarks_{lite,full,heavy}: 256×256,
// range [0,1], 39×5 landmarks (33 public + 2 aux + 4 unused), presence score
// (already a probability), 256×256 mask logits, 64×64×39 heatmap (unused),
// 39×3 world landmarks. ROI: alignment points (hip center → full-body point),
// target 90°, scale 1.25. Tracking via aux landmarks 33/34.

const POSE_LANDMARK_COUNT = 39;
const POSE_PUBLIC_LANDMARKS = 33;
const POSE_PRESENCE_THRESHOLD = 0.5;
const POSE_ROI_SCALE = 1.25;

export class PoseGpuPipeline extends TwoStageGpuPipeline {
  constructor({ model = 'lite', maxInstances = 1, withMask = false } = {}) {
    super({ maxInstances }); // pose keeps the default detector confidence (0.5)
    this.model = model;
    this._withMask = withMask;
    this._name = 'pose';
    this._detectorUrl = './mediapipe/onnx/pose_detector.onnx';
    this._detectSize = 224;
    this._detectRange = { scale: 2.0, offset: -1.0 };
    this._anchorSpec = { inputSize: 224, strides: [8, 16, 32, 32, 32] };
    this._numCoords = 12;
    this._numKeypoints = 4;
    this._landmarkSize = 256;
    this._landmarkOutputNames = withMask ? ['landmarks', 'score', 'mask', 'world_landmarks'] : ['landmarks', 'score', 'world_landmarks'];
    this._tracks = true;
    this.maskTarget = null;
  }

  _landmarkUrl(model) {
    return `./mediapipe/onnx/pose_landmarks_${model}.onnx`;
  }

  async _initExtras() {
    if (!this._withMask) return;
    const ort = window.ort;
    this.maskTarget = new RenderTarget({ label: 'pose-mask' });
    this._maskBuffer = this._device.createBuffer({
      size: this._landmarkSize * this._landmarkSize * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      label: 'pose-mask-tensor',
    });
    this._maskTensor = ort.Tensor.fromGpuBuffer(this._maskBuffer, {
      dataType: 'float32',
      dims: [1, this._landmarkSize, this._landmarkSize, 1],
    });
    this._maskRoiTextures = [];
    for (let i = 0; i < MAX_INSTANCES; i++) {
      this._maskRoiTextures.push(
        this._device.createTexture({
          size: [this._landmarkSize, this._landmarkSize],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
          label: `pose-mask-roi-${i}`,
        }),
      );
    }
    this._maskToTexturePipeline = createComputePipeline({
      wgsl: MASK_TO_TEXTURE_WGSL,
      uniforms: { u_size: 'u32' },
      storage: [
        { name: 'u_mask', type: 'buffer' },
        { name: 'u_out', type: 'texture_storage_2d' },
      ],
      label: 'pose-mask-to-texture',
    });
    this._maskWarpPipeline = createRenderPipeline({
      wgsl: MASK_WARP_WGSL,
      uniforms: { u_rois: 'mat4x4f', u_frame_size: 'vec2f', u_count: 'i32' },
      textures: ['u_mask0', 'u_mask1', 'u_mask2', 'u_mask3'],
      label: 'pose-mask-warp',
    });
  }

  _onResize(width, height) {
    if (this.maskTarget) this.maskTarget.setSize(width, height);
  }

  _landmarkFetches() {
    // The heatmap output is never fetched; the mask stays on the GPU via a
    // preallocated GPU-buffer tensor (and is not computed for Detect Pose).
    const fetches = { landmarks: null, score: null, world_landmarks: null };
    if (this._withMask) fetches.mask = this._maskTensor;
    return fetches;
  }

  // Model changes apply one at a time, in call order, so `this.model` always
  // names the installed session.
  setModel(model) {
    this._modelChange = settled(this._modelChange).then(() => this._setModel(model));
    return this._modelChange;
  }

  async _setModel(model) {
    if (model === this.model) return;
    await this.init();
    const session = await this._createLandmarkSession(model);
    // Wait for any in-flight frame (including ones started while the new
    // session was loading): a frame reads this._landmarkSession at several
    // points and must see the same session throughout.
    while (this._processing) await settled(this._processing);
    if (this._destroyed) {
      void withOrt(() => session.release());
      return;
    }
    const old = this._landmarkSession;
    this._landmarkSession = session;
    this.model = model;
    this._trackedRois = [];
    if (old) void withOrt(() => old.release());
  }

  _roiFromDetection(det) {
    // Keypoint 0: mid-hip center; keypoint 1: full-body alignment point.
    return roiFromAlignmentPoints(det.keypoints[0], det.keypoints[1], this._frameWidth, this._frameHeight, POSE_ROI_SCALE);
  }

  _decodeInstance(outputs, roi, slot) {
    // The pose presence output is already a probability (no sigmoid in the
    // graph, unlike face).
    const score = outputs['score'].data[0];
    if (score < POSE_PRESENCE_THRESHOLD) return null;

    const rawLandmarks = outputs['landmarks'].data;
    // Project the 33 public + 2 auxiliary tracking landmarks (the model's
    // remaining 4 landmarks are unused).
    const projected = this._projectLandmarks(rawLandmarks, POSE_PUBLIC_LANDMARKS + 2, 5, roi, { withVisibility: true });
    const landmarks = projected.slice(0, POSE_PUBLIC_LANDMARKS);
    const worldLandmarks = this._projectWorldLandmarks(outputs['world_landmarks'].data, POSE_PUBLIC_LANDMARKS, roi);

    if (this._withMask) {
      // The mask logits for this instance are in _maskBuffer right now (the
      // next instance's run overwrites it) — bake them into this slot's
      // ROI-space texture; _finalize warps and unions all slots.
      dispatch(
        this._maskToTexturePipeline,
        { u_size: this._landmarkSize },
        { u_mask: this._maskBuffer, u_out: this._maskRoiTextures[slot] },
        [Math.ceil(this._landmarkSize / 16), Math.ceil(this._landmarkSize / 16), 1],
      );
    }

    // Track: derive the next frame's ROI from the auxiliary landmarks,
    // skipping the detector entirely while the pose holds.
    const nextRoi = roiFromAlignmentPoints(
      projected[POSE_PUBLIC_LANDMARKS],
      projected[POSE_PUBLIC_LANDMARKS + 1],
      this._frameWidth,
      this._frameHeight,
      POSE_ROI_SCALE,
    );
    return { result: { score, landmarks, worldLandmarks }, nextRoi };
  }

  _finalize(results, rois) {
    if (!this._withMask || results.length === 0) return;
    const roisFlat = new Array(16).fill(0);
    for (let i = 0; i < Math.min(rois.length, MAX_INSTANCES); i++) {
      roisFlat[i * 4] = rois[i].cx;
      roisFlat[i * 4 + 1] = rois[i].cy;
      roisFlat[i * 4 + 2] = rois[i].size;
      roisFlat[i * 4 + 3] = rois[i].rotation;
    }
    drawFullscreen(
      this._maskWarpPipeline,
      { u_rois: roisFlat, u_frame_size: [this._frameWidth, this._frameHeight], u_count: results.length },
      {
        u_mask0: this._maskRoiTextures[0],
        u_mask1: this._maskRoiTextures[1],
        u_mask2: this._maskRoiTextures[2],
        u_mask3: this._maskRoiTextures[3],
      },
      this.maskTarget,
    );
  }

  _destroyExtras() {
    this.maskTarget?.destroy();
    this._maskBuffer?.destroy();
    if (this._maskRoiTextures) for (const t of this._maskRoiTextures) t.destroy();
    this.maskTarget = null;
    this._maskBuffer = null;
    this._maskRoiTextures = null;
  }
}

// ─── Hands ──────────────────────────────────────────────────────────────────
//
// hand_detector (palm detection): 192×192, range [0,1], 2016 anchors
// (strides 8,16,16,16), 18 coords (box + 7 keypoints). ROI: detection box
// rotated by wrist (kp 0) → middle-finger MCP (kp 2) to 90°, scale 2.6,
// shift_y −0.5, square_long. hand_landmarks_detector: 224×224, range [0,1],
// outputs in graph order: 21×3 landmarks, presence, handedness (binary
// classification, labels 0=Right / 1=Left), 21×3 world landmarks. Landmark z
// is additionally normalized by 0.4. No ROI tracking (MediaPipe's
// hand-landmarks→ROI calculator is custom): the detector runs every frame.

const HAND_LANDMARK_COUNT = 21;
const HAND_Z_NORMALIZE = 0.4;

export class HandGpuPipeline extends TwoStageGpuPipeline {
  constructor({ maxInstances = 2, confidence = 0.5 } = {}) {
    super({ maxInstances, confidence });
    this._name = 'hand';
    this._detectorUrl = './mediapipe/onnx/hand_detector.onnx';
    this._detectSize = 192;
    this._detectRange = { scale: 1.0, offset: 0.0 };
    this._anchorSpec = { inputSize: 192, strides: [8, 16, 16, 16] };
    this._numCoords = 18;
    this._numKeypoints = 7;
    this._landmarkSize = 224;
    this._landmarkOutputNames = ['landmarks', 'score', 'handedness', 'world_landmarks'];
    this._tracks = false;
  }

  _landmarkUrl() {
    return './mediapipe/onnx/hand_landmarks_detector.onnx';
  }

  _roiFromDetection(det) {
    return roiFromDetectionBox(det, this._frameWidth, this._frameHeight, {
      rotStartKp: 0, // wrist center
      rotEndKp: 2, // middle finger MCP
      targetAngle: Math.PI / 2,
      scale: 2.6,
      shiftY: -0.5,
    });
  }

  _decodeInstance(outputs, roi) {
    const presence = outputs['score'].data[0];
    if (presence < this.confidence) return null;

    const landmarks = this._projectLandmarks(outputs['landmarks'].data, HAND_LANDMARK_COUNT, 3, roi, {
      zDivisor: HAND_Z_NORMALIZE,
    });
    const worldLandmarks = this._projectWorldLandmarks(outputs['world_landmarks'].data, HAND_LANDMARK_COUNT, roi);

    // TensorsToClassificationCalculator with binary_classification: index 0
    // scores the raw value, index 1 scores 1 - raw. The label map is hardcoded
    // in hand_landmarks_detector_graph.cc as {0: Right, 1: Left} (the model's
    // handedness.txt is not consulted), so raw is the probability of "Right".
    const p = outputs['handedness'].data[0];
    const right = p >= 0.5;
    const handedness = [
      {
        index: right ? 0 : 1,
        score: right ? p : 1 - p,
        categoryName: right ? 'Right' : 'Left',
        displayName: right ? 'Right' : 'Left',
      },
    ];

    return { result: { score: presence, landmarks, worldLandmarks, handedness }, nextRoi: null };
  }
}

// ─── Face ───────────────────────────────────────────────────────────────────
//
// face_detector (BlazeFace short-range): 128×128, range [-1,1], 896 anchors
// (strides 8,16,16,16), 16 coords (box + 6 keypoints). ROI: detection box
// rotated by right eye (kp 0) → left eye (kp 1) to 0°, scale 1.5,
// square_long. face_landmarks_detector: 256×256, range [0,1], outputs 478×3
// landmarks and a presence score that DOES need a sigmoid
// (face_landmarks_detector_graph.cc). Tracking via the landmark bounding box
// rotated by landmarks 33 → 263.

const FACE_LANDMARK_COUNT = 478;

// Shared by detection→ROI and landmarks→ROI so the two never drift apart:
// rotation from the eye keypoints to 0°, scale 1.5, square_long.
const FACE_ROI_OPTIONS = { rotStartKp: 0, rotEndKp: 1, targetAngle: 0, scale: 1.5 };

export class FaceGpuPipeline extends TwoStageGpuPipeline {
  constructor({ maxInstances = 1, confidence = 0.5 } = {}) {
    super({ maxInstances, confidence });
    this._name = 'face';
    this._detectorUrl = './mediapipe/onnx/face_detector.onnx';
    this._detectSize = 128;
    this._detectRange = { scale: 2.0, offset: -1.0 };
    this._anchorSpec = { inputSize: 128, strides: [8, 16, 16, 16] };
    this._numCoords = 16;
    this._numKeypoints = 6;
    this._landmarkSize = 256;
    // The model's third output ('aux') is unused and never fetched.
    this._landmarkOutputNames = ['landmarks', 'score'];
    this._tracks = true;
  }

  _landmarkUrl() {
    return './mediapipe/onnx/face_landmarks_detector.onnx';
  }

  _roiFromDetection(det) {
    // Keypoint 0: right eye; keypoint 1: left eye.
    return roiFromDetectionBox(det, this._frameWidth, this._frameHeight, FACE_ROI_OPTIONS);
  }

  _decodeInstance(outputs, roi) {
    // Unlike pose and hands, the face presence output needs a sigmoid
    // (face_landmarks_detector_graph.cc).
    const score = sigmoid(outputs['score'].data[0]);
    if (score < this.confidence) return null;

    const landmarks = this._projectLandmarks(outputs['landmarks'].data, FACE_LANDMARK_COUNT, 3, roi);

    // Next-frame ROI: bounding box of the landmarks, rotated by the
    // left-eye (33) → right-eye (263) vector to 0°, scale 1.5, square_long.
    const nextRoi = this._roiFromLandmarks(landmarks);
    return { result: { score, landmarks }, nextRoi };
  }

  _roiFromLandmarks(landmarks) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const lm of landmarks) {
      minX = Math.min(minX, lm.x);
      minY = Math.min(minY, lm.y);
      maxX = Math.max(maxX, lm.x);
      maxY = Math.max(maxY, lm.y);
    }
    const det = { box: [minX, minY, maxX, maxY], keypoints: [landmarks[33], landmarks[263]] };
    return roiFromDetectionBox(det, this._frameWidth, this._frameHeight, FACE_ROI_OPTIONS);
  }
}

// ─── Selfie segmentation ────────────────────────────────────────────────────
//
// selfie_segmenter: 256×256, range [0,1]; one output, a 256×256×1 person
// probability — the network ends in a LOGISTIC, and its SEGMENTER_METADATA
// activation is NONE, so no activation is applied here. The image
// segmenter graph (image_segmenter_graph.cc) resizes the frame to the model
// input without keeping the aspect ratio (ImagePreprocessingGraph's
// default) and resizes the mask back to the frame size, so the pipeline is
// a single stage with no detector, ROI or tracking.

const SEGMENT_INPUT_SIZE = 256;

// Plain resample, used both to shrink the frame to the model input and to
// grow the mask back to the frame.
const RESIZE_WGSL = `
struct Uniforms {
  _pad: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_source: texture_2d<f32>;

@fragment fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  return textureSample(u_source, defaultSampler, in.uv);
}
`;

// Convert the probability buffer (ONNX output) to a texture. In category
// mode the probability is thresholded at 0.5, as TensorsToSegmentationCalculator
// does for a single-channel model.
const PROBABILITY_TO_TEXTURE_WGSL = `
struct Uniforms {
  u_size: u32,
  u_binary: u32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read_write> u_mask: array<f32>;
@group(0) @binding(2) var u_out: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(16, 16)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.u_size || gid.y >= u.u_size) { return; }
  let p = u_mask[gid.y * u.u_size + gid.x];
  let v = select(p, step(0.5, p), u.u_binary != 0u);
  textureStore(u_out, vec2i(gid.xy), vec4f(v, v, v, 1.0));
}
`;

export class SegmentGpuPipeline {
  // binary: category mask (probability > 0.5) rather than the confidence
  // mask. Nodes assign it live.
  constructor({ binary = true } = {}) {
    this.binary = binary;
    this.maskTarget = null;
    this._name = 'segment';
    this._modelUrl = './mediapipe/onnx/selfie_segmenter.onnx';
    this._inputSize = SEGMENT_INPUT_SIZE;
    this._device = null;
    this._frameWidth = 0;
    this._frameHeight = 0;
    this._initPromise = null;
    this._processing = null;
    this._destroyed = false;
  }

  // A failed init stays failed, as for the two-stage pipelines.
  init() {
    if (!this._initPromise) this._initPromise = this._init();
    return this._initPromise;
  }

  async _init() {
    try {
      await this._allocate();
    } catch (err) {
      this._release();
      throw err;
    }
  }

  async _allocate() {
    const ort = window.ort;
    if (!ort) throw new Error('onnxruntime-web (window.ort) is not available');
    this._device = getDevice();
    bindOrtDevice(ort, this._device);

    this._session = await createOrtSession(this._modelUrl);
    requireOutputs(this._name, this._session, ['mask']);

    const size = this._inputSize;
    this._inputTarget = new RenderTarget({ label: 'segment-input' });
    this._inputTarget.setSize(size, size);
    this._inputBuffer = this._device.createBuffer({
      size: size * size * 3 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'segment-input-tensor',
    });
    this._inputTensor = ort.Tensor.fromGpuBuffer(this._inputBuffer, { dataType: 'float32', dims: [1, size, size, 3] });
    this._maskBuffer = this._device.createBuffer({
      size: size * size * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      label: 'segment-mask-tensor',
    });
    this._maskTensor = ort.Tensor.fromGpuBuffer(this._maskBuffer, { dataType: 'float32', dims: [1, size, size, 1] });
    this._maskTexture = this._device.createTexture({
      size: [size, size],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      label: 'segment-mask',
    });
    this.maskTarget = new RenderTarget({ label: 'segment-mask-frame' });

    this._resizePipeline = createRenderPipeline({ wgsl: RESIZE_WGSL, textures: ['u_source'], label: 'segment-resize' });
    this._packPipeline = createComputePipeline({
      wgsl: PACK_WGSL,
      uniforms: { u_size: 'u32', u_scale: 'f32', u_offset: 'f32' },
      textures: ['u_texture'],
      storage: [{ name: 'u_out', type: 'buffer' }],
      label: 'segment-pack',
    });
    this._maskToTexturePipeline = createComputePipeline({
      wgsl: PROBABILITY_TO_TEXTURE_WGSL,
      uniforms: { u_size: 'u32', u_binary: 'u32' },
      storage: [
        { name: 'u_mask', type: 'buffer' },
        { name: 'u_out', type: 'texture_storage_2d' },
      ],
      label: 'segment-mask-to-texture',
    });
  }

  // Segments `source` and resolves with the frame-size mask target (person
  // probability, or 0/1 when binary), or null once destroyed.
  process(source) {
    this._processing = this._process(source).finally(() => {
      this._processing = null;
    });
    return this._processing;
  }

  async _process(source) {
    if (this._destroyed) return null;
    await this.init();
    if (this._destroyed) return null;
    if (source.width !== this._frameWidth || source.height !== this._frameHeight) {
      this._frameWidth = source.width;
      this._frameHeight = source.height;
      this.maskTarget.setSize(source.width, source.height);
    }

    performance.mark('segment-start');
    const size = this._inputSize;
    const workgroups = [Math.ceil(size / 16), Math.ceil(size / 16), 1];
    drawFullscreen(this._resizePipeline, {}, { u_source: source }, this._inputTarget);
    dispatch(
      this._packPipeline,
      { u_size: size, u_scale: 1.0, u_offset: 0.0 },
      { u_texture: this._inputTarget, u_out: this._inputBuffer },
      workgroups,
    );
    const feeds = { [this._session.inputNames[0]]: this._inputTensor };
    await withOrt(() => this._session.run(feeds, { mask: this._maskTensor }));
    if (this._destroyed) return null;
    dispatch(
      this._maskToTexturePipeline,
      { u_size: size, u_binary: this.binary ? 1 : 0 },
      { u_mask: this._maskBuffer, u_out: this._maskTexture },
      workgroups,
    );
    drawFullscreen(this._resizePipeline, {}, { u_source: this._maskTexture }, this.maskTarget);
    performance.mark('segment-end');
    try {
      performance.measure('mediapipe-gpu:segment', 'segment-start', 'segment-end');
    } catch (_) {}
    // Let the queued GPU work drain before the caller submits the next
    // frame (see TwoStageGpuPipeline._process).
    await this._device.queue.onSubmittedWorkDone();
    return this.maskTarget;
  }

  destroy() {
    this._destroyed = true;
    // Never free resources under a pending init or an in-flight frame.
    void settled(this._initPromise)
      .then(() => settled(this._processing))
      .then(() => this._release());
  }

  _release() {
    if (this._session) {
      const session = this._session;
      void withOrt(() => session.release());
    }
    this._session = null;
    this._inputTarget?.destroy();
    this._inputBuffer?.destroy();
    this._maskBuffer?.destroy();
    this._maskTexture?.destroy();
    this.maskTarget?.destroy();
    this._inputTarget = null;
    this._inputBuffer = null;
    this._maskBuffer = null;
    this._maskTexture = null;
    this.maskTarget = null;
  }
}
