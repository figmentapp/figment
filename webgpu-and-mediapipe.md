# Integrating MediaPipe with an Existing WebGPU Node Pipeline

## Context

This document describes how to integrate MediaPipe (pose detection with landmarks + segmentation masks) into a web app that uses a node-based WebGPU processing system. The goal is to minimize CPU roundtrips by keeping data GPU-resident where possible.

MediaPipe's web API currently uses WebGL for texture I/O, not WebGPU. The `webgpu_external_texture_buffer.h` (a proper zero-copy solution) is declared in the MediaPipe BUILD file but is not present in the open-source repo. Therefore, canvas-based bridges are needed on both the input and output sides.

---

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

---

## Step 1: Initialization -- Shared GPUDevice Setup

Create one GPUDevice and share it with MediaPipe. Both your pipeline and MediaPipe will use the same device.

```typescript
// Your existing device creation (add any features MediaPipe needs)
const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
const device = await adapter.requestDevice({
  requiredFeatures: ['shader-f16'], // needed if using LLM inference
});

// Initialize MediaPipe with YOUR device
const poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
  baseOptions: {
    modelAssetPath: 'pose_landmarker.task',
    delegate: 'GPU',
    gpuOptions: { device },  // <-- pass your device here
  },
  runningMode: 'VIDEO',
  outputSegmentationMasks: true,
});
```

### How it works internally

When you pass `gpuOptions.device`, MediaPipe calls `graphRunner.initializeForWebGpu(device, canvas)` which sets `wasmModule.preinitializedWebGPUDevice = device`. The C++ side picks this up via `emscripten_webgpu_get_device()`. This is the JS/WASM bridge for sharing a single GPUDevice.

**Key files:**
- `mediapipe/web/graph_runner/graph_runner_webgpu.ts:125-145` -- `initializeForWebGpu()`
- `mediapipe/tasks/web/genai/llm_inference/llm_inference.ts` -- example of device passing pattern

---

## Step 2: Input Bridge -- WebGPU Texture -> MediaPipe

**Strategy:** Render the WebGPU texture to a canvas, pass the canvas as `TexImageSource`.

MediaPipe's `addGpuBufferToStream()` accepts any `TexImageSource` (which includes `HTMLCanvasElement` and `OffscreenCanvas`). The browser's compositor can optimize canvas-to-WebGL texture transfers to stay GPU-side.

```typescript
// One-time setup: create a bridge canvas with WebGPU context
const bridgeCanvas = new OffscreenCanvas(width, height);
const bridgeCtx = bridgeCanvas.getContext('webgpu') as GPUCanvasContext;
bridgeCtx.configure({ device, format: navigator.gpu.getPreferredCanvasFormat() });

// Per-frame: blit your WebGPU texture to the bridge canvas
const encoder = device.createCommandEncoder();
encoder.copyTextureToTexture(
  { texture: yourProcessedTexture },
  { texture: bridgeCtx.getCurrentTexture() },
  [width, height]
);
device.queue.submit([encoder.finish()]);

// Pass canvas to MediaPipe (high-level task API)
poseLandmarker.detectForVideo(bridgeCanvas, timestamp);

// OR for lower-level graph runner:
graphRunner.addGpuBufferToStream(bridgeCanvas, 'input_video', timestamp);
```

### Why this works

`copyTextureToTexture` is a GPU-side blit. When `gl.texImage2D()` inside MediaPipe receives the canvas, Chrome can often keep this GPU-resident via compositor texture sharing. The transfer path is: your WebGPU texture -> GPU blit -> canvas -> compositor -> WebGL texture (all potentially GPU-side).

### Format compatibility note

Ensure your WebGPU texture format is compatible with `navigator.gpu.getPreferredCanvasFormat()` (typically `bgra8unorm` or `rgba8unorm`). If your processing uses a different format, you may need a format-conversion render pass before the blit.

**Key files:**
- `mediapipe/web/graph_runner/graph_runner.ts:189-229` -- `bindTextureToStream()` calls `gl.texImage2D()`
- `mediapipe/web/graph_runner/graph_runner.ts:414-423` -- `addGpuBufferToStream()`

---

## Step 3: Output -- Landmarks -> GPUBuffer

**Strategy:** Upload the small landmark arrays to a GPUBuffer for shader consumption.

Pose landmarks are ~33 points x 5 values (x, y, z, visibility, presence) = ~660 bytes. This is trivially small -- CPU transfer is negligible.

```typescript
// Create a GPUBuffer for landmarks (one-time)
const landmarkBuffer = device.createBuffer({
  size: 33 * 5 * 4, // 33 landmarks, 5 floats each, 4 bytes per float
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});

// Per-frame: upload landmarks after detection
poseLandmarker.detectForVideo(bridgeCanvas, timestamp, (result) => {
  if (result.landmarks.length > 0) {
    const data = new Float32Array(33 * 5);
    for (let i = 0; i < result.landmarks[0].length; i++) {
      const lm = result.landmarks[0][i];
      data[i * 5 + 0] = lm.x;
      data[i * 5 + 1] = lm.y;
      data[i * 5 + 2] = lm.z;
      data[i * 5 + 3] = lm.visibility ?? 0;
      data[i * 5 + 4] = lm.presence ?? 0;
    }
    device.queue.writeBuffer(landmarkBuffer, 0, data);
  }
});
```

