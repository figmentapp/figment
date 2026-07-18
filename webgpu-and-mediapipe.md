# Running MediaPipe Models Natively on WebGPU

## The problem

Figment's strategy is to keep all image data GPU-resident. MediaPipe breaks
that: its web runtime (`@mediapipe/tasks-vision`) only accepts CPU-side
images (`ImageData`, canvas) and runs internally on WebGL. Every frame
through a MediaPipe node costs:

1. a full-frame GPU→CPU readback (e.g. 8.3 MB at 1080p) to feed the model,
2. WASM/WebGL inference in a worker,
3. for segmentation, a full-frame CPU→GPU upload of the mask on the way back.

MediaPipe's proper zero-copy WebGPU path (`webgpu_external_texture_buffer`)
exists in their BUILD files but has never shipped in the open-source repo,
and the JS API has no WebGPU texture input either.

## The insight

A `.task` file is just a ZIP archive (with uncompressed entries) containing
ordinary TFLite neural networks plus MediaPipe's pre/post-processing
recipe implemented in C++ "calculators":

```
pose_landmarker_lite.task
├── pose_detector.tflite            224×224 → 2254 candidate boxes + keypoints
└── pose_landmarks_detector.tflite  256×256 → 39 landmarks, mask, world landmarks
```

The neural networks are the expensive part, and *those* can run on WebGPU:
Figment already ships a patched onnxruntime-web whose WebGPU execution
provider shares Figment's own `GPUDevice` (`ort.env.webgpu.device`) and does
zero-copy tensor I/O via `ort.Tensor.fromGpuBuffer` (see the ONNX Image
Model node). What MediaPipe's runtime adds around the models — resizing,
letterboxing, anchor decoding, non-max suppression, ROI cropping, landmark
projection, mask warping — is all straightforward math and texture work
that Figment can do itself in WGSL and a few hundred lines of JS.

So instead of bridging into MediaPipe's runtime, we bypass it entirely:

1. **Extract** the TFLite models from the `.task` files.
2. **Convert** them to ONNX (`scripts/convert-mediapipe-to-onnx.py`).
3. **Run** them with onnxruntime-web's WebGPU EP on Figment's device.
4. **Reimplement** the calculator graph as WGSL passes + small JS.

This is implemented for pose in `src/mediapipe-gpu.js` and exposed as the
**Pose GPU** node (`src/nodes/ml/poseGpu.js`).

## Step 1+2: model conversion

`scripts/convert-mediapipe-to-onnx.py` (dev-time only; requires
`pip install tensorflow-cpu tf2onnx onnxruntime`) extracts the TFLite
models and converts them with tf2onnx. Two wrinkles worth knowing about:

- **Sparse weights.** `pose_detector.tflite` stores its conv weights in
  TFLite's sparse CSR format behind `DENSIFY` ops, which tf2onnx cannot
  parse (`ValueError: cannot reshape array of size 96 into shape ...`).
  The script decodes the sparsity metadata (traversal order, block map,
  CSR segments/indices) itself, materializes dense buffers, strips the
  `DENSIFY` ops from the flatbuffer, and re-serializes the model. All other
  models (hands, face, pose landmarks) convert without this.
- **Validation.** Each ONNX model is compared against the original TFLite
  model (run by the TFLite interpreter) on random input. Differences are
  relative to output magnitude because the fp16 weights make exact
  equality impossible: worst case observed is ~3e-5 relative — for the
  segmentation logits (range ±550) the absolute diff of ~0.1 becomes
  <1e-3 after sigmoid.

The converted models live in `assets/mediapipe/onnx/` and ship with the
app. tf2onnx upcasts the fp16 weights to fp32, so they are ~2× the TFLite
size; `pose_landmarks_heavy` (55 MB) is therefore not committed — run the
script if you need it, or see "Future work" for the fp16 route.

## Step 3+4: the GPU pipeline (`src/mediapipe-gpu.js`)

```
frame texture ──letterbox──▶ 224×224 ──pack──▶ NHWC f32 buffer
     │                                          │ ONNX pose_detector (WebGPU EP)
     │                    decode + weighted NMS (~108 KB readback,
     │                    only when tracking is lost)
     │                                          ▼
     └──rotated ROI crop──▶ 256×256 ──pack──▶ NHWC f32 buffer
                                                │ ONNX pose_landmarks (WebGPU EP)
                     landmarks (~1.3 KB readback) ◀┤
                                                ▼ mask logits (stay on GPU)
                     frame-size mask ◀──warp── 256×256 sigmoid mask texture
```

Each MediaPipe calculator maps to a small piece of the module:

| MediaPipe calculator | Our implementation |
| --- | --- |
| `ImageToTensorCalculator` (letterbox) | fragment shader + compute pack pass |
| `SsdAnchorsCalculator` | `generateAnchors()` — 2254 anchor centers in JS |
| `TensorsToDetectionsCalculator` | `_decodeDetections()` — sigmoid, ÷224, +anchor |
| `NonMaxSuppressionCalculator` (weighted) | score-weighted blend of overlapping boxes |
| `AlignmentPointsRectsCalculator` + `RectTransformationCalculator` | `roiFromKeypoints()` — rotated square ROI, ×1.25 |
| `ImageToTensorCalculator` (ROI) | rotated-crop fragment shader |
| `TensorsToLandmarksCalculator` + `LandmarkProjectionCalculator` | JS projection ROI→frame, sigmoid on visibility |
| `TensorsToSegmentationCalculator` + `WarpAffineCalculator` | compute sigmoid pass + inverse-warp fragment shader |

