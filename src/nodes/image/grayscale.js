/**
 * @name Grayscale
 * @description Grayscale conversion of input image.
 * @category image
 */

figment.createImageFilter(node, {
  label: 'grayscale',
  wgsl: `
    let color = textureSample(u_input_texture, defaultSampler, in.uv);
    let gray = dot(color.rgb, vec3f(0.299, 0.587, 0.114));
    return vec4f(gray, gray, gray, 1.0);
  `,
});
