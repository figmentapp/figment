/**
 * @name Invert
 * @description Invert the colors of input image.
 * @category image
 */

figment.createImageFilter(node, {
  label: 'invert',
  wgsl: `
    let color = textureSample(u_input_texture, defaultSampler, in.uv);
    return vec4f(1.0 - color.rgb, color.a);
  `,
});
