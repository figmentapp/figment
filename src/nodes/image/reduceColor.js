/**
 * @name Reduce Color
 * @description Reduce the amount of colors of input image.
 * @category image
 */

const factorIn = node.numberIn('reduce colors', 2.0, { min: 0.0, max: 100.0, step: 0.1 });

figment.createImageFilter(node, {
  label: 'reduceColor',
  uniforms: { u_factor: 'f32' },
  wgsl: `
    let color = textureSample(u_input_texture, defaultSampler, in.uv);
    let col = floor(color.rgb * u.u_factor) / u.u_factor;
    return vec4f(col, 1.0);
  `,
  getUniforms: () => ({ u_factor: factorIn.value }),
});
