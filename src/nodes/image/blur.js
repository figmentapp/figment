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
