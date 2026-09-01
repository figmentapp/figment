---
title: "Feedback Effects (Trails)"
description: "How to write feedback effects in Figment — trails, decay and motion accumulation using createFeedbackFilter and ping-pong render targets."
---

# Feedback effects (trails)

Feedback effects blend each new frame with the previous output — trails, decay, ghosting, simple simulations. [`figment.createFeedbackFilter`](/docs/custom-nodes/api#createfeedbackfilter) manages the ping-pong render targets; your shader reads the previous output as `u_feedback_texture` and the fresh input as `u_input_texture`.

This is the full source of Figment's built-in **Trail** node:

```js
/**
 * @name Trail
 * @description Don't erase the previous input image, creating a trail.
 * @category image
 */

const fadeParam = node.numberIn('fade', 0, { min: 0, max: 1, step: 0.01 });
const clearButtonIn = node.triggerButtonIn('clear');

const result = figment.createFeedbackFilter(node, {
  label: 'trail',
  uniforms: { u_fade: 'f32', u_seed: 'f32' },
  wgsl: `
    fn random(st: vec2f) -> f32 {
      return fract(sin(dot(st, vec2f(12.9898, 78.233))) * 43758.5453123);
    }

    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      var prev = textureSample(u_feedback_texture, defaultSampler, in.uv);
      let next = textureSample(u_input_texture, defaultSampler, in.uv);

      let fade = pow(u.u_fade, 4.0);
      let noise = random(in.uv + u.u_seed);

      if (noise < fade) {
        prev = vec4f(0.0);
      }

      let outA = next.a + prev.a * (1.0 - next.a);
      var outRGB = vec3f(0.0);
      if (outA > 0.0) {
        outRGB = (next.rgb * next.a + prev.rgb * prev.a * (1.0 - next.a)) / outA;
      }

      return vec4f(outRGB, outA);
    }
  `,
  getUniforms: () => ({ u_fade: fadeParam.value, u_seed: Math.random() }),
});

// The clear button resets the accumulated feedback by replacing the ping-pong pair.
clearButtonIn.onTrigger = () => {
  result.pp.destroy();
  result.pp = new figment.PingPongTarget();
};
```

How it works:

- Instead of fading uniformly (which leaves gray smears), the shader stochastically clears pixels: each pixel compares a per-frame random value against the fade amount.
- New input is composited **over** the previous frame with proper alpha ("over" operator).
- The helper's return value exposes `pp`, the [`PingPongTarget`](/docs/custom-nodes/api#images-rendertarget) — destroying and recreating it clears the trail.

## A minimal decay trail

The simplest possible feedback shader — bright pixels persist and fade out:

```js
/**
 * @name Decay
 * @description Fade out the previous frame, keeping bright pixels.
 * @category image
 */

const fadeIn = node.numberIn('fade', 0.05, { min: 0.001, max: 1, step: 0.001 });

figment.createFeedbackFilter(node, {
  label: 'decay',
  uniforms: { u_fade: 'f32' },
  wgsl: `
    let prev = textureSample(u_feedback_texture, defaultSampler, in.uv);
    let next = textureSample(u_input_texture, defaultSampler, in.uv);
    return max(next, prev - vec4f(vec3f(u.u_fade), 0.0));
  `,
  getUniforms: () => ({ u_fade: fadeIn.value }),
});
```

Pass `iterations: n` (or a function) to run the feedback shader multiple times per frame — useful for diffusion-style effects.
