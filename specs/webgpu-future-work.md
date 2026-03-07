# WebGPU Future Work

Performance and quality improvements identified during the WebGL-to-WebGPU migration code review. Each item is self-contained and can be tackled independently.

## 1. Per-Frame Uniform Buffer Reuse

**Priority: High** | **Impact: Every node, every frame** | **Effort: Medium**

### Problem

`drawFullscreen()` in `src/figment.js` (line ~500) creates a new `GPUBuffer`, writes uniforms into it, submits the render pass, then immediately destroys the buffer — on every single call. Since `drawFullscreen` is called once per node per frame (and up to 51 times for `reactionDiffusion.js`), this means hundreds of GPU buffer create/destroy cycles per frame.

```js
// Current hot path (src/figment.js, drawFullscreen):
const uniformBuffer = _device.createBuffer({
  size: uniformData.byteLength || 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  label: pipelineInfo.label + ' uniforms',
});
_queue.writeBuffer(uniformBuffer, 0, uniformData);
// ... render pass ...
uniformBuffer.destroy();
```

GPU buffer creation involves driver-level allocation. `writeBuffer()` into an existing buffer is dramatically cheaper.

### Solution

Store a persistent uniform buffer on the `pipelineInfo` object returned by `createRenderPipeline()`. The buffer size is known at pipeline creation time from `uniformLayout.totalSize`.

```js
// In createRenderPipeline(), after computing uniformLayout:
const uniformBuffer = _device.createBuffer({
  size: uniformLayout.totalSize || 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  label: label + ' uniforms',
});

// Return it as part of pipelineInfo:
return { pipeline, bindGroupLayout, uniformLayout, textureNames, defaultSampler, label, uniformBuffer };
```

Then in `drawFullscreen()`, replace create+destroy with a single `writeBuffer`:

```js
_queue.writeBuffer(pipelineInfo.uniformBuffer, 0, uniformData);
```

The same change applies to `dispatch()` (line ~562), which has the identical pattern.

### Also: Reuse the ArrayBuffer in packUniforms

`packUniforms()` (line ~188) allocates a new `ArrayBuffer` + three typed array views on every call. Since `totalSize` is fixed per pipeline, allocate the staging buffer once and store it alongside the uniform buffer on `pipelineInfo`.

### Files to change
- `src/figment.js`: `createRenderPipeline()`, `createComputePipeline()`, `drawFullscreen()`, `dispatch()`, `packUniforms()`

### Verification
- Build passes (`npm run build`)
- Run the app, open a project with 10+ nodes, confirm no visual regressions
- Check Chrome DevTools Performance tab: GPU buffer create/destroy calls should drop to near-zero during steady-state rendering

---

## 2. Command Encoder Batching

**Priority: High** | **Impact: Multi-pass nodes** | **Effort: Medium**

### Problem

Each `drawFullscreen()` call creates its own `CommandEncoder`, finishes it, and calls `queue.submit()` independently. For a node graph with N nodes, this means N separate submits per frame. For `reactionDiffusion.js` with 50 iterations, that's 51 separate submits in a single `onRender`.

WebGPU best practice is to batch render passes into fewer command buffers and submit once (or a few times).

### Solution

Add an optional `encoder` parameter to `drawFullscreen()` and `dispatch()`. When provided, the function records its render pass onto the existing encoder instead of creating a new one. The caller is responsible for finishing and submitting.

```js
// New signature:
export function drawFullscreen(pipelineInfo, uniformValues, textureValues, target, options = {}) {
  // options.encoder — if provided, use it instead of creating a new one
  // options.sampler, options.clearColor — existing options
}
```

Nodes that call `drawFullscreen` once per frame (the majority) don't need to change — they continue using the auto-create path. Multi-pass nodes like `reactionDiffusion.js` and `trail.js` would pass a shared encoder:

```js
// In reactionDiffusion.js onRender:
const encoder = figment.createCommandEncoder();
for (let i = 0; i < iterationsIn.value; i++) {
  figment.drawFullscreen(pipeline, uniforms, textures, pp.write, { encoder });
  pp.swap();
}
figment.drawFullscreen(pipeline, uniforms, textures, target, { encoder });
figment.submitEncoder(encoder);
```

### Files to change
- `src/figment.js`: `drawFullscreen()`, `dispatch()`, add `createCommandEncoder()` and `submitEncoder()` exports
- `src/nodes/image/reactionDiffusion.js`: use shared encoder for iteration loop
- `src/nodes/image/trail.js`: optional, uses 2 passes
- `src/nodes/image/canny.js`: 4 sequential passes
- `src/nodes/image/gaussianBlur.js`: 2 passes
- `src/nodes/image/glowEdges.js`: 3 passes

### Verification
- Build passes
- Open a project with reactionDiffusion node set to 50 iterations
- Profile with Chrome DevTools: `queue.submit()` calls per frame should drop from 51 to 1 for that node

---

## 3. Blit-to-Canvas Deduplication

**Priority: Medium** | **Impact: Maintainability** | **Effort: Medium**

### Problem

Three files independently implement "render a GPUTexture to a canvas":

1. **`src/ui/Viewer.jsx`** (lines 5-29, 72-110): BLIT_WGSL shader with aspect-ratio scaling via uniforms, uses `figment.createRenderPipeline`, premultiplies alpha
2. **`src/figment-player.js`** (lines 9-123): Own BLIT_WGSL shader, builds raw pipelines manually with `device.createRenderPipeline`, no aspect-ratio handling, no alpha premultiply
3. **`src/ui/NetworkEditor.jsx`** (lines 57-129, 770-846): PREVIEW_WGSL with custom vertex shader for world-space positioning, batched drawing

