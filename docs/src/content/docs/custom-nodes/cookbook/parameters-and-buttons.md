---
title: "Add Parameters & Buttons"
description: "How to add sliders, dropdowns, checkboxes, color pickers, file inputs and trigger buttons to a Figment custom node, and react to changes."
---

# Add parameters & buttons

Every input port you declare becomes either a widget in the parameter panel or a plug on the node ([full port reference](/docs/custom-nodes/ports)). This node demonstrates the common ones — it tints an image, with a button to reset the tint, a dropdown to pick a blend mode and a toggle to bypass the effect:

```js
/**
 * @name Tint Playground
 * @description Tint an image, demonstrating the different parameter types.
 * @category image
 */

const enabledIn = node.toggleIn('enabled', true);
const tintIn = node.colorIn('tint', [255, 160, 40, 1.0]);
const amountIn = node.numberIn('amount', 0.5, { min: 0, max: 1, step: 0.01 });
const modeIn = node.selectIn('mode', ['multiply', 'add', 'mix'], 'multiply');
const resetIn = node.triggerButtonIn('reset');

const MODES = { multiply: 0, add: 1, mix: 2 };

figment.createImageFilter(node, {
  label: 'tint',
  uniforms: { u_tint: 'vec4f', u_amount: 'f32', u_mode: 'i32', u_enabled: 'i32' },
  wgsl: `
    let c = textureSample(u_input_texture, defaultSampler, in.uv);
    if (u.u_enabled == 0) { return c; }
    var tinted = c.rgb;
    if (u.u_mode == 0) {
      tinted = c.rgb * u.u_tint.rgb;
    } else if (u.u_mode == 1) {
      tinted = c.rgb + u.u_tint.rgb;
    } else {
      tinted = u.u_tint.rgb;
    }
    return vec4f(mix(c.rgb, tinted, u.u_amount), c.a);
  `,
  getUniforms: () => ({
    u_tint: figment.colorToVec4(tintIn.value),
    u_amount: amountIn.value,
    u_mode: MODES[modeIn.value],
    u_enabled: enabledIn.value ? 1 : 0,
  }),
});

// Buttons fire onTrigger when clicked.
resetIn.onTrigger = () => {
  tintIn.set([255, 160, 40, 1.0]);
  amountIn.set(0.5);
};
```

Techniques worth noting:

- **Dropdowns → shader branches**: `selectIn` values are strings; map them to integers for the shader (`u_mode: 'i32'`).
- **Booleans → integers**: WGSL uniforms have no bool type here; pass `0`/`1` as `i32`.
- **Buttons**: `triggerButtonIn` + `port.onTrigger`. Calling `port.set(...)` on an input marks the node dirty, so the image updates immediately.
- **Reacting to edits**: assign `port.onChange = (oldValue, newValue) => { … }` when you need side effects (refetch data, rebuild a resource) — see [Call an API from a node](/docs/custom-nodes/cookbook/fetch-api-data).

## Showing a parameter as a plug too

Any parameter can also be exposed as a connection point, so other nodes can drive it:

```js
const playIn = node.toggleIn('play', true);
playIn.display = 0x03; // parameter (0x01) | plug (0x02)
```

## Expressions

Users can right-click any number parameter and type an [expression](/docs/expressions) like `$TIME % 1` or an OSC address — your node code doesn't change; `port.value` simply returns the evaluated result.
