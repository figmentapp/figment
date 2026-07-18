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

This is implemented in `src/mediapipe-gpu.js` for all three task families —
pose, hands, and face — and powers the existing **Detect Pose**, **Segment
Pose**, **Detect Hands**, and **Detect Faces** nodes, whose parameter and
output surfaces are unchanged.

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
app: pose (detector + lite/full/heavy landmarks), hands (palm detector +
landmarks), and face (detector + landmarks). tf2onnx upcasts the fp16
weights to fp32, so they are ~2× the TFLite size (~100 MB total); see
"Future work" for the fp16 route to halve that.

Two per-model facts the runtime depends on, and where they come from:

- **Input value ranges** are read from each TFLite model's embedded
  metadata (`NormalizationOptions` mean/std): pose and face detectors want
  `[-1, 1]`, everything else `[0, 1]`.
- **Output semantics** (which tensor is landmarks/score/handedness/world,
  and their activations) come from MediaPipe's task graph sources
  (`mediapipe/tasks/cc/vision/*/**_graph.cc`). Notably: pose and hand
  presence scores are already probabilities, the face presence score needs
  a sigmoid, and hand handedness is a binary classification with labels
  0 = Right / 1 = Left.

## Step 3+4: the GPU pipeline (`src/mediapipe-gpu.js`)

```
frame texture ──letterbox──▶ NxN ──pack──▶ NHWC f32 buffer
     │                                      │ ONNX detector (WebGPU EP)
     │                  decode + weighted NMS (small readback)
     │                                      ▼ up to 4 ROIs
     └──rotated ROI crop──▶ MxM ──pack──▶ NHWC f32 buffer   (per instance)
                                            │ ONNX landmark model (WebGPU EP)
                 landmarks (~1 KB readback) ◀┤
                                            ▼ pose only: mask logits (stay on GPU)
                 frame-size mask ◀──warp+union── 256×256 mask textures
```

`TwoStageGpuPipeline` is the shared engine; `PoseGpuPipeline`,
`HandGpuPipeline`, and `FaceGpuPipeline` configure it. Each MediaPipe
calculator maps to a small piece of the module:

| MediaPipe calculator | Our implementation |
| --- | --- |
| `ImageToTensorCalculator` (letterbox) | fragment shader + compute pack pass |
| `SsdAnchorsCalculator` | `generateSsdAnchors()` — anchor centers in JS (2254 pose / 2016 hand / 896 face) |
| `TensorsToDetectionsCalculator` | `decodeDetections()` — sigmoid, ÷input size, +anchor |
| `NonMaxSuppressionCalculator` (weighted) | score-weighted blend of overlapping boxes, up to 4 results |
| `AlignmentPointsRectsCalculator` (pose) | `roiFromAlignmentPoints()` — hip→body point, ×1.25 |
| `DetectionsToRectsCalculator` + `RectTransformationCalculator` (hands, face) | `roiFromDetectionBox()` — box + keypoint rotation, shift, scale, square_long |
| `AssociationNormRect` (multi-instance tracking) | ROI IoU > 0.5 dedup when topping up tracked ROIs from the detector |
| `ImageToTensorCalculator` (ROI) | rotated-crop fragment shader, run per instance |
| `TensorsToLandmarksCalculator` + `LandmarkProjectionCalculator` | `_projectLandmarks()` ROI→frame, sigmoid on visibility, z divisors |
| `WorldLandmarkProjectionCalculator` | `_projectWorldLandmarks()` — rotate world x/y by ROI rotation |
| `TensorsToClassificationCalculator` (handedness) | binary classification, labels 0 = Right / 1 = Left |
| `TensorsToSegmentationCalculator` + `WarpAffineCalculator` (pose) | compute sigmoid pass per instance + one inverse-warp pass that unions up to 4 masks (pixel-wise max) |

Details that matter if you extend this:

- **NHWC, not NCHW.** tf2onnx keeps TFLite's NHWC input layout, so the
  pack shader writes interleaved RGB — simpler than the ONNX Image Model
  node's NCHW planes.
- **Tracking.** Pose tracks via auxiliary landmarks 33/34, face via the
  landmark bounding box (rotation from landmarks 33→263); while enough
  instances are tracked the detector is skipped, and a same-frame
  re-detection covers scene cuts. Hands run the detector every frame
  (MediaPipe's hand-landmarks→ROI calculator is custom; the 192×192 palm
  detector is cheap), which matches the CPU node's IMAGE-mode behavior.
  Note that "enough" means the configured count: with `number of poses` at
  4 and one person in frame, the detector still runs every frame looking
  for the other three — the same rule MediaPipe's tracking graphs use. Set
  the count to the number you actually expect.
- **Multi-instance.** The detector's weighted NMS yields up to 4
  detections; tracked ROIs are topped up with non-overlapping detections
  (IoU > 0.5 dedup). The landmark model is batch-1, so instances run
  sequentially; each pose instance's mask is baked into its own slot
  texture before the next run reuses the output buffer.
- **Partial fetches.** `session.run(feeds, fetches)` gets a preallocated
  GPU-buffer tensor for the pose mask (stays on GPU) and `null` for the
  small outputs (downloaded to CPU). The 64×64×39 pose heatmap is never
  fetched, and Detect Pose doesn't fetch the mask at all.
- **Geometry is done in pixel space.** ROI size/rotation use pixel
  coordinates so non-square frames behave correctly; this matches
  MediaPipe's GPU crop path exactly (their normalized-space projection
  formula is algebraically identical because the ROI is square).

Per-frame CPU↔GPU traffic drops from ~10 MB (frame down + mask up at
1080p) to ~1 KB of landmarks per instance (~6 KB for a face), plus the
detector output (108 KB pose / 145 KB hand / 61 KB face) on frames where
the detector actually runs.

## What's implemented, what's not

- ✅ Pose: detector + lite/full/heavy landmarks + segmentation mask +
  world landmarks, up to 4 poses with ROI tracking and mask union
  (**Detect Pose**, **Segment Pose**).
- ✅ Hands: palm detector + landmarks + handedness + world landmarks, up
  to 4 hands (**Detect Hands**).
- ✅ Face: detector + 478-point landmarks, up to 4 faces with ROI tracking
  (**Detect Faces**).
- ⏳ Heatmap-based landmark refinement (MediaPipe applies it to pose; we
  skip it — landmarks are slightly less stable in exchange for not
  touching the 64×64×39 tensor).
- ⏳ Landmark smoothing (One-Euro filter) — MediaPipe only smooths in
  VIDEO mode; the CPU nodes ran IMAGE mode, so parity holds.
- ⏳ Face blendshapes (the nodes never exposed them; the model is in the
  .task file if ever needed).

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
