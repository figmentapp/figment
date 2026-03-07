# Figment WebGPU Migration Spec

## Context

Figment is a visual node-based application for creative AI data processing. It currently uses WebGL (via TWGL.js) for GPU-accelerated image processing. Images flow between nodes as `Framebuffer` objects (GPU texture references), which is efficient for shader-to-shader chains. However, ML nodes require `readPixels()` calls that synchronously stall the GPU pipeline, and the WebGL API limits future capabilities (compute shaders, modern GPU features).

This spec defines a complete migration from WebGL to WebGPU using custom helpers (not Three.js), with the goal of keeping all data GPU-resident and eliminating CPU<->GPU roundtrips wherever possible.

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rendering abstraction | Custom WebGPU helpers | Thin (~300 LOC), fully understood, no impedance mismatch. Three.js adds 1.5MB for features we don't need. |
| Three.js | Remove entirely | Only used for Stats FPS counter. Replace with standalone `stats.js` package. Re-add Three.js later only if 3D nodes are implemented. |
| Starting point | Fresh rewrite, referencing origin/webgpu | Opportunity to improve API design (auto-detect uniforms, compute shaders, validation). |
| Migration strategy | Hard cutover | No WebGL/WebGPU interop. All nodes converted at once. Simpler architecture. |
| Shader language | WGSL (direct) | Node authors write WGSL fragment shaders. Convention-based system with validation. AI agents can generate WGSL reliably. |
| ML backend | ONNX Runtime WebGPU | TF.js removed entirely. MediaPipe keeps CPU path with canvas bridge (see webgpu-and-mediapipe.md). |
| Async model | All onRender() stays async | Optimize later if profiling shows need. |
| Command encoding | One encoder per node | Simpler, matches current bind/draw/unbind pattern. |
| Device ownership | Module-level singleton in figment.js | Not on window. Nodes import from figment. |
| Video textures | copyExternalImageToTexture to RenderTarget | GPU-side copy, not zero-copy, but keeps graph model simple (one type: RenderTarget). GPUExternalTexture available as future internal optimization. |
| Viewer | Shared GPUDevice, zero-copy display | Investigate buffering only if display jank observed. |
| File format | Version bump in file-format.js | Same node types/port names for backward compat. |
| Error handling | Rich errors + WGSL validation at load time | Parse compilation errors, show in node UI, validate conventions early. |
| Uniform detection | Explicit JS-side metadata | Node authors declare uniforms, textures, entry point, and sampler in JS. No WGSL parsing — transparent and debuggable. |
| Compute shaders | First-class support from day one | Needed for ML tensor conversion, reaction-diffusion, future particle systems. |
| TF.js | Remove completely | Dead ecosystem. Models can be converted to ONNX format. |
| GPU lifecycle | Full error scope + device loss handling | Error scopes around all resource creation. Device loss triggers node restart cycle. Central UI state for GPU status. |

---

## Architecture

### GPU Device Management

A single `GPUDevice` is created at startup and exported as a module-level singleton from `figment.js`. All subsystems share it:
- Image processing pipeline (render passes)
- ONNX Runtime WebGPU backend
- MediaPipe (via `gpuOptions: { device }`)
- Viewer (direct texture-to-canvas rendering)

```
figment.js exports:
  device                      -- GPUDevice (null before init, null after loss)
  queue                       -- device.queue (convenience)
  initGPU(options?)           -- async initialization (see below)
  getGPUStatus()              -- returns current GPU state
  onDeviceLost(callback)      -- register device loss handler
  validateFeatureSupport(features)  -- check feature availability
```

### GPU Lifecycle & Error Handling

#### Initialization

```javascript
await figment.initGPU({
  requiredFeatures: ['shader-f16'],  // optional, for MediaPipe LLM inference etc.
  requiredLimits: {},                // optional, e.g. maxStorageBufferBindingSize
  powerPreference: 'high-performance',
});
```

Initialization flow:
1. Check `navigator.gpu` exists (fail with clear message if not)
2. `requestAdapter({ powerPreference })` -- handle null (no GPU / not supported)
3. Validate requested features against `adapter.features` via `validateFeatureSupport()`
4. `requestDevice({ requiredFeatures, requiredLimits })` -- handle failure
5. Register `device.lost` handler
6. Register `device.onuncapturederror` handler
7. Set module-level `device` and `queue`
8. Set GPU status to `'ready'`

#### GPU Status States

```
getGPUStatus() returns one of:
  'uninitialized'   -- initGPU() not yet called
  'ready'           -- device is active and usable
  'lost'            -- device was lost, recovery needed
  'error'           -- initialization failed (no adapter, feature not supported, etc.)
  'unavailable'     -- navigator.gpu not present (browser/environment doesn't support WebGPU)
```

