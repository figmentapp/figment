---
title: "Write a Blur Node"
description: "How to write a blur node in Figment: a simple box blur custom node in ~15 lines of JavaScript + WGSL, plus a separable Gaussian blur."
---

# Write a blur node

A blur is the classic first image filter. In Figment, [`figment.createImageFilter`](/docs/custom-nodes/api#createimagefilter) handles ports, pipeline and lifecycle — you write a parameter and a WGSL snippet. This is the full source of Figment's built-in **Blur** node:

```js
/**
 * @name Blur
 * @description Blur an input image
 * @category image
 */

const blurIn = node.numberIn('amount', 0.005, { min: 0, max: 0.02, step: 0.001 });

figment.createImageFilter(node, {
  label: 'blur',
  uniforms: { u_step: 'f32' },
  wgsl: `
    let uv = in.uv;
    let s = u.u_step;

    let color =
      textureSample(u_input_texture, defaultSampler, uv + vec2f(-s, -s)) / 8.0 +
      textureSample(u_input_texture, defaultSampler, uv + vec2f(-s, 0.0)) / 8.0 +
      textureSample(u_input_texture, defaultSampler, uv + vec2f(-s, s)) / 8.0 +
      textureSample(u_input_texture, defaultSampler, uv + vec2f(0.0, -s)) / 8.0 +
      textureSample(u_input_texture, defaultSampler, uv + vec2f(0.0, 0.0)) / 8.0 +
      textureSample(u_input_texture, defaultSampler, uv + vec2f(0.0, s)) / 8.0 +
      textureSample(u_input_texture, defaultSampler, uv + vec2f(s, -s)) / 8.0 +
      textureSample(u_input_texture, defaultSampler, uv + vec2f(s, 0.0)) / 8.0 +
      textureSample(u_input_texture, defaultSampler, uv + vec2f(s, s)) / 8.0;

    return color;
  `,
  getUniforms: () => ({ u_step: blurIn.value }),
});
```

How it works:

- `numberIn` adds an **amount** slider (0–0.02, in UV units — resolution-independent).
- `uniforms: { u_step: 'f32' }` declares a uniform; `getUniforms` supplies its value every frame; the shader reads it as `u.u_step`.
- The WGSL snippet samples the input 9 times around the pixel and averages — a 3×3 box blur. Because it contains no `@fragment`, Figment wraps it in a fragment function where `in.uv` is available and the returned `vec4f` is the output color. See [Writing Shaders](/docs/custom-nodes/shaders).

## A better blur: Gaussian with resolution-aware sampling

For smoother results, weight the samples with a Gaussian kernel and step in pixel units. This version (Figment's **Gaussian Blur** node) also shows how to pass the input resolution as uniforms using the helper's return value:

```js
/**
 * @name Gaussian Blur
 * @description Gaussian blur using linear sampling.
 * @category image
 */

const factorIn = node.numberIn('factor', 0, { min: 0.0, max: 5.0, step: 0.01 });

const result = figment.createImageFilter(node, {
  label: 'gaussianBlur',
  uniforms: { u_factor: 'f32', u_rtx: 'f32', u_rty: 'f32' },
  wgsl: `
    const offsets = array<f32, 3>(0.0, 1.3846153846, 3.2307692308);
    const weights = array<f32, 3>(0.2270270270, 0.3162162162, 0.0702702703);

    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      let uv = in.uv;
      var col = textureSample(u_input_texture, defaultSampler, uv).rgb * weights[0];

      for (var i: i32 = 1; i < 3; i++) {
        col += textureSample(u_input_texture, defaultSampler, uv + vec2f(0.0, offsets[i] * u.u_factor / u.u_rty)).rgb * weights[i];
        col += textureSample(u_input_texture, defaultSampler, uv - vec2f(0.0, offsets[i] * u.u_factor / u.u_rty)).rgb * weights[i];
      }

      for (var i: i32 = 1; i < 3; i++) {
        col += textureSample(u_input_texture, defaultSampler, uv + vec2f(offsets[i] * u.u_factor / u.u_rtx, 0.0)).rgb * weights[i];
        col += textureSample(u_input_texture, defaultSampler, uv - vec2f(offsets[i] * u.u_factor / u.u_rtx, 0.0)).rgb * weights[i];
      }

      return vec4f(col / 2.0, 1.0);
    }
  `,
  getUniforms: () => {
    const img = result.inputPort.value;
    return {
      u_factor: factorIn.value,
      u_rtx: img.width,
      u_rty: img.height,
    };
  },
});
```

Note the full `@fragment` form: needed here because the shader declares module-level `const` arrays. `result.inputPort.value` is the incoming image (`width`/`height` available), used to convert pixel offsets to UVs.
