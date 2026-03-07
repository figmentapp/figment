/**
 * @name Solarize
 * @description Solarize filter on image.
 * @category image
 */

const thresholdIn = node.numberIn('threshold', 0.0, { min: 0.0, max: 1.5, step: 0.01 });

figment.createImageFilter(node, {
  label: 'solarize',
  uniforms: { u_threshold: 'f32' },
  wgsl: `
    let color = textureSample(u_input_texture, defaultSampler, in.uv);
    let solarized_color = clamp(color.rgb, vec3f(0.0), vec3f(1.0));
    let result = mix(solarized_color, 1.0 - solarized_color, step(vec3f(u.u_threshold), solarized_color));
    return vec4f(result, color.a);
  `,
  getUniforms: () => ({ u_threshold: thresholdIn.value }),
});