The UI (App.jsx) observes GPU status and shows a central "GPU unavailable" or "GPU reset required" banner when status is not `'ready'`. The network render loop skips rendering when the device is not ready.

#### Device Loss Handling

```javascript
device.lost.then((info) => {
  console.error(`GPU device lost: ${info.message} (reason: ${info.reason})`);
  // Set status to 'lost'
  // Notify registered callbacks via onDeviceLost(callback)
  // All RenderTargets, pipelines, textures are now invalid
  // UI shows "GPU lost -- click to reinitialize" state
  // On user action or automatic: call initGPU() again to recover
  // After recovery: all nodes must re-run onStart() to recreate GPU resources
});
```

Recovery strategy:
- On device loss, set all node states to "needs restart"
- When device is re-acquired, trigger `onStop()` then `onStart()` on all nodes (recreates pipelines, textures, targets)
- Network re-renders from scratch

#### Error Scopes

Wrap GPU resource creation in error scopes to catch validation and out-of-memory errors without crashing:

```javascript
// Used internally by createRenderPipeline, createComputePipeline, etc.
device.pushErrorScope('validation');
device.pushErrorScope('out-of-memory');

const shaderModule = device.createShaderModule({ code: wgsl });
// ... pipeline creation, bind group creation ...

const oomError = await device.popErrorScope();
const validationError = await device.popErrorScope();

if (validationError) {
  // Parse error message, attach to node.error for UI display
  // Include WGSL line numbers if available
}
if (oomError) {
  // Report memory exhaustion, suggest reducing resolution
}
```

Error scopes are used around:
- `device.createShaderModule()` -- catches WGSL compilation errors
- `device.createRenderPipeline()` / `device.createComputePipeline()` -- catches layout mismatches
- `device.createBindGroup()` -- catches binding errors
- `device.createTexture()` -- catches OOM for large textures

#### Uncaptured Errors

```javascript
device.onuncapturederror = (event) => {
  console.error('Uncaptured GPU error:', event.error.message);
  // Log to a diagnostic buffer for debugging
  // Don't crash -- these are often non-fatal (e.g., a single frame's submission failed)
};
```

#### Feature Validation

```javascript
validateFeatureSupport(['shader-f16', 'timestamp-query'])
// Returns: { supported: ['shader-f16'], unsupported: ['timestamp-query'] }
// Called during initGPU and available for nodes that need specific features
```

Nodes that require specific features (e.g., `shader-f16` for half-precision ML) can call this at `onStart()` and set a descriptive `node.error` if the feature is missing.

### Core Classes

#### RenderTarget (replaces Framebuffer)
A **dumb data object** that owns a GPU texture with automatic resizing. No encoding or command submission logic — that belongs in the helpers.

```
RenderTarget(options?):
  options.format  -- GPUTextureFormat (default: 'rgba8unorm')
                     Supported: 'rgba8unorm', 'rgba16float'
  options.usage   -- GPUTextureUsageFlags (default: see below)
  options.label   -- debug label

  texture       -- GPUTexture
  view          -- GPUTextureView
  width, height -- dimensions
  format        -- actual texture format

  setSize(w, h)              -- allocate/resize (destroys old texture if format/size changed)
  uploadExternal(source)     -- copyExternalImageToTexture for images/canvas
  destroy()                  -- explicit cleanup
```

**Readback (async, not for hot path):**
```
  readPixels()  -- async, returns Promise<ImageData>
```

See "GPU Readback Path" section below for details.

**No bind()/unbind().** Encoding is handled by helpers:
- `drawFullscreen(pipeline, uniforms, textures, target)` — creates encoder, render pass, draws, submits
- `dispatch(pipeline, uniforms, resources, workgroups)` — creates encoder, compute pass, dispatches, submits
- For advanced/custom encoding: `figment.beginRenderPass(encoder, target, options)` returns a `GPURenderPassEncoder` on a caller-provided command encoder

**Default usage flags:**
```
TEXTURE_BINDING | RENDER_ATTACHMENT | COPY_SRC | COPY_DST
```

This covers the common case (shader input, render output, copyTextureToTexture for bridges). Nodes that need compute shader write access opt in:

```javascript
// Standard image node
const target = new figment.RenderTarget(); // defaults are fine

// Compute node (e.g., reaction-diffusion, ML tensor conversion)
const target = new figment.RenderTarget({
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
         | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
});

// High-precision node (blur accumulation, HDR, trails)
const target = new figment.RenderTarget({ format: 'rgba16float' });

// Compute + high precision
const target = new figment.RenderTarget({
  format: 'rgba16float',
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
         | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
         | GPUTextureUsage.COPY_DST,
});
```

