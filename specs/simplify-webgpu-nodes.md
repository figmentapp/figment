# Simplify WebGPU Node Authoring

## Problem

After the WebGPU migration, every image-processing node contains 40-70 lines of nearly identical boilerplate: WGSL preamble (struct + bindings), pipeline creation, render target lifecycle, null-input guards, size management, and cleanup. Roughly 50 of the ~67 image nodes follow one of three patterns (filter, generator, feedback) with only the shader body and uniforms varying.

## Design: Two-Layer Approach

### Layer 1: `generateWgslPreamble` — standalone utility

Auto-generates the WGSL struct + binding declarations from JS-side uniform/texture declarations. Usable with the raw `createRenderPipeline` API for complex nodes that don't fit the lifecycle helpers.

```js
const preamble = figment.generateWgslPreamble({
  uniforms: { u_threshold: 'f32', u_color: 'vec3f' },
  textures: ['u_input_texture'],
});
// Returns a string containing:
//   struct Uniforms { u_threshold: f32, _pad1: f32, _pad2: f32, _pad3: f32, u_color: vec3f, _pad4: f32 };
//   @group(0) @binding(0) var<uniform> u: Uniforms;
//   @group(0) @binding(1) var defaultSampler: sampler;
//   @group(0) @binding(2) var u_input_texture: texture_2d<f32>;
```

Key behaviors:

- Computes padding fields automatically (no more manual `_pad` in WGSL or JS)
- Handles empty uniforms (inserts `_pad0: f32`)
- Handles trailing padding to match 16-byte struct alignment
- Normalizes GLSL-style type aliases (`float` -> `f32`, `vec2` -> `vec2f`, etc.)

### Layer 2: `createImageFilter` / `createImageGenerator` / `createFeedbackFilter`

High-level lifecycle helpers for the ~85% of nodes that follow the standard pattern. Handles port creation, pipeline creation, rendering, size management, null-input guards, and cleanup.

## API Reference

### `generateWgslPreamble({ uniforms, textures })`

```js
figment.generateWgslPreamble({
  uniforms: { name: 'wgslType', ... },  // e.g. { u_fade: 'f32', u_color: 'vec3f' }
  textures: ['textureName', ...],        // e.g. ['u_input_texture']
})
// Returns: string with WGSL struct, uniform binding, sampler, and texture bindings
```

Algorithm:

1. Run `computeUniformLayout(uniforms)` to get field offsets
2. Walk fields in order; for each gap between `previousEnd` and `field.offset`, emit `_padN: f32` fields (one per 4-byte gap)
3. After last field, emit trailing pad fields to reach `totalSize`
4. If `uniforms` is empty, emit `struct Uniforms { _pad0: f32 };`
5. Emit `@group(0) @binding(0) var<uniform> u: Uniforms;`
6. Emit `@group(0) @binding(1) var defaultSampler: sampler;`
7. For each texture name at index `i`, emit `@group(0) @binding(2+i) var {name}: texture_2d<f32>;`

### `createImageFilter(node, opts)`

For single-input, single-output filter nodes (grayscale, blur, chromaKey, etc.).

```js
figment.createImageFilter(node, {
  label,                    // pipeline label (required)
  wgsl,                     // fragment shader body or full @fragment fn (required)
  uniforms,                 // { name: type } uniform declarations (default: {})
  getUniforms,              // () => { name: value } thunk called each frame (optional)
  input,                    // input port name (default: 'in')
  output,                   // output port name (default: 'out')
  sampler,                  // custom sampler descriptor (optional)
})
// Returns: { pipeline, target, inputPort, outputPort }
```

Wires up:

- `node.imageIn(input)`, `node.imageOut(output)`
- `onStart`: `createRenderPipeline` + `new RenderTarget`
- `onRender`: null-guard on input -> `setSize` from input -> `drawFullscreen` -> `set(target)`
- `onStop`: `target.destroy()`

The `wgsl` parameter accepts two forms:

- **Fragment body** (no `@fragment` keyword): auto-wrapped in `@fragment fn fs_main(in: VertexOutput) -> @location(0) vec4f { ... }`
- **Full function** (contains `@fragment fn`): prepended with generated preamble as-is, allowing helper functions above the entry point

### `createImageGenerator(node, opts)`

For nodes that produce output without image input (constant, noise, gradient, etc.).

```js
figment.createImageGenerator(node, {
  label,                    // pipeline label (required)
  wgsl,                     // fragment shader body or full @fragment fn (required)
  uniforms,                 // { name: type } uniform declarations (default: {})
  getUniforms,              // () => { name: value } thunk called each frame (optional)
  getSize,                  // () => { width, height } thunk (required)
  output,                   // output port name (default: 'out')
  sampler,                  // custom sampler descriptor (optional)
})
// Returns: { pipeline, target, outputPort }
```

