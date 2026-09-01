---
title: "Write a Generator Node"
description: "How to write an image generator node in Figment: produce solid colors and procedural gradients from scratch with createImageGenerator and WGSL."
---

# Write a generator node

Generator nodes produce images from nothing — no image input, just parameters. Use [`figment.createImageGenerator`](/docs/custom-nodes/api#createimagegenerator): like a filter, but you supply the output size via `getSize()`.

## Solid color

This is the full source of Figment's built-in **Constant** node:

```js
/**
 * @name Constant
 * @description Render a constant color.
 * @category image
 */

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

`colorIn` values are `[r, g, b, a]` with RGB in 0–255; `figment.colorToVec4` normalizes them to the 0–1 range shaders expect.

## Procedural gradient

`in.uv` runs from `(0, 0)` at the top-left to `(1, 1)` at the bottom-right, which makes gradients trivial:

```js
/**
 * @name Two Color Gradient
 * @description Render a vertical gradient between two colors.
 * @category image
 */

const topIn = node.colorIn('top color', [255, 60, 60, 1.0]);
const bottomIn = node.colorIn('bottom color', [20, 20, 120, 1.0]);
const widthIn = node.numberIn('width', 1024, { min: 1, max: 4096, step: 1 });
const heightIn = node.numberIn('height', 512, { min: 1, max: 4096, step: 1 });

figment.createImageGenerator(node, {
  label: 'gradient',
  uniforms: { u_top: 'vec4f', u_bottom: 'vec4f' },
  wgsl: `return mix(u.u_top, u.u_bottom, in.uv.y);`,
  getUniforms: () => ({
    u_top: figment.colorToVec4(topIn.value),
    u_bottom: figment.colorToVec4(bottomIn.value),
  }),
  getSize: () => ({ width: widthIn.value, height: heightIn.value }),
});
```

## Animating a generator

Parameters accept [expressions](/docs/expressions): right-click a number parameter and enter e.g. `$TIME % 1`, and the network re-renders it continuously. Alternatively set `node.timeDependent = true` in your node source and feed a time uniform yourself:

```js
node.timeDependent = true;
// …
getUniforms: () => ({ u_time: performance.now() / 1000 });
```