### Consuming in WGSL

```wgsl
struct Landmark {
  x: f32, y: f32, z: f32,
  visibility: f32, presence: f32,
};

@group(0) @binding(0) var<storage, read> landmarks: array<Landmark, 33>;

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4f {
  let lm = landmarks[idx];
  // lm.x and lm.y are normalized [0,1] -- convert to clip space
  return vec4f(lm.x * 2.0 - 1.0, -(lm.y * 2.0 - 1.0), 0.0, 1.0);
}
```

**Key files:**
- `mediapipe/tasks/web/vision/pose_landmarker/pose_landmarker.ts` -- pose task API
- `mediapipe/tasks/web/components/processors/landmark_result.ts` -- landmark conversion

---

## Step 4: Output -- Segmentation Masks -> GPUTexture

**Strategy:** Two options depending on reliability needs.

Masks come back as `MPMask` objects which can contain `WebGLTexture`, `Float32Array`, or `Uint8Array`.

### Option A: Canvas bridge (potentially GPU-side)

Render the WebGLTexture to a canvas, then use `copyExternalImageToTexture()` to get it into WebGPU.

```typescript
poseLandmarker.detectForVideo(bridgeCanvas, timestamp, (result) => {
  if (result.segmentationMasks?.length) {
    const mask = result.segmentationMasks[0];

    if (mask.hasWebGLTexture()) {
      // mask.canvas is the canvas bound to MediaPipe's WebGL context
      // Render WebGLTexture to canvas via MediaPipe's drawing utils
      drawingUtils.drawConfidenceMask(mask);

      // Copy canvas -> WebGPU texture
      device.queue.copyExternalImageToTexture(
        { source: mask.canvas },
        { texture: yourMaskGpuTexture },
        [mask.width, mask.height]
      );
    }
  }
});
```

### Option B: Float32Array transfer (reliable, involves CPU roundtrip)

```typescript
poseLandmarker.detectForVideo(bridgeCanvas, timestamp, (result) => {
  if (result.segmentationMasks?.length) {
    const mask = result.segmentationMasks[0];
    const maskData = mask.getAsFloat32Array();

    device.queue.writeTexture(
      { texture: yourMaskGpuTexture },
      maskData,
      { bytesPerRow: mask.width * 4 },  // 4 bytes per float32
      [mask.width, mask.height]
    );
  }
});
```

### Trade-offs

| Approach | Transfer | Reliability | Notes |
|----------|----------|-------------|-------|
| Option A (canvas) | Potentially GPU-side | Browser-dependent | Requires drawing mask to canvas first |
| Option B (Float32Array) | GPU->CPU->GPU | Reliable everywhere | Full frame roundtrip, ~2-8ms at 1080p |

**Key files:**
- `mediapipe/tasks/web/vision/core/mask.ts` -- MPMask class, `getAsWebGLTexture()`, `getAsFloat32Array()`
- `mediapipe/tasks/web/vision/core/drawing_utils.ts` -- rendering masks to canvas
- `mediapipe/tasks/web/vision/core/image_shader_context.ts` -- WebGL shader context for mask rendering

---

## Performance Summary

| Path | Transfer Type | Estimated Cost |
|------|--------------|----------------|
| Input: WebGPU tex -> canvas -> MediaPipe | GPU blit + compositor | Low (~0.5ms) |
| Output: Landmarks -> GPUBuffer | CPU upload, 660 bytes | Negligible (<0.1ms) |
| Output: Mask -> Float32Array -> GPUTexture | GPU->CPU->GPU | Moderate (2-8ms at 1080p) |
| Output: Mask -> canvas -> `copyExternalImageToTexture` | Potentially GPU-side | Low (browser-dependent) |

---

## Limitations and Future

- **No direct WebGPU texture pass-through.** The `webgpu_external_texture_buffer` (BUILD target in `mediapipe/gpu/webgpu/BUILD:182-195`) is not yet in the open-source repo. When it ships, the canvas bridge for input becomes unnecessary.
- **Async close required.** When closing a WebGPU-backed graph, use `closeGraphAsync()` (ASYNCIFY-based) for proper synchronization. See `mediapipe/web/graph_runner/graph_runner_webgpu.ts:152-160`.
- **Canvas ID coupling.** `initializeForWebGpu()` hardcodes `canvas.id = 'canvas_webgpu'` for HTMLCanvasElement. If using multiple canvases, use OffscreenCanvas instead.
- **WebGPU device features.** If your pipeline needs specific features, request them when creating the device since MediaPipe shares it. Check MediaPipe's requirements (e.g., `shader-f16` for LLM inference, storage buffer limits).

---

## Verification Checklist

1. Create a minimal test page that captures webcam to a WebGPU texture
2. Pass the texture through the canvas bridge to MediaPipe PoseLandmarker
3. Upload returned landmarks to a GPUBuffer and render points in a WGSL shader
4. Get segmentation mask back as a GPUTexture via one of the two options
5. Profile with Chrome DevTools GPU timeline to verify the canvas bridge stays GPU-side
6. Compare frame times with vs. without the canvas bridge to measure overhead