**Format considerations:**
| Format | Use case | Memory (1080p) | Notes |
|--------|----------|----------------|-------|
| `rgba8unorm` | Most image nodes, color transforms, display | ~8 MB | Default. Sufficient for 8-bit content. |
| `rgba16float` | Blur/feedback/trails, reaction-diffusion, ML pre/post-processing, HDR accumulation | ~16 MB | Half-float precision prevents banding in iterative operations. |

When a node with `rgba16float` output connects to a node expecting `rgba8unorm` input, the texture is used as-is (WebGPU handles the implicit conversion during sampling). No manual format conversion needed.

#### Shared Samplers

WebGPU separates sampler state from textures (unlike WebGL where it was set per-texture). Figment provides four pre-created shared samplers, created once at `initGPU()` time:

```
figment.samplers.linearClamp    -- magFilter: 'linear',  minFilter: 'linear',  addressMode: 'clamp-to-edge'
figment.samplers.linearRepeat   -- magFilter: 'linear',  minFilter: 'linear',  addressMode: 'repeat'
figment.samplers.nearestClamp   -- magFilter: 'nearest', minFilter: 'nearest', addressMode: 'clamp-to-edge'
figment.samplers.nearestRepeat  -- magFilter: 'nearest', minFilter: 'nearest', addressMode: 'repeat'
```

**Convention:** The WGSL convention reserves `@group(0) @binding(1)` for the sampler. The sampler is not parsed from WGSL — instead, it's passed as an option to `drawFullscreen()` or `createRenderPipeline()`:

```javascript
// Default: linearClamp (most image processing nodes)
figment.drawFullscreen(pipeline, uniforms, textures, target);

// Explicit sampler choice
figment.drawFullscreen(pipeline, uniforms, textures, target, {
  sampler: figment.samplers.nearestClamp,  // for pixelation, masks
});

// Tiling/repeat nodes
figment.drawFullscreen(pipeline, uniforms, textures, target, {
  sampler: figment.samplers.linearRepeat,
});
```

**Use cases:**
| Sampler | Typical nodes |
|---------|--------------|
| `linearClamp` (default) | Most image effects, blur, color transforms, composite |
| `nearestClamp` | Pixelate, mosaic, mask operations, integer-coordinate lookups |
| `linearRepeat` | Tile, kaleidoscope, UV-wrapping effects |
| `nearestRepeat` | Pixel-art tiling, retro effects |

Nodes that need multiple samplers in a single shader (rare) can request additional sampler bindings — but this is an advanced case handled outside the convention system.

#### PingPongTarget (new -- for iterative/temporal effects)

Manages a pair of RenderTargets for read/write ping-pong patterns. Used by reaction-diffusion, trail, blur accumulation, and any node that reads from its own previous output. Like RenderTarget, this is a dumb data object — no encoding logic.

```
PingPongTarget(options?):
  options.format  -- passed to both internal RenderTargets (default: 'rgba8unorm')
  options.usage   -- passed to both internal RenderTargets

  read            -- RenderTarget (current source, use as texture input)
  write           -- RenderTarget (current destination, use as render target)
  width, height   -- dimensions (both targets share the same size)

  setSize(w, h)   -- resize both targets
  swap()          -- exchange read and write
  destroy()       -- destroy both targets
```

**Usage pattern:**
```javascript
const pp = new figment.PingPongTarget({ format: 'rgba16float' });

node.onRender = () => {
  pp.setSize(width, height);

  for (let i = 0; i < iterations; i++) {
    figment.drawFullscreen(pipeline, {
      /* uniforms */
    }, {
      u_previous: pp.read,  // read from previous iteration
    }, pp.write);            // write to current target
    pp.swap();               // swap read/write for next iteration
  }

  imageOut.set(pp.read);     // output is always the last-written (now in read after swap)
};
```

**Also usable for temporal state** (trail node):
```javascript
// Each frame: blend current input with previous frame, stored in ping-pong
figment.drawFullscreen(trailPipeline, { fade }, {
  u_current: imageIn.value,
  u_previous: pp.read,
}, pp.write);
pp.swap();
imageOut.set(pp.read);
```

#### GPUExternalTexture (internal optimization, not a graph type)

`GPUExternalTexture` provides zero-copy video frame access, but has sharp constraints:
- Ephemeral (valid for one frame only, auto-expires)
- Different shader type (`texture_external` + regular `sampler`, sampled via `textureSampleBaseClampToEdge()` instead of `textureSample()`)
- Render-sampling only (compute shaders cannot consume it)
- Branching/fanout is awkward (each consumer needs its own import)

**Decision: Keep GPUExternalTexture as an internal optimization within source nodes only.** It is NOT exposed as a graph-level port type.

