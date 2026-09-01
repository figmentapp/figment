---
title: "Writing Shaders (WGSL)"
description: "The WGSL shader contract for Figment custom nodes: snippet vs full fragment mode, the uniform struct, samplers, texture bindings and UV conventions."
---

# Writing Shaders (WGSL)

Figment renders with WebGPU, so shaders are written in [WGSL](https://www.w3.org/TR/WGSL/) — not GLSL. Every image pass draws one full-screen triangle and runs your fragment code per pixel.

## Two ways to write the fragment

**Snippet mode** — if your `wgsl` string does *not* contain `@fragment`, it is wrapped in a fragment function for you. Write just the body and `return` a `vec4f` color; `in.uv` gives the pixel's UV coordinate:

```js
figment.createImageFilter(node, {
  label: 'invert',
  wgsl: `
    let color = textureSample(u_input_texture, defaultSampler, in.uv);
    return vec4f(1.0 - color.rgb, color.a);
  `,
});
```

**Full mode** — if you need helper functions, constants, or loops with early returns, include the `@fragment` entry point yourself. The entry point must be `fs_main(in: VertexOutput)`:

```wgsl
fn luma(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(u_input_texture, defaultSampler, in.uv);
  return vec4f(vec3f(luma(color.rgb)), color.a);
}
```

## What's in scope

Figment generates a preamble above your code, so these are already declared — do not redeclare them:

```wgsl
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

struct Uniforms { /* one field per entry in your uniforms option */ };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>; // filters
// feedback filters: @binding(2) u_feedback_texture, @binding(3) u_input_texture
```

- **Uniforms** are accessed as `u.<name>`: declare `uniforms: { u_amount: 'f32' }` in JavaScript, read `u.u_amount` in WGSL, supply the value from `getUniforms()`.
- **UV origin is top-left**: `in.uv` is `(0, 0)` at the top-left and `(1, 1)` at the bottom-right.
- **Sampling**: `textureSample(u_input_texture, defaultSampler, in.uv)`. The default sampler is linear/clamp-to-edge; pass `sampler: figment.samplers.linearRepeat` (or `nearestClamp`, `nearestRepeat`) to the helper for other behavior.
- **Texture size**: there is no automatic resolution uniform. If the shader needs it, pass it yourself — declare `uniforms: { u_resolution: 'vec2f' }` and supply `[img.width, img.height]` from `getUniforms()` (get `img` from the helper's `result.inputPort.value`).

## Uniform types

Supported WGSL types (GLSL-style aliases in parentheses): `f32` (`float`), `i32` (`int`), `u32` (`uint`), `vec2f` (`vec2`), `vec3f` (`vec3`), `vec4f` (`vec4`), integer vector variants (`vec2i`, `vec3u`, …), `mat3x3f`, `mat4x4f`. Layout and padding are computed automatically.

Pass vectors as arrays: `getUniforms: () => ({ u_color: figment.colorToVec4(colorIn.value) })`.

## GLSL → WGSL cheat sheet

| GLSL (old) | WGSL (current) |
| --- | --- |
| `varying vec2 v_uv;` | `in.uv` (provided) |
| `uniform float u_x;` | `uniforms: { u_x: 'f32' }` → `u.u_x` |
| `texture2D(tex, uv)` | `textureSample(tex, defaultSampler, uv)` |
| `gl_FragColor = c;` | `return c;` |
| `vec3(1.0)` | `vec3f(1.0)` |
| `float x = 1.0;` | `let x = 1.0;` (or `var` if reassigned) |
| `mix`, `dot`, `fract`, `pow`, … | same names |

## Compute shaders

For non-raster work use `figment.createComputePipeline` / `figment.dispatch`. Your WGSL declares its own bindings in the same order the pipeline is configured: uniforms at `@binding(0)`, then textures, then storage textures/buffers; the entry point defaults to `cs_main`. See the [figment API](/docs/custom-nodes/api#low-level-pipeline-api).