Details that matter if you extend this:

- **Value ranges.** The detector wants `[-1, 1]`, the landmark model
  `[0, 1]`. The shared pack shader takes scale/offset uniforms.
- **NHWC, not NCHW.** tf2onnx keeps TFLite's NHWC input layout, so the
  pack shader writes interleaved RGB — simpler than the ONNX Image Model
  node's NCHW planes.
- **Tracking.** The landmark model outputs 39 landmarks; indices 33/34 are
  auxiliary points that exist purely to compute the *next* frame's ROI.
  While the pose presence score stays ≥ 0.5 the detector is skipped
  entirely — this mirrors MediaPipe's VIDEO mode and means the per-frame
  hot path runs a single model.
- **Partial fetches.** `session.run(feeds, fetches)` gets a preallocated
  GPU-buffer tensor for the mask output (stays on GPU) and `null` for the
  small outputs (downloaded to CPU). The 64×64×39 heatmap output is not
  fetched at all.
- **Geometry is done in pixel space.** ROI size/rotation use pixel
  coordinates so non-square frames behave correctly; this matches
  MediaPipe's GPU crop path exactly (their normalized-space projection
  formula is algebraically identical because the ROI is square).

Per-frame CPU↔GPU traffic drops from ~10 MB (frame down + mask up at
1080p) to ~1.3 KB of landmarks, plus ~108 KB of detector output only on
frames where tracking is (re)acquired.

## What's implemented, what's not

- ✅ Pose: detector + lite/full landmarks + segmentation mask + world
  landmarks, single pose, with temporal ROI tracking (**Pose GPU** node).
- ⏳ Multi-pose (the CPU Segment Pose node tracks up to 4 people).
- ⏳ Heatmap-based landmark refinement (MediaPipe applies it when the
  heatmap output is present; we skip it — landmarks are slightly less
  stable in exchange for not touching the 64×64×39 tensor).
- ⏳ Landmark smoothing (One-Euro filter) — MediaPipe only smooths in
  VIDEO mode; the existing Figment nodes run IMAGE mode, so parity holds.
- ⏳ Hands and face: same recipe applies; their models already convert
  cleanly (`--all` flag on the conversion script). The work is writing
  their (simpler) decode/ROI logic — palm detection uses 2016 anchors at
  192×192, face detection 896 at 128×128.

## Future work

- **fp16 models.** Converting the ONNX weights to fp16
  (`onnxconverter-common`) would halve the asset size and likely speed up
  inference, but requires requesting the `shader-f16` feature on the
  shared device and a fallback for GPUs without it.
- **GPU detector decode.** The 108 KB detector readback could become a
  compute-shader argmax + ~100 B readback. Only worth it if re-detection
  happens often.
- **LiteRT.js** (Google's 2025 TFLite-on-WebGPU runtime) could run the
  `.tflite` files directly and would inherit new models automatically, but
  device sharing with Figment's pipeline needs investigating, and the
  pre/post-processing reimplementation is needed either way.

---

# Appendix: the canvas-bridge approach (not used)

The earlier plan below keeps MediaPipe's own runtime and smuggles textures
across the WebGPU/WebGL boundary via canvases. It is retained for
reference: it is less invasive (no model conversion, exact MediaPipe
behavior) but keeps the WebGL context, is at the mercy of the browser's
compositor for zero-copy behavior, and still can't accept a `GPUTexture`
directly.

## Architecture Overview

```
Your WebGPU Nodes                    MediaPipe                         Your WebGPU Nodes

[Webcam] -> [Resize] -> [Transform]                                   [Landmark Shader]
                |                                                           ^
                v                                                           |
        +---------------+    +--------------+    +---------------+    +-----+-----+
        | WebGPU Canvas |-->|TexImageSource |-->| MediaPipe     |-->| Landmarks  |
        | (bridge out)  |    | input path   |    | Pose Task     |    | -> GPUBuffer|
        +---------------+    +--------------+    +------+--------+    +-----------+
                                                        |
                                                        v
                                                  +-----------+    +--------------+
                                                  | MPMask     |-->| WebGL Canvas |
                                                  | (WebGL tex)|    |->copyExtImage|
                                                  +-----------+    |-> GPUTexture |
                                                                   +--------------+
```

Key points (see git history for the full original document):

- Pass Figment's device via `baseOptions.gpuOptions.device`; MediaPipe
  sets `wasmModule.preinitializedWebGPUDevice` and the C++ side picks it
  up through `emscripten_webgpu_get_device()` — but this path is only
  actually exercised by the LLM inference tasks today, not vision.
- Input: blit the WebGPU texture to an `OffscreenCanvas` with a `webgpu`
  context and hand the canvas to `detectForVideo()`. Chrome *may* keep
  this GPU-side via compositor texture sharing; it is not guaranteed.
- Landmarks out: trivial (~660 bytes), upload to a `GPUBuffer`.
- Mask out: either draw the `MPMask`'s WebGL texture to a canvas and
  `copyExternalImageToTexture` (browser-dependent zero-copy), or
  `getAsFloat32Array()` + `writeTexture` (reliable, 2–8 ms at 1080p).