**Default behavior:** Movie/webcam nodes **materialize to a normal RenderTarget** using `copyExternalImageToTexture()`. This avoids the CPU roundtrip (the copy is GPU-side) while keeping the graph model simple — every image port carries a `RenderTarget`, period.

```javascript
// Inside loadMovie node:
node.onRender = () => {
  target.setSize(video.videoWidth, video.videoHeight);
  device.queue.copyExternalImageToTexture(
    { source: video },
    { texture: target.texture },
    [video.videoWidth, video.videoHeight]
  );
  imageOut.set(target);
};
```

**Future optimization path:** If profiling shows `copyExternalImageToTexture` is a bottleneck for a specific node chain (e.g., webcam → single consumer), that specific source node could optionally use `GPUExternalTexture` internally and blit to a RenderTarget for output. This is a node-internal optimization, invisible to the rest of the graph.

#### Pipeline Helpers

```
createRenderPipeline({ wgsl, uniforms, textures, entryPoint?, sampler?, label? })
  -- wgsl: raw WGSL source string (fragment shader only, vertex is auto-provided)
  -- uniforms: { name: type } metadata, e.g. { scale: 'vec2f', color: 'vec4f' }
  -- textures: ['u_input_texture', 'u_overlay']  (ordered list, determines binding indices)
  -- entryPoint: fragment entry point name (default: 'fs_main')
  -- sampler: which shared sampler to use (default: figment.samplers.linearClamp)
  -- label: debug label
  -- Returns pipeline object with cached layout info

createComputePipeline({ wgsl, uniforms, textures?, storage?, entryPoint?, label? })
  -- Same metadata pattern for compute shaders
  -- storage: [{ name, type }] for storage buffers/textures
  -- entryPoint: default 'cs_main'
  -- Returns pipeline object

drawFullscreen(pipeline, uniforms, textures, target, options?)
  -- pipeline: from createRenderPipeline
  -- uniforms: { scale: [1, 1], color: [1, 0, 0, 1] } -- values matching declared types
  -- textures: { u_input_texture: someRenderTarget } -- values matching declared names
  -- target: RenderTarget to render into
  -- options: { sampler?, clearColor? } -- override sampler per-draw if needed
  -- Packs uniforms, creates bind group, encodes render pass, submits

dispatch(pipeline, uniforms, resources, workgroups)
  -- Encodes and submits a compute shader dispatch
  -- resources: { textureName: texture, bufferName: buffer }
  -- workgroups: [x, y, z]
```

**Why explicit metadata instead of WGSL parsing:**
- No regex fragility — the JS metadata is the source of truth for binding layout
- Transparent — node authors see exactly what bindings are created
- The WGSL shader just needs to match the declared bindings (which the validation pass confirms)
- AI agents can generate both the metadata and matching WGSL reliably

### Coordinate, Alpha, and Color Conventions

These conventions are global and must be consistent across all nodes, the viewer, and source nodes. Deviating from these in any node will cause subtle visual bugs (wrong blending, flipped images, color shifts).

#### UV Origin: Top-Left

```
(0,0) ────────── (1,0)
  │                 │
  │    texture       │
  │                 │
(0,1) ────────── (1,1)
```

- UV `(0, 0)` = top-left corner of the image
- UV `(0, 1)` = bottom-left corner
- This matches **DOM/CSS/Canvas/video convention** (origin top-left)
- This matches WebGPU's `copyExternalImageToTexture` default behavior
- The built-in vertex shader outputs UVs in this orientation
- **Note:** This is the opposite of OpenGL/WebGL convention (which is bottom-left origin). During migration, shaders that assumed WebGL UV orientation may need `uv.y = 1.0 - uv.y` correction — but most Figment shaders already account for this since they work with video/webcam input.

#### Alpha: Straight (Unpremultiplied)

- All internal textures store **straight alpha**: `(R, G, B, A)` where RGB are unmodified by alpha
- Blend/composite operations must handle alpha explicitly in the shader
- Source nodes (loadImage, loadMovie, webcam) decode to straight alpha
- The canvas context is configured with `alphaMode: 'premultiplied'` for final display only — the viewer shader does the premultiplication in the final blit
- **Why straight:** Straight alpha preserves the original RGB values, which matters for operations like color keying, edge detection, and ML preprocessing. Premultiplied alpha loses information at low alpha values.

#### Color Space: sRGB (Gamma Space) for V1

