/**
 * @name Sepia
 * @description Sepia filter on image.
 * @category image
 */

const sepiaIn = node.numberIn('sepia factor', 1.0, { min: 0.0, max: 2.0, step: 0.01 });

figment.createImageFilter(node, {
  label: 'sepia',
  uniforms: { u_factor: 'f32' },
  wgsl: `
    let color = textureSample(u_input_texture, defaultSampler, in.uv);
    let sepia = vec3f(1.2, 1.0, 0.8) * u.u_factor;
    let gray = vec3f(dot(color.rgb, vec3f(0.299, 0.587, 0.114)));
    let final_color = mix(gray, gray * sepia, vec3f(0.5));
    return vec4f(final_color, color.a);
  `,
  getUniforms: () => ({ u_factor: sepiaIn.value }),
});