Like `createImageFilter` but no image input, no textures, `getSize()` for dimensions.

### `createFeedbackFilter(node, opts)`

For temporal feedback nodes using `PingPongTarget` (trail, reactionDiffusion).

```js
figment.createFeedbackFilter(node, {
  label,                    // pipeline label (required)
  wgsl,                     // fragment shader body or full @fragment fn (required)
  uniforms,                 // { name: type } uniform declarations (default: {})
  textures,                 // additional texture names beyond the automatic two (default: [])
  getUniforms,              // () => { name: value } thunk called each frame (required)
  iterations,               // number or () => number of shader passes per frame (default: 1)
  input,                    // input port name (default: 'in')
  output,                   // output port name (default: 'out')
  sampler,                  // custom sampler descriptor (optional)
})
// Returns: { pipeline, pp, inputPort, outputPort }
```

Key differences from `createImageFilter`:

- Uses `PingPongTarget` instead of `RenderTarget`
- Shader gets two automatic textures: `u_feedback_texture` (previous frame / iterative state from `pp.read`) + `u_input_texture` (current input). Additional textures can be declared via `textures` array.
- Supports `iterations` -- either a number or a `() => number` thunk. When `> 1`, runs the shader N times (draw to `pp.write`, swap, repeat), with `u_feedback_texture` cycling through iterations while `u_input_texture` stays constant.
- After iterations, outputs `pp.read` directly (no separate target needed).
- Returns `{ pipeline, pp, inputPort, outputPort }` -- exposes `pp` for reset/clear.
- Node authors wire up reset buttons themselves:

```js
resetIn.onTrigger = () => {
  result.pp.destroy();
  result.pp = new figment.PingPongTarget();
};
```

### Private helpers

#### `_canonicalWgslType(type)`

Maps GLSL-style aliases to canonical WGSL types:

| Input      | Output   |
|------------|----------|
| `float`    | `f32`    |
| `vec2`     | `vec2f`  |
| `vec3`     | `vec3f`  |
| `vec4`     | `vec4f`  |
| `mat4`     | `mat4x4f`|
| (passthrough for native WGSL types) |

#### `_buildFragmentWgsl(preamble, wgsl)`

Combines generated preamble with user WGSL:

- If `wgsl` contains `@fragment` -> prepend preamble as-is
- If not -> wrap in `@fragment fn fs_main(in: VertexOutput) -> @location(0) vec4f { ... }`

## Before/After Examples

### grayscale.js -- 48 lines to 9 lines

```js
// BEFORE
const SHADER = `
struct Uniforms { _pad: f32 };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(u_input_texture, defaultSampler, in.uv);
  let gray = dot(color.rgb, vec3f(0.299, 0.587, 0.114));
  return vec4f(gray, gray, gray, 1.0);
}`;
const inputPort = node.imageIn('in');
const outputPort = node.imageOut('out');
let pipeline, target;
node.onStart = () => {
  pipeline = figment.createRenderPipeline(SHADER, {});
  target = new figment.RenderTarget();
};
node.onRender = () => {
  const inputImage = inputPort.value;
  if (!inputImage) return;
  target.setSize(inputImage.width, inputImage.height);
  figment.drawFullscreen(pipeline, { /* uniforms */ }, [inputImage], target);
  outputPort.set(target);
};
node.onStop = () => { target.destroy(); };

// AFTER
figment.createImageFilter(node, {
  label: 'grayscale',
  wgsl: `
    let color = textureSample(u_input_texture, defaultSampler, in.uv);
    let gray = dot(color.rgb, vec3f(0.299, 0.587, 0.114));
    return vec4f(gray, gray, gray, 1.0);
  `,
});
```

### chromaKey.js -- 67 lines to 19 lines

```js
const colorIn = node.colorIn('key color', [0, 255, 0]);
const thresholdIn = node.numberIn('threshold', 0.4, { min: 0.0, max: 1.0, step: 0.01 });

figment.createImageFilter(node, {
  label: 'chromaKey',
  uniforms: { u_keyColor: 'vec3f', u_threshold: 'f32' },
  wgsl: `
    var color = textureSample(u_input_texture, defaultSampler, in.uv);
    let difference = length(color.rgb - u.u_keyColor);
    if (difference < u.u_threshold) { color.a = 0.0; }
    return color;
  `,
  getUniforms: () => ({
    u_keyColor: figment.colorToVec3(colorIn.value),
    u_threshold: thresholdIn.value,
  }),
});
```

### constant.js -- 46 lines to 12 lines

