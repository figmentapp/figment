/**
 * @name Threshold
 * @description Change brightness threshold of input image.
 * @category image
 */

const thresholdIn = node.numberIn('threshold', 0.5, { min: 0, max: 1, step: 0.01 });

figment.createImageFilter(node, {
  label: 'threshold',
  uniforms: { u_threshold: 'f32' },
  wgsl: `
    let col = textureSample(u_input_texture, defaultSampler, in.uv).rgb;
    let brightness = 0.33333 * (col.r + col.g + col.b);
    let b = mix(0.0, 1.0, step(u.u_threshold, brightness));
    return vec4f(b, b, b, 1.0);
  `,
  getUniforms: () => ({ u_threshold: thresholdIn.value }),
});
