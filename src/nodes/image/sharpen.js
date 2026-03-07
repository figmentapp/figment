/**
 * @name Sharpen
 * @description Sharpen an input image.
 * @category image
 */

const sharpenIn = node.numberIn('amount', 0.005, { min: 0, max: 0.1, step: 0.001 });

figment.createImageFilter(node, {
  label: 'sharpen',
  uniforms: { u_step: 'f32' },
  wgsl: `
    let uv = in.uv;
    let bot = 1.0 - u.u_step;
    let top = 1.0 + u.u_step;
    let cen = 1.0;

    let result = textureSample(u_input_texture, defaultSampler, uv) * 2.0
      - textureSample(u_input_texture, defaultSampler, uv * vec2f(bot, bot)) / 8.0
      - textureSample(u_input_texture, defaultSampler, uv * vec2f(cen, bot)) / 8.0
      - textureSample(u_input_texture, defaultSampler, uv * vec2f(top, bot)) / 8.0
      - textureSample(u_input_texture, defaultSampler, uv * vec2f(bot, cen)) / 8.0
      - textureSample(u_input_texture, defaultSampler, uv * vec2f(top, cen)) / 8.0
      - textureSample(u_input_texture, defaultSampler, uv * vec2f(bot, top)) / 8.0
      - textureSample(u_input_texture, defaultSampler, uv * vec2f(cen, top)) / 8.0
      - textureSample(u_input_texture, defaultSampler, uv * vec2f(top, top)) / 8.0;

    return result;
  `,
  getUniforms: () => ({ u_step: sharpenIn.value }),
});