```js
const colorIn = node.colorIn('color', [128, 128, 128, 1.0]);
const widthIn = node.numberIn('width', 1024, { min: 1, max: 4096, step: 1 });
const heightIn = node.numberIn('height', 512, { min: 1, max: 4096, step: 1 });

figment.createImageGenerator(node, {
  label: 'constant',
  uniforms: { u_color: 'vec4f' },
  wgsl: `return u.u_color;`,
  getUniforms: () => ({ u_color: figment.colorToVec4(colorIn.value) }),
  getSize: () => ({ width: widthIn.value, height: heightIn.value }),
});
```

### trail.js -- feedback with reset (~20 lines)

```js
const fadeParam = node.numberIn('fade', 0, { min: 0, max: 1, step: 0.01 });
const clearButtonIn = node.triggerButtonIn('clear');

const result = figment.createFeedbackFilter(node, {
  label: 'trail',
  uniforms: { u_fade: 'f32', u_seed: 'f32' },
  wgsl: `
    fn random(st: vec2f) -> f32 { ... }

    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      var prev = textureSample(u_feedback_texture, defaultSampler, in.uv);
      let next = textureSample(u_input_texture, defaultSampler, in.uv);
      // ... trail logic ...
    }
  `,
  getUniforms: () => ({ u_fade: fadeParam.value, u_seed: Math.random() }),
});

clearButtonIn.onTrigger = () => {
  result.pp.destroy();
  result.pp = new figment.PingPongTarget();
};
```

### reactionDiffusion.js -- feedback with iterations (~25 lines)

```js
const result = figment.createFeedbackFilter(node, {
  label: 'reactionDiffusion',
  uniforms: { u_resolution: 'vec2f', u_influence: 'f32', ... },
  wgsl: `
    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      let current = textureSample(u_feedback_texture, defaultSampler, uv);
      let pixel = current + textureSample(u_input_texture, defaultSampler, uv) * u.u_influence;
      // ... reaction diffusion logic ...
    }
  `,
  getUniforms: () => ({ u_resolution: [...], ... }),
  iterations: () => iterationsIn.value,
});
```

## Nodes That Stay on the Raw API

These use `generateWgslPreamble` (Layer 1) but NOT the lifecycle helpers:

- **composite.js** -- dynamic shader recompilation on blend mode change
- **crop.js** -- two pipelines, output size != input size
- **difference.js** -- two separate pipelines
- **webcamImage.js** -- no shader, uses `uploadExternal`
- **loadImage.js**, **loadMovie.js**, **fetchImage.js** etc. -- I/O nodes, no shader

## Implementation Steps

### Step 1: Add `generateWgslPreamble` to `src/figment.js`

Add `_canonicalWgslType(type)` mapper and the exported `generateWgslPreamble({ uniforms, textures })` function. ~50 lines total.

### Step 2: Add `_buildFragmentWgsl` private helper

~10 lines. Combines `generateWgslPreamble` output with the user's WGSL string (auto-wrapping or prepending based on `@fragment` presence).

### Step 3: Add `createImageFilter(node, opts)`

~30 lines. Wires up image input/output, pipeline creation, render loop with null-guard and size management, and cleanup.

### Step 4: Add `createImageGenerator(node, opts)`

~25 lines. Like `createImageFilter` but no image input, no textures, `getSize()` for dimensions.

### Step 4b: Add `createFeedbackFilter(node, opts)`

~40 lines. PingPongTarget lifecycle, automatic `u_feedback_texture` and `u_input_texture` bindings, iteration support.

### Step 5: Convert all eligible nodes (~50 files)

Convert all single-input filter nodes to `createImageFilter`, generators to `createImageGenerator`, feedback nodes to `createFeedbackFilter`, and complex nodes to use `generateWgslPreamble` with the raw API. Run `npm run build` periodically to catch errors.

Key validation nodes (test these first):

- `grayscale.js` -- simplest filter, auto-body-wrapping, no uniforms
- `chromaKey.js` -- uniforms with color conversion, `getUniforms` thunk
- `noise.js` -- helper functions above `@fragment fn`
- `constant.js` -- `createImageGenerator` with `getSize`
- `trail.js` -- `createFeedbackFilter` with reset button
- `reactionDiffusion.js` -- `createFeedbackFilter` with iterations
- `glowEdges.js` -- `generateWgslPreamble` standalone (complex node, raw API)

## Files Modified

- `src/figment.js` -- add `generateWgslPreamble`, `createImageFilter`, `createImageGenerator`, `createFeedbackFilter`, `_canonicalWgslType`, `_buildFragmentWgsl`
- ~50 node files in `src/nodes/image/` -- convert to use helpers

## Verification

1. `npm run build` passes after each step
2. `npm test` passes (11/11)
3. Manual smoke test: open app, verify grayscale / chromaKey / constant / noise / glowEdges produce correct output
