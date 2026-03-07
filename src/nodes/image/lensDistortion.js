/**
 * @name Lens Distortion
 * @description Distort an image using a lens distortion shader.
 * @category image
 */

const k1In = node.numberIn('k1', 0.0, { min: -10, max: 10, step: 0.01 });
const k2In = node.numberIn('k2', 0.0, { min: -10, max: 10, step: 0.01 });
const offsetXIn = node.numberIn('offsetX', 0.0, { min: -1, max: 1, step: 0.01 });
const offsetYIn = node.numberIn('offsetY', 0.0, { min: -1, max: 1, step: 0.01 });

figment.createImageFilter(node, {
  label: 'lensDistortion',
  uniforms: { u_k1: 'f32', u_k2: 'f32', u_offset: 'vec2f' },
  wgsl: `
    let t = in.uv - 0.5;
    let r2 = t.x * t.x + t.y * t.y;
    var f = 0.0;

    if (u.u_k2 == 0.0) {
      f = 1.0 + r2 * u.u_k1;
    } else {
      f = 1.0 + r2 * (u.u_k1 + u.u_k2 * sqrt(r2));
    }
    let distorted_uv = f * t + 0.5 + u.u_offset;
    if (distorted_uv.x < 0.0 || distorted_uv.x > 1.0 || distorted_uv.y < 0.0 || distorted_uv.y > 1.0) {
      return vec4f(0.0, 0.0, 0.0, 0.0);
    }

    let col = textureSampleLevel(u_input_texture, defaultSampler, distorted_uv, 0.0).rgb;
    return vec4f(col, 1.0);
  `,
  getUniforms: () => ({
    u_k1: k1In.value,
    u_k2: k2In.value,
    u_offset: [offsetXIn.value, offsetYIn.value],
  }),
});
