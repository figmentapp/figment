// GPU-resident MediaPipe pose pipeline.
//
// MediaPipe's own web runtime (tasks-vision) runs its models through WebGL
// and only accepts CPU-side images, which forces a full-frame GPU→CPU
// readback on input and a CPU upload for the mask on output. This module
// reimplements the pose landmarker graph natively on Figment's WebGPU
// device instead:
//
//   frame texture ──letterbox──▶ 224×224 ──pack──▶ NHWC buffer
//        │                                          │ (ONNX pose_detector, WebGPU EP)
//        │                       anchors decode + weighted NMS (tiny readback, ~108 KB,
//        │                       only on frames where tracking was lost)
//        │                                          ▼
//        └───rotated ROI crop──▶ 256×256 ──pack──▶ NHWC buffer
//                                                   │ (ONNX pose_landmarks, WebGPU EP)
//                       landmarks (~1 KB readback) ◀┤
//                                                   ▼ segmentation mask (stays on GPU)
//                        frame-size mask ◀──warp── 256×256 mask texture
//
// The models are the exact TFLite networks extracted from the .task files,
// converted to ONNX with scripts/convert-mediapipe-to-onnx.py and executed
// by onnxruntime-web's WebGPU execution provider on Figment's own
// GPUDevice, so image data never leaves the GPU. The pre/post-processing
// logic (SSD anchors, decoding, ROI geometry, landmark projection) mirrors
// MediaPipe's calculators:
//   - SsdAnchorsCalculator / TensorsToDetectionsCalculator (pose_detection)
//   - AlignmentPointsRectsCalculator + RectTransformationCalculator (ROI)
//   - ImageToTensorCalculator (letterbox / rotated crop)
//   - TensorsToLandmarksCalculator + LandmarkProjectionCalculator
//   - TensorsToSegmentationCalculator + WarpAffineCalculator (mask)

import {
  getAdapter,
  getDevice,
  createRenderPipeline,
  createComputePipeline,
  drawFullscreen,
  dispatch,
  RenderTarget,
  samplers,
} from './figment';

const DETECT_SIZE = 224;
const LANDMARK_SIZE = 256;
const NUM_ANCHORS = 2254;
const NUM_LANDMARKS = 39; // 33 public + 2 auxiliary (ROI tracking) + 4 unused
const NUM_PUBLIC_LANDMARKS = 33;
const DETECTION_SCORE_THRESHOLD = 0.5;
const NMS_IOU_THRESHOLD = 0.3;
const PRESENCE_THRESHOLD = 0.5;
const ROI_SCALE = 1.25;

// ─── SSD anchors (SsdAnchorsCalculator, pose_detection config) ──────────────
//
// num_layers: 5, strides: [8,16,32,32,32], aspect_ratios: [1.0],
// interpolated_scale_aspect_ratio: 1.0, fixed_anchor_size: true. With
// fixed anchor size (w = h = 1) and square aspect, the configured scales
// never influence the result and an anchor is fully described by its
// center: 28²·2 + 14²·2 + 7²·6 = 2254.