- All internal math operates in **sRGB gamma space** (not linear)
- `rgba8unorm` textures store sRGB-encoded values
- `rgba16float` textures also store gamma-encoded values (not scene-linear)
- No automatic gamma correction or linearization
- This matches the current WebGL behavior (all shaders work in gamma space)
- **Future consideration:** If HDR or physically-based rendering is added later, a linear workflow with sRGB↔linear conversion at texture boundaries can be introduced. For V1, consistency with existing nodes is more important than correctness.

#### DOM Source Interpretation

- `copyExternalImageToTexture()` with `{ colorSpace: 'srgb' }` for images and video
- Canvas sources are assumed sRGB
- No color profile conversion — images are used as-is in sRGB

### WGSL Convention System

Node shaders follow a standard binding layout. **The JS-side metadata is the source of truth** for bind group layout — the WGSL must match it, but the helpers don't parse WGSL.

#### Binding Layout Convention

```
Group 0:
  Binding 0: Uniform buffer (struct Uniforms)
  Binding 1: Sampler (provided automatically)
  Binding 2+: Textures (in order declared in metadata)
```

#### Fragment Shader Example

**JS metadata (source of truth):**
```javascript
const pipeline = figment.createRenderPipeline({
  wgsl: FRAGMENT_WGSL,
  uniforms: { scale: 'vec2f', background_color: 'vec4f' },
  textures: ['u_input_texture'],
  // entryPoint: 'fs_main',     // default
  // sampler: figment.samplers.linearClamp,  // default
});
```

**WGSL (must match the metadata):**
```wgsl
struct Uniforms {
  scale: vec2f,
  background_color: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(u_input_texture, defaultSampler, in.uv);
  return color * u.scale.x;
}
```

The vertex shader (full-screen triangle) and `VertexOutput` struct are prepended automatically by the helpers.

#### Compute Shader Example

**JS metadata:**
```javascript
const pipeline = figment.createComputePipeline({
  wgsl: COMPUTE_WGSL,
  uniforms: { dimensions: 'vec2u' },
  textures: ['input_tex'],
  storage: [{ name: 'output_tex', type: 'texture_storage_2d<rgba8unorm, write>' }],
});
```

**WGSL:**
```wgsl
struct Uniforms { dimensions: vec2u };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var input_tex: texture_2d<f32>;
@group(0) @binding(2) var output_tex: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(16, 16)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  // ...
}
```

#### Validation (at pipeline creation time)

The validation pass uses error scopes (not WGSL parsing) to catch mismatches:
1. `device.createShaderModule()` catches WGSL syntax errors
2. `device.createRenderPipeline()` catches binding layout mismatches (JS metadata vs WGSL)
3. Errors are surfaced via `node.error` with the GPU's error message
4. Supported uniform types: `f32`, `i32`, `u32`, `vec2f`, `vec3f`, `vec4f`, `vec2i`, `vec3i`, `vec4i`, `vec2u`, `vec3u`, `vec4u`, `mat3x3f`, `mat4x4f`

### Node Pattern (WebGPU)

```javascript
/**
 * @name Blur
 * @description Gaussian blur effect
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  resolution: vec2f,
  radius: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  // blur implementation...
}
`;

const imageIn = node.imageIn('in');
const radiusPort = node.numberIn('radius', 5, 0, 50);
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { resolution: 'vec2f', radius: 'f32' },
    textures: ['u_input_texture'],
    label: 'blur',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, {
    resolution: [imageIn.value.width, imageIn.value.height],
    radius: radiusPort.value,
  }, {
    u_input_texture: imageIn.value,
  }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
