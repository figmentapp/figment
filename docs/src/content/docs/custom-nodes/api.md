---
title: "The figment API"
description: "Reference for the figment graphics API available inside custom nodes: createImageFilter, createImageGenerator, createFeedbackFilter, RenderTarget, drawFullscreen, samplers and utilities."
---

# The figment API

Inside a custom node, the `figment` global provides the WebGPU graphics pipeline and a set of utilities. For most image nodes you only need one of the three high-level helpers below.

## High-level helpers

### createImageFilter

Image in → shader → image out. Declares an `in` image port and an `out` image port, compiles your WGSL, manages the render target, and wires up the whole lifecycle.

```js
const blurIn = node.numberIn('amount', 0.005, { min: 0, max: 0.02, step: 0.001 });

const result = figment.createImageFilter(node, {
  label: 'blur', // used in GPU debug labels
  uniforms: { u_step: 'f32' }, // uniform name → WGSL type
  wgsl: `
    let color = textureSample(u_input_texture, defaultSampler, in.uv + vec2f(u.u_step, 0.0));
    return color;
  `,
  getUniforms: () => ({ u_step: blurIn.value }), // called every render
});
```

Options: `label`, `wgsl`, `uniforms`, `getUniforms()`, `input` (port name, default `'in'`), `output` (default `'out'`), `sampler` (default `figment.samplers.linearClamp`).

Returns `{ pipeline, target, inputPort, outputPort }` — handy when `getUniforms` needs the input image size:

```js
getUniforms: () => ({ u_aspect: result.inputPort.value.width / result.inputPort.value.height });
```

Your shader gets the input image as `u_input_texture`. See [Writing Shaders](/docs/custom-nodes/shaders) for the full WGSL contract.

### createImageGenerator

Like `createImageFilter` but with no image input — for procedural sources. You provide the output size:

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

Options: as above, plus `getSize()` and no `input`.

### createFeedbackFilter

For effects that need the previous frame (trails, decay, simulations). Uses a ping-pong pair of render targets; your shader gets the previous output as `u_feedback_texture` and the current input as `u_input_texture`:

```js
const result = figment.createFeedbackFilter(node, {
  label: 'trail',
  uniforms: { u_fade: 'f32' },
  wgsl: `
    let prev = textureSample(u_feedback_texture, defaultSampler, in.uv);
    let next = textureSample(u_input_texture, defaultSampler, in.uv);
    return max(next, prev * (1.0 - u.u_fade));
  `,
  getUniforms: () => ({ u_fade: fadeIn.value }),
});
```

Options: as `createImageFilter`, plus `iterations` (number or function, default `1`) to run the shader multiple times per frame. Returns `{ pipeline, pp, inputPort, outputPort }`, where `pp` is the `PingPongTarget`. See [Feedback effects](/docs/custom-nodes/cookbook/feedback-effects).

### Adding your own lifecycle logic to a helper

The helpers assign `node.onStart` / `node.onRender` / `node.onStop`. To add extra setup or cleanup (timers, network requests), chain the helper's callbacks instead of overwriting them:

```js
figment.createImageFilter(node, { /* … */ });

const helperStart = node.onStart;
node.onStart = async () => {
  helperStart();
  await fetchInitialData();
};

const helperStop = node.onStop;
node.onStop = () => {
  clearInterval(timer);
  helperStop();
};
```

When async data arrives, call `node._markDirty()` to request a re-render.

## Images: RenderTarget

Images flowing between nodes are `figment.RenderTarget` objects — a GPU texture plus metadata: `{ width, height, texture, view, format }`.

```js
const target = new figment.RenderTarget({ label: 'myNode' }); // format defaults to 'rgba8unorm'
target.setSize(width, height);       // (re)allocates the texture when the size changes
target.uploadExternal(source);       // copy an ImageBitmap / video frame / canvas into the texture
target.uploadBytes(data);            // upload raw RGBA bytes ({ bytesPerRow } optional)
const imageData = await target.readPixels();    // read back as ImageData
const raw = await target.readPixelsRaw();       // { width, height, data: Uint8Array }
target.destroy();                    // free GPU memory (call in node.onStop)
```

Typical CPU-image node (this is the real Load Image node):

```js
const fileIn = node.fileIn('file', '', { fileType: 'image' });
const imageOut = node.imageOut('out');

let target;

node.onStart = () => {
  target = new figment.RenderTarget({ label: 'loadImage' });
};

node.onRender = async () => {
  if (!fileIn.value || fileIn.value.trim().length === 0) return;
  const imageUrl = figment.urlForAsset(fileIn.value);
  const response = await fetch(imageUrl.toString());
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  target.setSize(bitmap.width, bitmap.height);
  target.uploadExternal(bitmap);
  bitmap.close();
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
```

`figment.PingPongTarget` wraps two render targets for feedback loops: `pp.read` / `pp.write`, `setSize(w, h)`, `ensureInitialized()`, `swap()`, `destroy()`.

`figment.loadImageToTarget(url)` loads a URL straight into a fresh `RenderTarget`.

## Low-level pipeline API

When the helpers don't fit (multiple textures, multi-pass, compute), drop down a level:

- `figment.createRenderPipeline({ wgsl, uniforms, textures, sampler, targetFormat, label })` — compiles a full-screen fragment pipeline. `wgsl` must contain an `@fragment fn fs_main(in: VertexOutput)`; `textures` is an ordered array of texture binding names. Use `figment.generateWgslPreamble({ uniforms, textures })` to generate the matching uniform struct and binding declarations.
- `figment.drawFullscreen(pipeline, uniformValues, textureValues, target, options?)` — one full-screen pass into `target`. `textureValues` maps texture names to `RenderTarget`s; `options` takes `{ sampler, clearColor }`.
- `figment.clearRenderTarget(target, clearColor?)` — clear a target.
- `figment.createComputePipeline({ wgsl, uniforms, textures, storage, entryPoint, label })` and `figment.dispatch(pipeline, uniformValues, resources, [x, y, z])` — compute passes with storage textures/buffers.
- `figment.samplers` — `linearClamp` (default), `linearRepeat`, `nearestClamp`, `nearestRepeat`.
- `figment.getDevice()` / `figment.getQueue()` — the raw `GPUDevice` / `GPUQueue` for anything else.

## Utilities

| Function | Description |
| --- | --- |
| `figment.colorToVec4(color)` / `colorToVec3(color)` | convert a `colorIn` value (0–255 RGB) to normalized `[r, g, b, a]` / `[r, g, b]` for uniforms |
| `figment.toCanvasColor(color)` | convert to a CSS `rgba(…)` string |
| `figment.urlForAsset(filename)` | resolve a project-relative file to a fetchable URL |
| `figment.filePathForAsset(filename)` | resolve a project-relative file to an absolute path |
| `figment.projectFile()` / `figment.projectDirectory()` | the current `.fgmt` file / its directory |
| `figment.ensureDirectory(dir)` | create a directory if needed |
| `figment.filePathToRelative(filename)` | make an absolute path project-relative |
| `figment.debounce(fn, delay)` | debounce helper |

There is intentionally no way to import external libraries — nodes are self-contained so `.fgmt` project files keep working everywhere.