All three also independently do WebGPU canvas context configuration:
```js
const gpuContext = canvas.getContext('webgpu');
gpuContext.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'premultiplied' });
```

### Solution

Extract into `src/figment.js`:

1. **`configureCanvas(canvas)`** — returns a configured `GPUCanvasContext`. Small but eliminates 3 copies of the format/alphaMode boilerplate.

2. **`blitToCanvas(gpuContext, sourceTexture, options)`** — encapsulates the common blit pattern (create encoder, begin render pass on canvas texture, draw fullscreen triangle, submit). Options: `{ aspectFit: boolean, premultiplyAlpha: boolean }`.

The Viewer and Player can share one blit implementation. NetworkEditor has a legitimately different pipeline (batched custom vertex shader) and should keep its own, but can use `configureCanvas`.

### Files to change
- `src/figment.js`: add `configureCanvas()` and `blitToCanvas()`
- `src/ui/Viewer.jsx`: replace manual blit with `blitToCanvas()`
- `src/figment-player.js`: replace manual pipeline + blit with `blitToCanvas()`
- `src/ui/NetworkEditor.jsx`: use `configureCanvas()` only

### Verification
- Viewer displays output correctly with aspect-ratio letterboxing
- Player displays output correctly (test with a .fgmt file loaded via Player)
- NetworkEditor previews render correctly

---

## 4. Auto-Handle Empty Uniform Structs

**Priority: Low** | **Impact: Boilerplate reduction** | **Effort: Small**

### Problem

WGSL doesn't allow empty structs. Nodes with no uniforms (grayscale, invert, technicolor, etc. — 8+ nodes) must add a dummy `_pad: f32` field to their WGSL and pass `uniforms: {}` to `createRenderPipeline`:

```wgsl
// src/nodes/image/grayscale.js
struct Uniforms {
  _pad: f32,        // <-- workaround for WGSL empty struct limitation
};
```

This is a trap for future node authors.

### Solution

In `createRenderPipeline()` (line ~337 of `src/figment.js`), when `uniforms` is an empty object `{}`:

- Auto-inject a minimal `struct Uniforms { _pad: f32, };` into the WGSL if no `Uniforms` struct is detected
- Or better: make the uniform binding conditional. If there are no uniforms, omit binding 0 from the bind group layout and shift texture bindings down. This requires adjusting the WGSL to not reference `u` at all, which would mean detecting whether the shader uses uniforms.

The simpler approach (auto-inject dummy struct) is safer:

```js
// In createRenderPipeline:
if (Object.keys(uniforms).length === 0) {
  // If WGSL doesn't already define a Uniforms struct, inject one
  if (!wgsl.includes('struct Uniforms')) {
    wgsl = 'struct Uniforms { _pad: f32, };\n@group(0) @binding(0) var<uniform> u: Uniforms;\n' + wgsl;
  }
  uniforms = { _pad: 'f32' };
}
```

Then nodes can pass `uniforms: {}` without any WGSL boilerplate.

### Files to change
- `src/figment.js`: `createRenderPipeline()`
- Then clean up 8+ nodes: remove `_pad` from their WGSL `Uniforms` struct (search for `_pad: f32`)

### Affected nodes
Search with: `grep -r "_pad: f32" src/nodes/`

---

## 5. Bind Group Caching for Static Nodes

**Priority: Low** | **Impact: Modest per-frame savings** | **Effort: Medium**

### Problem

`drawFullscreen()` creates a new `GPUBindGroup` on every call (line ~528). For nodes where the input texture doesn't change between frames (e.g., constant color, static image), this is wasted work.

### Solution

Cache the bind group on the `pipelineInfo` object, keyed by the texture view identities. Rebuild only when texture views change.

This is a larger refactor with diminishing returns compared to items 1-2. Only pursue after buffer reuse and command batching are done.

### Implementation sketch
```js
// In drawFullscreen, after building bgEntries:
const cacheKey = bgEntries.map(e => e.resource?.label || e.resource?.buffer?.label || 'x').join(',');
if (pipelineInfo._cachedBindGroupKey !== cacheKey) {
  pipelineInfo._cachedBindGroup = _device.createBindGroup({ ... });
  pipelineInfo._cachedBindGroupKey = cacheKey;
}
```

Note: GPUTextureView doesn't have a stable identity you can compare cheaply, so the cache key strategy needs thought. One approach: compare `RenderTarget` object references (since views are recreated on resize).

---

## 6. Aspect-Ratio Fit Calculation Deduplication

**Priority: Low** | **Impact: Minor** | **Effort: Small**

### Problem

Two files independently compute contain/cover aspect-ratio fitting:

- `src/nodes/image/resize.js` (lines 45-76): computes `scale [x, y]` for contain/cover/stretch modes
- `src/nodes/image/composite.js` (lines 119-138): computes `scale [x, y]` for contain/cover placement

The logic is structurally identical: compute aspect ratios, branch on orientation, derive scale factors.

### Solution

Add to `src/figment.js`:

```js
export function computeFitScale(inWidth, inHeight, outWidth, outHeight, mode = 'contain') {
  const inRatio = inWidth / inHeight;
  const outRatio = outWidth / outHeight;
  if (mode === 'stretch') return [1, 1];
  const isContain = mode === 'contain';
  if (inRatio > outRatio) {
    const s = isContain ? outWidth / inWidth : outHeight / inHeight;
    return [1, (inHeight * s) / outHeight];
  } else {
    const s = isContain ? outHeight / inHeight : outWidth / inWidth;
    return [(inWidth * s) / outWidth, 1];
  }
}
```

### Files to change
- `src/figment.js`: add `computeFitScale()`
- `src/nodes/image/resize.js`: use it
- `src/nodes/image/composite.js`: use it