export function generateAnchors() {
  const strides = [8, 16, 32, 32, 32];
  const numLayers = strides.length;
  const anchors = [];

  let layerId = 0;
  while (layerId < numLayers) {
    // Layers with the same stride share one feature map loop.
    let anchorCount = 0;
    let lastSameStride = layerId;
    while (lastSameStride < numLayers && strides[lastSameStride] === strides[layerId]) {
      anchorCount += 2; // aspect 1.0 + interpolated scale anchor
      lastSameStride++;
    }
    const featureMapSize = Math.ceil(DETECT_SIZE / strides[layerId]);
    for (let y = 0; y < featureMapSize; y++) {
      for (let x = 0; x < featureMapSize; x++) {
        for (let a = 0; a < anchorCount; a++) {
          anchors.push((x + 0.5) / featureMapSize, (y + 0.5) / featureMapSize);
        }
      }
    }
    layerId = lastSameStride;
  }
  if (anchors.length !== NUM_ANCHORS * 2) {
    throw new Error(`anchor generation produced ${anchors.length / 2}, expected ${NUM_ANCHORS}`);
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

// AlignmentPointsRectsCalculator + RectTransformationCalculator: build a
// rotated square ROI (in frame pixels) from a center keypoint and an
// alignment keypoint, target angle 90°, scaled by ROI_SCALE.
export function roiFromKeypoints(center, alignment, frameWidth, frameHeight) {
  const cx = center.x * frameWidth;
  const cy = center.y * frameHeight;
  const ax = alignment.x * frameWidth;
  const ay = alignment.y * frameHeight;
  const boxSize = Math.hypot(ax - cx, ay - cy) * 2;
  const rotation = normalizeRadians(Math.PI / 2 - Math.atan2(-(ay - cy), ax - cx));
  return { cx, cy, size: boxSize * ROI_SCALE, rotation };
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
// to [offset, offset+scale] (detector wants [-1,1], landmarks want [0,1]).
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

// Warp the ROI-space mask back to frame space (inverse of the crop).
const MASK_WARP_WGSL = `
struct Uniforms {
  u_center: vec2f,
  u_frame_size: vec2f,
  u_rot: vec2f,
  u_size: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_mask: texture_2d<f32>;

@fragment fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let d = in.uv * u.u_frame_size - u.u_center;
  let local = vec2f(d.x * u.u_rot.x + d.y * u.u_rot.y, -d.x * u.u_rot.y + d.y * u.u_rot.x) / u.u_size + 0.5;
  let v = textureSample(u_mask, defaultSampler, clamp(local, vec2f(0.0), vec2f(1.0))).r;
  let inside = all(local >= vec2f(0.0)) && all(local <= vec2f(1.0));
  let masked = select(0.0, v, inside);
  return vec4f(masked, masked, masked, 1.0);
}
`;

// ─── Pipeline ───────────────────────────────────────────────────────────────

export class PoseGpuPipeline {
  constructor({ model = 'lite' } = {}) {
    this.model = model;
    this._device = null;
    this._detectorSession = null;
    this._landmarkSession = null;
    this._anchors = generateAnchors();
    this._trackedRoi = null;
    this._frameWidth = 0;
    this._frameHeight = 0;
    this._initPromise = null;
    this._destroyed = false;
  }

  async init() {
    if (!this._initPromise) {
      this._initPromise = this._init().catch((err) => {
        this._initPromise = null; // allow a later retry
        throw err;
      });
    }
    return this._initPromise;
  }

  async _init() {
    const ort = window.ort;
    if (!ort) throw new Error('onnxruntime-web (window.ort) is not available');
    this._device = getDevice();

    ort.env.webgpu.powerPreference = 'high-performance';
    ort.env.webgpu.adapter = getAdapter();
    ort.env.webgpu.device = this._device;

    const [detectorSession, landmarkSession] = await Promise.all([
      ort.InferenceSession.create('./mediapipe/onnx/pose_detector.onnx', { executionProviders: ['webgpu'] }),
      this._createLandmarkSession(this.model),
    ]);
    this._detectorSession = detectorSession;
    this._landmarkSession = landmarkSession;
    this._detectorOutputs = this._mapDetectorOutputs(detectorSession);

    // Fixed-size GPU resources.
    this._detectTarget = new RenderTarget({ label: 'poseGpu-detect-input' });
    this._detectTarget.setSize(DETECT_SIZE, DETECT_SIZE);
    this._cropTarget = new RenderTarget({ label: 'poseGpu-crop-input' });
    this._cropTarget.setSize(LANDMARK_SIZE, LANDMARK_SIZE);
    this._maskRoiTarget = this._device.createTexture({
      size: [LANDMARK_SIZE, LANDMARK_SIZE],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      label: 'poseGpu-mask-roi',
    });
    this._maskRoiView = this._maskRoiTarget.createView();
    this.maskTarget = new RenderTarget({ label: 'poseGpu-mask' });

    this._detectInputBuffer = this._device.createBuffer({
      size: DETECT_SIZE * DETECT_SIZE * 3 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'poseGpu-detect-tensor',
    });
    this._landmarkInputBuffer = this._device.createBuffer({
      size: LANDMARK_SIZE * LANDMARK_SIZE * 3 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'poseGpu-landmark-tensor',
    });
    this._maskBuffer = this._device.createBuffer({
      size: LANDMARK_SIZE * LANDMARK_SIZE * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      label: 'poseGpu-mask-tensor',
    });

    this._detectInputTensor = ort.Tensor.fromGpuBuffer(this._detectInputBuffer, {
      dataType: 'float32',
      dims: [1, DETECT_SIZE, DETECT_SIZE, 3],
    });
    this._landmarkInputTensor = ort.Tensor.fromGpuBuffer(this._landmarkInputBuffer, {
      dataType: 'float32',
      dims: [1, LANDMARK_SIZE, LANDMARK_SIZE, 3],
    });
    this._maskTensor = ort.Tensor.fromGpuBuffer(this._maskBuffer, {
      dataType: 'float32',
      dims: [1, LANDMARK_SIZE, LANDMARK_SIZE, 1],
    });

    this._letterboxPipeline = createRenderPipeline({
      wgsl: LETTERBOX_WGSL,
      uniforms: { u_content_scale: 'vec2f' },
      textures: ['u_source'],
      label: 'poseGpu-letterbox',
    });
    this._cropPipeline = createRenderPipeline({
      wgsl: CROP_WGSL,
      uniforms: { u_center: 'vec2f', u_frame_size: 'vec2f', u_rot: 'vec2f', u_size: 'f32' },
      textures: ['u_source'],
      label: 'poseGpu-crop',
    });
    this._packPipeline = createComputePipeline({
      wgsl: PACK_WGSL,
      uniforms: { u_size: 'u32', u_scale: 'f32', u_offset: 'f32' },
      textures: ['u_texture'],
      storage: [{ name: 'u_out', type: 'buffer' }],
      label: 'poseGpu-pack',
    });
    this._maskToTexturePipeline = createComputePipeline({
      wgsl: MASK_TO_TEXTURE_WGSL,
      uniforms: { u_size: 'u32' },
      storage: [
        { name: 'u_mask', type: 'buffer' },
        { name: 'u_out', type: 'texture_storage_2d' },
      ],
      label: 'poseGpu-mask-to-texture',
    });
    this._maskWarpPipeline = createRenderPipeline({
      wgsl: MASK_WARP_WGSL,
      uniforms: { u_center: 'vec2f', u_frame_size: 'vec2f', u_rot: 'vec2f', u_size: 'f32' },
      textures: ['u_mask'],
      label: 'poseGpu-mask-warp',
    });
  }

  async _createLandmarkSession(model) {
    const session = await window.ort.InferenceSession.create(`./mediapipe/onnx/pose_landmarks_${model}.onnx`, {
      executionProviders: ['webgpu'],
    });
    this._landmarkOutputs = this._mapLandmarkOutputs(session);
    return session;
  }

  // tf2onnx names the outputs Identity/Identity_1/... in an order that could
  // change across conversions, so resolve them by tensor shape instead.
  _mapDetectorOutputs(session) {
    const names = {};
    session.outputNames.forEach((name, i) => {
      const dims = session.outputMetadata[i].shape;
      if (dims.length === 3 && dims[2] === 12) names.boxes = name;
      else if (dims.length === 3 && dims[2] === 1) names.scores = name;
    });
    if (!names.boxes || !names.scores) {
      throw new Error(`Unexpected pose detector outputs: ${session.outputNames.join(', ')}`);
    }
    return names;
  }

  _mapLandmarkOutputs(session) {
    const names = {};
    session.outputNames.forEach((name, i) => {
      const dims = session.outputMetadata[i].shape;
      if (dims.length === 2 && dims[1] === NUM_LANDMARKS * 5) names.landmarks = name;
      else if (dims.length === 2 && dims[1] === 1) names.score = name;
      else if (dims.length === 4 && dims[1] === LANDMARK_SIZE) names.mask = name;
      else if (dims.length === 2 && dims[1] === NUM_LANDMARKS * 3) names.world = name;
      // The 64×64×39 heatmap output is intentionally unmapped (never fetched).
    });
    if (!names.landmarks || !names.score || !names.mask || !names.world) {
      throw new Error(`Unexpected pose landmark outputs: ${session.outputNames.join(', ')}`);
    }
    return names;
  }

  async setModel(model) {
    if (model === this.model && this._landmarkSession) return;
    await this.init();
    // Wait for any in-flight frame: releasing a session mid-run corrupts it.
    if (this._processing) await this._processing.catch(() => {});
    const session = await this._createLandmarkSession(model);
    const old = this._landmarkSession;
    this._landmarkSession = session;
    this.model = model;
    this._trackedRoi = null;
    if (old) void old.release();
  }

  // Run the full pipeline on a RenderTarget-like source (has .view/.width/.height).
  // Returns { detected, landmarks, worldLandmarks, score }; when detected, the
  // frame-space segmentation mask is available in this.maskTarget.
  async process(source) {
    this._processing = this._process(source);
    try {
      return await this._processing;
    } finally {
      this._processing = null;
    }
  }

  async _process(source) {
    await this.init();
    if (this._destroyed) return { detected: false };
    const width = source.width;
    const height = source.height;
    if (width !== this._frameWidth || height !== this._frameHeight) {
      this._frameWidth = width;
      this._frameHeight = height;
      this.maskTarget.setSize(width, height);
      this._trackedRoi = null;
    }

    const tracking = !!this._trackedRoi;
    let roi = this._trackedRoi || (await this._detect(source));
    let result = roi ? await this._landmarks(source, roi) : null;

    // Tracking can go stale on a scene cut: fall back to a fresh detection
    // in the same frame instead of reporting a spurious miss.
    if (!result && tracking) {
      this._trackedRoi = null;
      roi = await this._detect(source);
      if (roi) result = await this._landmarks(source, roi);
    }

    if (!result) this._trackedRoi = null;
    // Wait for the queued GPU work (mask warp etc.) to drain before letting
    // the caller submit the next frame — without this the queue can grow
    // unboundedly and starve the compositor (see onnxImageModel.js).
    await this._device.queue.onSubmittedWorkDone();
    return result || { detected: false };
  }

  // ── Stage 1: pose detector ──
  async _detect(source) {
    performance.mark('poseGpu-detect-start');
    const width = this._frameWidth;
    const height = this._frameHeight;
    // Letterbox: scale the frame to fit the square input, centered.
    const fit = Math.min(DETECT_SIZE / width, DETECT_SIZE / height);
    const contentScale = [(width * fit) / DETECT_SIZE, (height * fit) / DETECT_SIZE];

    drawFullscreen(this._letterboxPipeline, { u_content_scale: contentScale }, { u_source: source }, this._detectTarget);
    dispatch(
      this._packPipeline,
      { u_size: DETECT_SIZE, u_scale: 2.0, u_offset: -1.0 },
      { u_texture: this._detectTarget, u_out: this._detectInputBuffer },
      [Math.ceil(DETECT_SIZE / 16), Math.ceil(DETECT_SIZE / 16), 1],
    );

    const feeds = { [this._detectorSession.inputNames[0]]: this._detectInputTensor };
    const outputs = await this._detectorSession.run(feeds);
    const rawBoxes = outputs[this._detectorOutputs.boxes].data; // [2254, 12]
    const rawScores = outputs[this._detectorOutputs.scores].data; // [2254, 1]

    const keypoints = this._decodeDetections(rawBoxes, rawScores, contentScale);
    performance.mark('poseGpu-detect-end');
    try {
      performance.measure('mediapipe-gpu:pose:detect', 'poseGpu-detect-start', 'poseGpu-detect-end');
    } catch (_) {}
    if (!keypoints) return null;
    // Keypoint 0: mid-hip center; keypoint 1: full-body alignment point.
    return roiFromKeypoints(keypoints[0], keypoints[1], this._frameWidth, this._frameHeight);
  }

  // TensorsToDetectionsCalculator + weighted non-max suppression.
  _decodeDetections(rawBoxes, rawScores, contentScale) {
    const anchors = this._anchors;
    const candidates = [];
    for (let i = 0; i < NUM_ANCHORS; i++) {
      const score = sigmoid(Math.max(-100, Math.min(100, rawScores[i])));
      if (score < DETECTION_SCORE_THRESHOLD) continue;
      const o = i * 12;
      const ax = anchors[i * 2];
      const ay = anchors[i * 2 + 1];
      const cx = rawBoxes[o] / DETECT_SIZE + ax;
      const cy = rawBoxes[o + 1] / DETECT_SIZE + ay;
      const w = rawBoxes[o + 2] / DETECT_SIZE;
      const h = rawBoxes[o + 3] / DETECT_SIZE;
      const values = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
      for (let k = 0; k < 4; k++) {
        values.push(rawBoxes[o + 4 + k * 2] / DETECT_SIZE + ax, rawBoxes[o + 5 + k * 2] / DETECT_SIZE + ay);
      }
      candidates.push({ score, values });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);

    // Weighted NMS (MediaPipe NonMaxSuppressionCalculator, WEIGHTED): blend
    // all candidates overlapping the best one, weighted by score.
    const best = candidates[0];
    const blended = new Float64Array(12);
    let totalWeight = 0;
    for (const c of candidates) {
      if (this._iou(best.values, c.values) < NMS_IOU_THRESHOLD) continue;
      for (let k = 0; k < 12; k++) blended[k] += c.values[k] * c.score;
      totalWeight += c.score;
    }
    for (let k = 0; k < 12; k++) blended[k] /= totalWeight;

    // Coordinates are relative to the letterboxed square; remove the
    // letterbox padding to get frame-normalized coordinates.
    const [sx, sy] = contentScale;
    const unpad = (x, y) => ({ x: (x - (1 - sx) / 2) / sx, y: (y - (1 - sy) / 2) / sy });
    const keypoints = [];
    for (let k = 0; k < 4; k++) {
      keypoints.push(unpad(blended[4 + k * 2], blended[5 + k * 2]));
    }
    return keypoints;
  }

  _iou(a, b) {
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

  // ── Stage 2: landmarks + segmentation mask ──
  async _landmarks(source, roi) {
    performance.mark('poseGpu-landmarks-start');
    const width = this._frameWidth;
    const height = this._frameHeight;
    const rot = [Math.cos(roi.rotation), Math.sin(roi.rotation)];
    const roiUniforms = {
      u_center: [roi.cx, roi.cy],
      u_frame_size: [width, height],
      u_rot: rot,
      u_size: roi.size,
    };

    drawFullscreen(this._cropPipeline, roiUniforms, { u_source: source }, this._cropTarget);
    dispatch(
      this._packPipeline,
      { u_size: LANDMARK_SIZE, u_scale: 1.0, u_offset: 0.0 },
      { u_texture: this._cropTarget, u_out: this._landmarkInputBuffer },
      [Math.ceil(LANDMARK_SIZE / 16), Math.ceil(LANDMARK_SIZE / 16), 1],
    );

    // Fetch landmarks/score/world to the CPU (~1.3 KB), keep the mask on the
    // GPU by passing a preallocated GPU-buffer tensor. The heatmap output is
    // not fetched, so it is never downloaded to the CPU.
    const names = this._landmarkOutputs;
    const feeds = { [this._landmarkSession.inputNames[0]]: this._landmarkInputTensor };
    const fetches = { [names.landmarks]: null, [names.score]: null, [names.mask]: this._maskTensor, [names.world]: null };
    const outputs = await this._landmarkSession.run(feeds, fetches);

    const score = outputs[names.score].data[0];
    if (score < PRESENCE_THRESHOLD) {
      performance.mark('poseGpu-landmarks-end');
      return null;
    }
    const rawLandmarks = outputs[names.landmarks].data; // [39 × (x, y, z, visibility, presence)] in 256-space
    const rawWorld = outputs[names.world].data; // [39 × (x, y, z)] in meters

    // LandmarkProjectionCalculator: ROI space → frame-normalized coordinates.
    const [cos, sin] = rot;
    const landmarks = [];
    const projected = [];
    // Only the 33 public landmarks and the 2 auxiliary tracking landmarks
    // are consumed; the model's remaining 4 landmarks are skipped.
    for (let i = 0; i < NUM_PUBLIC_LANDMARKS + 2; i++) {
      const o = i * 5;
      const nx = rawLandmarks[o] / LANDMARK_SIZE - 0.5;
      const ny = rawLandmarks[o + 1] / LANDMARK_SIZE - 0.5;
      const px = roi.cx + (nx * cos - ny * sin) * roi.size;
      const py = roi.cy + (nx * sin + ny * cos) * roi.size;
      const lm = {
        x: px / width,
        y: py / height,
        z: (rawLandmarks[o + 2] / LANDMARK_SIZE) * (roi.size / width),
        visibility: sigmoid(rawLandmarks[o + 3]),
        presence: sigmoid(rawLandmarks[o + 4]),
      };
      projected.push(lm);
      if (i < NUM_PUBLIC_LANDMARKS) landmarks.push(lm);
    }
    // WorldLandmarkProjectionCalculator: world landmarks are in meters around
    // the hip center but oriented to the ROI, so rotate x/y back to frame
    // orientation (z is unaffected by an in-plane rotation).
    const worldLandmarks = [];
    for (let i = 0; i < NUM_PUBLIC_LANDMARKS; i++) {
      const wx = rawWorld[i * 3];
      const wy = rawWorld[i * 3 + 1];
      worldLandmarks.push({ x: wx * cos - wy * sin, y: wx * sin + wy * cos, z: rawWorld[i * 3 + 2] });
    }

    // Track: derive the next frame's ROI from the auxiliary landmarks
    // (indices 33/34), skipping the detector entirely while the pose holds.
    this._trackedRoi = roiFromKeypoints(projected[NUM_PUBLIC_LANDMARKS], projected[NUM_PUBLIC_LANDMARKS + 1], width, height);

    // Mask: sigmoid to ROI texture, then warp back to frame space. All GPU.
    dispatch(this._maskToTexturePipeline, { u_size: LANDMARK_SIZE }, { u_mask: this._maskBuffer, u_out: this._maskRoiTarget }, [
      Math.ceil(LANDMARK_SIZE / 16),
      Math.ceil(LANDMARK_SIZE / 16),
      1,
    ]);
    drawFullscreen(this._maskWarpPipeline, roiUniforms, { u_mask: this._maskRoiTarget }, this.maskTarget, {
      sampler: samplers.linearClamp,
    });

    performance.mark('poseGpu-landmarks-end');
    try {
      performance.measure('mediapipe-gpu:pose:landmarks', 'poseGpu-landmarks-start', 'poseGpu-landmarks-end');
    } catch (_) {}
    return { detected: true, landmarks: [landmarks], worldLandmarks: [worldLandmarks], score };
  }

  destroy() {
    this._destroyed = true;
    this._trackedRoi = null;
    // Never free resources under an in-flight frame — wait for it to settle.
    const pending = this._processing ? this._processing.catch(() => {}) : Promise.resolve();
    void pending.then(() => {
      if (this._detectorSession) void this._detectorSession.release();
      if (this._landmarkSession) void this._landmarkSession.release();
      this._detectorSession = null;
      this._landmarkSession = null;
      this._detectTarget?.destroy();
      this._cropTarget?.destroy();
      this.maskTarget?.destroy();
      this._maskRoiTarget?.destroy();
      this._detectInputBuffer?.destroy();
      this._landmarkInputBuffer?.destroy();
      this._maskBuffer?.destroy();
    });
    this._initPromise = null;
  }
}
