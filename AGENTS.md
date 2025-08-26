# Repository Guidelines

## Project Structure & Modules
- `src/ui`: React views (`*.jsx`), editor, viewer, params, styles in `src/ui/css`.
- `src/model`: Graph engine (Network, Node, Port, Library, DependencyGraph).
- `src/nodes/<category>/<slug>.js`: Node implementations with JSDoc metadata.
- `src/electron`: Main process (`main.js`), preload, OSC/UDP helpers.
- `assets/`: Bundled assets (MediaPipe/ONNX, images); `res/`: builder resources.
- Generated: `build/` (Vite output), `dist/` (packaged apps).

## Architecture & Core Components
- **Network**: Orchestrates nodes, connections, render order, and dirty propagation.
- **Node**: Processing unit with ports and lifecycle `onStart/onRender/onStop`.
- **Library**: Loads node types from `src/nodes` using JSDoc (`@name`, `@description`, `@category`).
- **Port**: Typed IO (image, number, string, color, file, expression).
- **Graphics (WebGPU)**: Nodes render via WebGPU helpers in `src/figment.js`:
  - `RenderTarget`: per-node output texture with `setSize(w,h)`, `bind(clear)`, `unbind()`, `view` (GPUTextureView).
  - `makeFragmentWGSL(body, { uniformsSpec, textures })`: builds a full program (default full-screen triangle vertex + your fragment body) with a uniform struct `u` and declared textures.
  - `createRenderPipeline({ fragmentWGSL, format?, label? })`: compiles a pipeline; pass `format` to match your RenderTarget (e.g., `rgba8unorm`).
  - `drawFullscreen(pipeline, { uniforms, uniformsSpec, textures }, target)`: draws a full-screen triangle into `target`.
  - `initWebGPUDevice()` / `initWebGPUCanvas(canvas)`: global device and canvas setup (initialized in `src/ui/index.jsx`).
- **Expressions**: JEXL with `$FRAME`, `$TIME`, `$NOW`; OSC bindings via preload.
- **File format**: `.fgmt` JSON with versioning; upgrades in `src/file-format.js`.

## Node Authoring (WebGPU)
Example: fragment-only node with default vertex (no boilerplate vertex shader). Put WGSL at the top and include a full `@fragment fn fs_main`:
```js
/**
 * @name Blur
 * @description Blur an input image.
 * @category image
 */
const fragmentShaderSource = `
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let s = u.amount;         // uniforms are accessed as u.field
  let uv = in.uv;
  var c = vec4f(0.0);
  c += textureSample(input_texture, defaultSampler, uv + vec2f(-s, -s)) / 8.0;
  c += textureSample(input_texture, defaultSampler, uv + vec2f(-s,  0.0)) / 8.0;
  c += textureSample(input_texture, defaultSampler, uv + vec2f(-s,  s)) / 8.0;
  c += textureSample(input_texture, defaultSampler, uv + vec2f( 0.0, -s)) / 8.0;
  c += textureSample(input_texture, defaultSampler, uv + vec2f( 0.0,  0.0)) / 8.0;
  c += textureSample(input_texture, defaultSampler, uv + vec2f( 0.0,  s)) / 8.0;
  c += textureSample(input_texture, defaultSampler, uv + vec2f( s, -s)) / 8.0;
  c += textureSample(input_texture, defaultSampler, uv + vec2f( s,  0.0)) / 8.0;
  c += textureSample(input_texture, defaultSampler, uv + vec2f( s,  s)) / 8.0;
  return c;
}
`;
const imageIn = node.imageIn('in');
const amountIn = node.numberIn('amount', 0.005, { min: 0, max: 0.02, step: 0.001 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  target = new figment.RenderTarget();
  // makeFragmentShader prepends default vertex + uniform/sampler/texture declarations
  const fragmentShader = figment.makeFragmentShader(fragmentShaderSource, { uniformsSpec: { amount: 'f32' }, textures: ['input_texture'] });
  pipeline = figment.createRenderPipeline({ fragmentShader, format: target.format, label: 'image.blur' });
};

node.onRender = () => {
  if (!imageIn.value || !imageIn.value.view) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  target.bind([0, 0, 0, 0]);
  figment.drawFullscreen(
    pipeline,
    { uniforms: { amount: amountIn.value }, uniformsSpec: { amount: 'f32' }, textures: { input_texture: imageIn.value.view } },
    target,
  );
  target.unbind();
  imageOut.set(target);
};
```

Guidelines:
- Place under `src/nodes/<category>/<slug>.js`; keep `slug` lowercase.
- Put shader strings (WGSL) at the top of the file for readability.
- Each node owns its own `RenderTarget`; call `setSize(w,h)` whenever dimensions change.
- For fragment-only nodes, write a full `@fragment fn fs_main(...)` in WGSL and pass it to `makeFragmentShader` (no custom vertex needed).
- For custom geometry/transform, provide full WGSL with `vs_main` and `fs_main` (skip `makeFragmentShader`).
- Uniforms: Do not prefix field names with `u_` — access as `u.field` in WGSL. Define fields in `uniformsSpec` with WGSL types (e.g., `f32`, `vec2f`, `vec4f`, `mat4x4f`).
- Texture bindings: list names in `textures` (e.g., `['u_input_texture']`); they map to `@binding(2..) var <name>: texture_2d<f32>` and are sampled with `defaultSampler`.
- Avoid non-uniform control flow around `textureSample`; sample unconditionally and use masks (e.g., `step` + `clamp`) for bounds.
- Prefer shaders for image ops; use browser APIs/ML libs in `ml/` nodes.

## Build, Run, and Package
- `npm install`: Install dependencies.
- `npm start`: Electron dev app with Vite dev server.
- `npm run build`: Production web bundle to `build/`.
- `npm run fastdist`: Unsigned macOS directory build for quick testing.
- `npm run dist` | `dist-mac` | `dist-win`: Package apps with electron-builder.
- `npm run build-library`: Rollup build for `demo/figment-player.js`.
- `npm run format`: Format JS/JSX with Prettier.

## Style, Testing, and PRs
- Style: ES modules, two-space indent, single quotes, `printWidth: 140` (`.prettierrc`).
- JS: Prefer "early out" checks at the top of functions (`if (!video) return`).
- Naming: UI components PascalCase; nodes `category/slug.js`.
- Testing: No formal runner; validate with `npm start`, provide steps, examples, or minimal `.fgmt` projects.
- Commits: Imperative, concise; PRs include summary, linked issues, test steps, and screenshots/GIFs for UI.
- Security: Never commit secrets; use `.env` and `electron-builder.env` (see `*.example`).