```

### GPU Readback Path

Even though the goal is to stay GPU-resident, controlled readback to CPU is needed for:
- **Save image** (saveImage node, export)
- **Save video frames** (recording)
- **Clipboard/copy** operations
- **ML nodes** that need CPU data (MediaPipe)
- **Debugging** and **tests**

**Implementation: texture → staging buffer → mapAsync → CPU**

```javascript
// figment.js export
async function readbackTexture(target) {
  const { texture, width, height } = target;
  const bytesPerRow = Math.ceil(width * 4 / 256) * 256; // 256-byte alignment required
  const bufferSize = bytesPerRow * height;

  const stagingBuffer = device.createBuffer({
    size: bufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer(
    { texture },
    { buffer: stagingBuffer, bytesPerRow },
    [width, height]
  );
  device.queue.submit([encoder.finish()]);

  await stagingBuffer.mapAsync(GPUMapMode.READ);
  const data = new Uint8Array(stagingBuffer.getMappedRange());

  // Copy to ImageData (remove row padding if bytesPerRow > width * 4)
  const imageData = new ImageData(width, height);
  const rowBytes = width * 4;
  for (let y = 0; y < height; y++) {
    imageData.data.set(
      data.subarray(y * bytesPerRow, y * bytesPerRow + rowBytes),
      y * rowBytes
    );
  }

  stagingBuffer.unmap();
  stagingBuffer.destroy();
  return imageData;
}
```

**Key properties:**
- **Async** — uses `mapAsync()`, does not stall the GPU pipeline (unlike WebGL's synchronous `readPixels`)
- **Not for hot path** — staging buffer creation + map + copy has overhead (~2-8ms at 1080p). Fine for save/export, not for per-frame use
- **256-byte row alignment** — WebGPU requires `bytesPerRow` to be a multiple of 256. The copy loop strips padding
- **Staging buffer lifecycle** — created per-readback and destroyed after. For frequent readback (e.g., video recording), a persistent staging buffer pool could be added later

**Convenience on RenderTarget:**
```javascript
const imageData = await target.readPixels(); // calls figment.readbackTexture(this)
```

### Frame Policy for Slow Nodes

When the pipeline runs in real-time (webcam/video input), some nodes (ML inference, heavy compute) may take longer than a frame interval. The network render loop must handle this gracefully.

**Policy: Latest-Only (Drop Frames)**

```
Frame 1: [webcam] -> [resize] -> [detectPose: starts inference]
Frame 2: [webcam] -> [resize] -> [detectPose: still running, skip] -> use previous output
Frame 3: [webcam] -> [resize] -> [detectPose: done! start new inference with latest input]
```

Implementation:
- Slow async nodes track an `_inferenceInProgress` flag
- When `onRender()` is called and inference is already running, the node **skips** and outputs its previous result
- When inference completes, the node marks itself dirty so it re-renders on the next frame with the **latest** input (not the stale input that started the inference)
- This means intermediate frames are dropped — the ML node always processes the most recent input, never queues up a backlog

```javascript
// Pattern for ML nodes with latest-only policy
let inferenceInProgress = false;
let lastResult = null;

node.onRender = async () => {
  if (inferenceInProgress) {
    // Still running previous inference — output stale result, skip
    if (lastResult) imageOut.set(lastResult);
    return;
  }

  inferenceInProgress = true;
  try {
    const result = await runInference(imageIn.value);
    lastResult = result;
    imageOut.set(result);
    node.setDirty(); // re-render next frame with latest input
  } finally {
    inferenceInProgress = false;
  }
};
```

**Why latest-only:** Queuing frames creates unbounded latency (the ML node falls further and further behind). Dropping frames keeps latency bounded at `inference_time + 1 frame`. For interactive/creative use, low latency matters more than processing every frame.

**Pure GPU nodes** (image processing) are fast enough that this policy doesn't apply — they complete within a frame.

### ML Pipeline

#### ONNX Runtime WebGPU
- Share GPUDevice with ONNX Runtime's WebGPU execution provider
- Use compute shaders for RGBA<->NCHW tensor format conversion (GPU-resident)
- Flow: RenderTarget texture -> compute shader -> ONNX tensor -> compute shader -> RenderTarget texture
- No CPU roundtrip for inference

#### MediaPipe (per webgpu-and-mediapipe.md)
- Share GPUDevice via `gpuOptions: { device }`
- Input bridge: copyTextureToTexture -> canvas -> MediaPipe (GPU-side via compositor)
- Landmark output: CPU upload to GPUBuffer (660 bytes, negligible)
- Segmentation mask output: canvas bridge -> copyExternalImageToTexture (attempt GPU-side first, fallback to Float32Array)

### Viewer

- Shares the same GPUDevice as the processing pipeline
- Output node's RenderTarget texture is rendered directly to the visible canvas via a simple blit render pass
- Zero-copy: no readPixels, no transferToImageBitmap
- If display jank is observed, add double-buffering (copy output texture before present)

### Node Previews (NetworkEditor)

The NetworkEditor renders a small preview thumbnail for every node with an image output. This is currently done with WebGL in `NetworkEditor.jsx:drawNodePreviews()`:

- Iterates all nodes, checks for image output ports
- Accesses `outPort.value._fbo.attachments[0]` to get the WebGL texture
- Renders each preview as a textured quad with camera/viewport transform
- Uses a single OffscreenCanvas WebGL context for all previews
- Blits to visible canvas via `transferToImageBitmap`

**WebGPU migration:**
- Replace the WebGL offscreen context with a WebGPU context sharing the same device
- Access `outPort.value.texture` / `outPort.value.view` instead of `._fbo.attachments[0]`
- Replace TWGL shader/uniform calls with a single WebGPU render pipeline (preview blit shader)
- The preview shader needs: texture, viewport, position, resolution, camera uniforms (same as current)
- All node textures are already `RenderTarget` objects with `TEXTURE_BINDING` usage, so they can be sampled directly — no copies needed
- Continue using `transferToImageBitmap` for the final blit to the visible canvas (or share the canvas context directly if using shared device)

**Key change:** The current code accesses `outPort.value._fbo.attachments[0]` — this internal structure changes to `outPort.value.texture` / `outPort.value.view`. This also affects `Viewer.jsx` which has the same pattern.

### Video/Webcam Nodes

- Source nodes (loadMovie, webcam) use `copyExternalImageToTexture()` to materialize video frames into a standard `RenderTarget`
- This is a GPU-side copy (no CPU roundtrip) — the browser transfers the video frame directly to the GPU texture
- Output is a normal `RenderTarget` — downstream nodes don't know or care that the source was a video
- `GPUExternalTexture` is available as a future node-internal optimization if profiling shows the copy is a bottleneck (see Core Classes section)

---

## Files to Modify

### Core (rewrite)
- `src/figment.js` -- Replace WebGL helpers with WebGPU: device init, RenderTarget, ExternalSource, createRenderPipeline, createComputePipeline, drawFullscreen, dispatch, WGSL convention parser/validator, uniform packing with auto-alignment

### UI (modify)
- `src/ui/App.jsx` -- Replace OffscreenCanvas WebGL init with WebGPU device init. Remove TWGL. Export device via figment module.
- `src/ui/Viewer.jsx` -- Replace WebGL viewer with WebGPU render-to-canvas using shared device
- `src/ui/NetworkEditor.jsx` -- Replace WebGL node preview rendering with WebGPU (drawNodePreviews, offscreen context, texture access pattern)
- `src/ui/index.jsx` -- Remove `window.THREE` global, remove `window.gl` if present

### Model (modify)
- `src/model/Network.js` -- Update render loop if needed for WebGPU command submission patterns
- `src/model/Port.js` -- Add ExternalSource as a valid image port value type if needed
- `src/file-format.js` -- Add version bump for WebGPU-era projects

### Nodes - Image (~67 nodes, convert all)
- `src/nodes/image/*.js` -- Convert GLSL fragment shaders to WGSL, Framebuffer to RenderTarget, createShaderProgram to createRenderPipeline, drawQuad to drawFullscreen
- Special attention: `reactionDiffusion.js`, `trail.js` (ping-pong pattern), `loadMovie.js` (GPUExternalTexture), `webcam.js` (GPUExternalTexture)

### Nodes - ML (8 nodes)
- `src/nodes/ml/onnxImageModel.js` -- Use ONNX WebGPU backend with compute shader tensor conversion
- `src/nodes/ml/detectPose.js`, `detectFaces.js`, `segmentPose.js` etc. -- MediaPipe canvas bridge pattern per webgpu-and-mediapipe.md

### Nodes - Remove
- `src/nodes/ml/imageToImageModel.js` -- TF.js node, delete
- Any other TF.js-dependent nodes -- delete
- Remove `@tensorflow/tfjs` from package.json

### Dependencies
- Remove: `twgl.js`, `@tensorflow/tfjs`, `three`
- Add: `stats.js` (standalone FPS counter, replaces `three/examples/jsm/libs/stats.module`)
- Keep: `@mediapipe/tasks-vision`, `onnxruntime-web`

---

## Integration Risks (Validate in Phase 1 Spike)

The following assumptions are central to the architecture but unverified on the exact library versions shipping in Electron. **Each must be validated with a minimal test before committing to the architecture.**

### Risk 1: ONNX Runtime WebGPU shared device
**Assumption:** ONNX Runtime Web's WebGPU execution provider can use an externally-created GPUDevice and consume app-owned GPU buffers/textures without hidden copies.

**What to validate:**
- Can you pass your GPUDevice to the ONNX session options?
- Can you create an ONNX tensor from an existing GPUBuffer (or do you need to let ONNX allocate its own)?
- Does inference actually stay GPU-resident, or does the ONNX WebGPU backend internally readback to CPU?
- What ONNX Runtime Web version is needed? (`onnxruntime-web` is at 1.23.0 in package.json)

**Spike:** Create a minimal test that runs a small ONNX model on a WebGPU tensor backed by your device's buffer. Profile with Chrome DevTools GPU timeline to confirm no CPU readback.

**Fallback if fails:** Use ONNX's own device, feed it via `copyExternalImageToTexture` from a canvas (similar to MediaPipe bridge). Adds one GPU-side copy per inference but keeps the architecture workable.

### Risk 2: MediaPipe GPU interop in Electron
**Assumption:** MediaPipe Tasks JS supports `gpuOptions: { device }` to share your GPUDevice, and the canvas bridge for input/output stays GPU-resident.

**What to validate:**
- Does `PoseLandmarker.createFromOptions` actually accept `gpuOptions.device` in the current `@mediapipe/tasks-vision` version (0.10.22-rc)?
- Does it work in Electron's Chromium (vs. regular Chrome)?
- Is the canvas-to-WebGL transfer in `addGpuBufferToStream` actually GPU-resident, or does Electron's OffscreenCanvas implementation force a CPU copy?
- Does `closeGraphAsync()` work reliably for cleanup?

**Spike:** Create a minimal test with webcam → canvas bridge → PoseLandmarker → landmarks in Electron. Check Chrome DevTools for unexpected CPU transfers.

**Fallback if fails:** MediaPipe uses its own WebGL context (no shared device). Input via `readPixels` + `createImageBitmap` (current approach). Output landmarks via CPU upload (660 bytes, negligible). Segmentation masks via Float32Array readback. This is the current working approach — just not zero-copy.

### Risk 3: copyExternalImageToTexture with video in Electron
**Assumption:** `device.queue.copyExternalImageToTexture({ source: videoElement })` stays GPU-resident in Electron's Chromium and doesn't force a CPU readback of the video frame.

**What to validate:**
- Does it work with both `HTMLVideoElement` and `OffscreenCanvas` as sources?
- Is the transfer actually GPU-side (check GPU timeline)?
- Any format/colorspace issues with the video decoder output?

**Spike:** Profile webcam/video → `copyExternalImageToTexture` → render in Electron with GPU timeline.

**Fallback if fails:** Use `createImageBitmap(video)` + `copyExternalImageToTexture({ source: bitmap })`. ImageBitmap is usually GPU-resident and may work better as an intermediate.

---

**Phase 1 should start with these spikes before converting any nodes.** If any spike fails, the fallback paths are known and the architecture adapts without a full redesign.

## Migration Order

### Phase 0: Integration Spikes (validate before building)
0. Run the three integration spikes (ONNX shared device, MediaPipe GPU interop, copyExternalImageToTexture in Electron) to confirm assumptions or identify fallback paths

### Phase 1: Core Infrastructure
1. Rewrite `figment.js` with WebGPU helpers (device lifecycle, RenderTarget, PingPongTarget, samplers, pipelines, compute, error scopes)
2. Update `App.jsx` to initialize WebGPU device
3. Update `Viewer.jsx` for WebGPU display

### Phase 2: Image Nodes (parallel with Phase 3)
4. Convert simple image nodes (color transforms, single-texture effects) -- ~40 nodes
5. Convert multi-texture nodes (composite, blend, stack) -- ~10 nodes
6. Convert complex nodes (reactionDiffusion, trail, blur with multi-pass) -- ~10 nodes
7. Convert source nodes (loadImage, loadMovie with GPUExternalTexture, webcam) -- ~7 nodes

### Phase 3: ML Nodes (parallel with Phase 2)
8. ONNX Runtime WebGPU integration with compute shader tensor conversion
9. MediaPipe nodes with canvas bridge pattern
10. Remove TF.js nodes and dependency

### Phase 4: Cleanup
11. Remove TWGL.js dependency
12. Remove all WebGL references
13. Version bump in file-format.js
14. Update documentation and node authoring guide
15. Test all nodes end-to-end

---

## Testing Strategy

### Unit Tests (Vitest, no GPU needed)
Test non-GPU helper logic in Node.js:
- **Uniform packing**: metadata `{ scale: 'vec2f', color: 'vec4f' }` + values → correct ArrayBuffer with 16-byte alignment
- **Bind group layout generation**: metadata → correct GPUBindGroupLayoutDescriptor structure
- **Row alignment math**: readback padding calculation for various widths (256-byte alignment)
- **Dependency graph**: topological sort correctness (existing test area)

### Smoke Test Project
Create `test/smoke-test.fgmt` — a single project exercising representative node types:

**Chain 1 (basic pipeline):**
```
loadImage → blur → composite(with constant) → resize → out → saveImage
```

**Chain 2 (complex/temporal):**
```
loadImage → reactionDiffusion → trail → out
```

**Validation criteria (run for 10 frames):**
- No `node.error` on any node
- Output node has non-null RenderTarget with expected dimensions
- saveImage produces a valid PNG
- No GPU-related console errors

Run via Electron headless or Playwright driving Electron.

### What NOT to test
- Pixel-exact output (varies across GPUs)
- Per-node golden image comparison (too much maintenance for a solo project)
- WebGL fallback (hard cutover means no fallback)

## Reference Documents
- `webgpu-and-mediapipe.md` -- MediaPipe integration architecture (in repo root)
- `origin/webgpu` branch -- Previous WebGPU implementation (reference, not merged)
- `WEBGPU_NODES.md` on origin/webgpu -- Node conversion tracking
