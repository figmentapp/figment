/**
 * @name Chroma Key
 * @description Make pixels of a certain color transparent, like green screen effect.
 * @category image
 */

const colorIn = node.colorIn('key color', [0, 255, 0]);
const thresholdIn = node.numberIn('threshold', 0.4, { min: 0.0, max: 1.0, step: 0.01 });

figment.createImageFilter(node, {
  label: 'chromaKey',
  uniforms: { u_keyColor: 'vec3f', u_threshold: 'f32' },
  wgsl: `
    var color = textureSample(u_input_texture, defaultSampler, in.uv);
    let difference = length(color.rgb - u.u_keyColor);
    if (difference < u.u_threshold) {
      color.a = 0.0;
    }
    return color;
  `,
  getUniforms: () => ({
    u_keyColor: figment.colorToVec3(colorIn.value),
    u_threshold: thresholdIn.value,
  }),
});
